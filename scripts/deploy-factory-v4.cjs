const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const ARC_TESTNET_CHAIN_ID = 5_042_002;
const OFFICIAL_ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const EXPECTED_GRADUATION_MULTIPLIER = 4n;
const EXPECTED_CREATOR_FEE_SHARE_BPS = 7_000n;
const deploymentPath = path.join(__dirname, "..", "deployment", "arc-testnet.json");
const outputPath = path.join(__dirname, "..", "deployment", "arcTestnet-v4.local.json");

function assertEqual(label, actual, expected) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
  }
}

async function main() {
  const current = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (fs.existsSync(outputPath) && process.env.DEPLOY_PREFLIGHT_ONLY !== "true") {
    throw new Error(`Refusing to overwrite existing candidate manifest at ${outputPath}.`);
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is required; no deployer account is configured.");
  const network = await hre.ethers.provider.getNetwork();
  assertEqual("chain ID", network.chainId, ARC_TESTNET_CHAIN_ID);
  assertEqual("deployer", deployer.address, current.deployer);
  assertEqual("USDC", current.contracts.usdc, OFFICIAL_ARC_TESTNET_USDC);

  const registry = await hre.ethers.getContractAt("ArcForgeCreatorRegistry", current.contracts.creatorRegistry);
  const vault = await hre.ethers.getContractAt("ArcForgeFeeVault", current.contracts.feeVault);
  const currentFactory = await hre.ethers.getContractAt("ArcForgeFactory", current.contracts.factory);
  const [registryOwner, activeFactory, vaultOwner, factoryOwner, factoryUsdc, nativeBalance] = await Promise.all([
    registry.owner(),
    registry.factory(),
    vault.owner(),
    currentFactory.owner(),
    currentFactory.usdc(),
    hre.ethers.provider.getBalance(deployer.address),
  ]);
  assertEqual("registry owner", registryOwner, deployer.address);
  assertEqual("active registry factory", activeFactory, current.contracts.factory);
  assertEqual("vault owner", vaultOwner, deployer.address);
  assertEqual("factory owner", factoryOwner, deployer.address);
  assertEqual("factory USDC", factoryUsdc, current.contracts.usdc);
  if (nativeBalance === 0n) throw new Error("The deployer has no native Arc Testnet USDC for gas.");
  console.log(`V4 preflight passed for ${deployer.address}. Existing factories and balances will be preserved.`);

  if (process.env.DEPLOY_PREFLIGHT_ONLY === "true") {
    console.log("Preflight-only mode complete. No deployment transactions were sent.");
    return;
  }

  const Factory = await hre.ethers.getContractFactory("ArcForgeFactory");
  const factory = await Factory.deploy(
    deployer.address,
    current.contracts.usdc,
    current.contracts.feeVault,
    current.contracts.creatorRegistry,
    await currentFactory.launchFee(),
  );
  const deploymentTransaction = factory.deploymentTransaction();
  console.log(`V4 factory deployment submitted: ${deploymentTransaction.hash}`);
  const receipt = await deploymentTransaction.wait();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  assertEqual("graduation multiplier", await factory.GRADUATION_RESERVE_MULTIPLIER(), EXPECTED_GRADUATION_MULTIPLIER);
  assertEqual("creator fee share", await factory.CREATOR_FEE_SHARE_BPS(), EXPECTED_CREATOR_FEE_SHARE_BPS);
  assertEqual("registry remains on previous factory", await registry.factory(), current.contracts.factory);

  const output = {
    ...current,
    contracts: { ...current.contracts, factory: factoryAddress },
    legacyFactories: Array.from(new Set([current.contracts.factory, ...(current.legacyFactories ?? [])])),
    deployedAt: new Date().toISOString(),
    status: "V4_CANDIDATE_DEPLOYED",
    curveModel: {
      version: 4,
      virtualUsdcReserve: 2_500,
      graduationThreshold: 10_000,
      curveInventorySoldPercent: 80,
      permanentLiquidityTvl: 20_000,
      creatorFeeShareBps: 7_000,
      protocolFeeShareBps: 3_000,
      postGraduationVenue: "ARCFORGE_PERMANENT_AMM",
    },
    migration: {
      type: "FACTORY_ONLY",
      preservesFeeVault: true,
      preservesCreatorRegistry: true,
      previousFactory: current.contracts.factory,
      factoryDeploymentTx: deploymentTransaction.hash,
      factoryDeploymentBlock: receipt.blockNumber,
      registryActivationTx: null,
    },
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`V4 candidate manifest written to ${outputPath}`);
  console.log(`V4 Factory: ${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
