const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const ARC_TESTNET_CHAIN_ID = 5_042_002;
const OFFICIAL_ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const deploymentPath = path.join(__dirname, "..", "deployment", "arc-testnet.json");

function assertEqual(label, actual, expected) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
  }
}

async function main() {
  const current = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const outputPath = path.join(__dirname, "..", "deployment", "arcTestnet-v2.local.json");
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
  console.log(`V2 preflight passed for ${deployer.address}. Existing fees and creator profiles will be preserved.`);

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
  console.log(`V2 factory deployment submitted: ${factory.deploymentTransaction().hash}`);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const activation = await registry.setFactory(factoryAddress);
  console.log(`Registry activation submitted: ${activation.hash}`);
  await activation.wait();
  assertEqual("activated registry factory", await registry.factory(), factoryAddress);

  const output = {
    ...current,
    contracts: { ...current.contracts, factory: factoryAddress },
    legacyFactories: [current.contracts.factory, ...(current.legacyFactories ?? [])],
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    status: "V2_CANDIDATE_DEPLOYED",
    migration: {
      type: "FACTORY_ONLY",
      preservesFeeVault: true,
      preservesCreatorRegistry: true,
      previousFactory: current.contracts.factory,
      registryActivationTx: activation.hash,
    },
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`V2 candidate manifest written to ${outputPath}`);
  console.log(`V2 Factory: ${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
