const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const ARC_TESTNET_CHAIN_ID = 5_042_002;
const OFFICIAL_ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";

async function validateDeploymentInputs(deployer, usdcAddress, feeRecipient) {
  const network = await hre.ethers.provider.getNetwork();
  if (Number(network.chainId) !== ARC_TESTNET_CHAIN_ID) {
    throw new Error(`Expected Arc Testnet chain ID ${ARC_TESTNET_CHAIN_ID}, received ${network.chainId}.`);
  }
  if (!hre.ethers.isAddress(usdcAddress) || !hre.ethers.isAddress(feeRecipient)) {
    throw new Error("ARC_USDC_ADDRESS and FEE_RECIPIENT must be valid EVM addresses.");
  }
  if (usdcAddress.toLowerCase() !== OFFICIAL_ARC_TESTNET_USDC.toLowerCase()) {
    throw new Error(`Refusing unknown Arc Testnet USDC address. Expected ${OFFICIAL_ARC_TESTNET_USDC}.`);
  }
  const code = await hre.ethers.provider.getCode(usdcAddress);
  if (code === "0x") throw new Error("No contract bytecode found at the configured USDC address.");

  const usdc = new hre.ethers.Contract(
    usdcAddress,
    ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
    hre.ethers.provider,
  );
  const [decimals, symbol, deployerBalance] = await Promise.all([
    usdc.decimals(),
    usdc.symbol(),
    hre.ethers.provider.getBalance(deployer.address),
  ]);
  if (decimals !== 6n || symbol !== "USDC") {
    throw new Error(`Unexpected token at USDC address: symbol=${symbol}, decimals=${decimals}.`);
  }
  if (deployerBalance === 0n) {
    throw new Error("The deployer has no native Arc Testnet USDC for gas.");
  }
  console.log(`Preflight passed for deployer ${deployer.address} with ${hre.ethers.formatEther(deployerBalance)} native USDC.`);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is required; no deployer account is configured.");
  const usdcAddress = process.env.ARC_USDC_ADDRESS || OFFICIAL_ARC_TESTNET_USDC;
  const feeRecipient = process.env.FEE_RECIPIENT;
  if (!feeRecipient) throw new Error("FEE_RECIPIENT is required; refusing to deploy with a placeholder.");
  await validateDeploymentInputs(deployer, usdcAddress, feeRecipient);
  if (process.env.DEPLOY_PREFLIGHT_ONLY === "true") {
    console.log("Preflight-only mode complete. No deployment transactions were sent.");
    return;
  }

  const Vault = await hre.ethers.getContractFactory("ArcForgeFeeVault");
  const vault = await Vault.deploy(deployer.address, feeRecipient);
  await vault.waitForDeployment();
  const Registry = await hre.ethers.getContractFactory("ArcForgeCreatorRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();
  const Factory = await hre.ethers.getContractFactory("ArcForgeFactory");
  const factory = await Factory.deploy(
    deployer.address,
    usdcAddress,
    await vault.getAddress(),
    await registry.getAddress(),
    25n * 10n ** 6n,
  );
  await factory.waitForDeployment();
  await (await registry.setFactory(await factory.getAddress())).wait();

  const output = {
    network: hre.network.name,
    chainId: ARC_TESTNET_CHAIN_ID,
    contracts: {
      feeVault: await vault.getAddress(),
      creatorRegistry: await registry.getAddress(),
      factory: await factory.getAddress(),
      usdc: usdcAddress,
    },
    deployer: deployer.address,
    feeRecipient,
    deployedAt: new Date().toISOString(),
    explorerBaseUrl: "https://testnet.arcscan.app",
    status: "DEPLOYED",
  };
  const file = path.join(__dirname, "..", "deployment", `${hre.network.name}.local.json`);
  fs.writeFileSync(file, JSON.stringify(output, null, 2));
  console.log(`Deployment manifest written to ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
