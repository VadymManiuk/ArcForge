const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const usdcAddress = process.env.ARC_USDC_ADDRESS;
  const feeRecipient = process.env.FEE_RECIPIENT;
  if (!usdcAddress || !feeRecipient) {
    throw new Error("ARC_USDC_ADDRESS and FEE_RECIPIENT are required; refusing to deploy with placeholders.");
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
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
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
