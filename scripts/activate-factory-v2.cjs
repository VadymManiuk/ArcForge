const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const ARC_TESTNET_CHAIN_ID = 5_042_002;
const candidatePath = path.join(__dirname, "..", "deployment", "arcTestnet-v2.local.json");

function assertEqual(label, actual, expected) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
  }
}

async function main() {
  if (!fs.existsSync(candidatePath)) throw new Error(`V2 candidate manifest not found at ${candidatePath}.`);
  const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  if (candidate.status !== "V2_CANDIDATE_DEPLOYED") {
    throw new Error(`Candidate status must be V2_CANDIDATE_DEPLOYED, received ${candidate.status}.`);
  }
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is required; no deployer account is configured.");
  const network = await hre.ethers.provider.getNetwork();
  assertEqual("chain ID", network.chainId, ARC_TESTNET_CHAIN_ID);
  assertEqual("deployer", deployer.address, candidate.deployer);

  const registry = await hre.ethers.getContractAt("ArcForgeCreatorRegistry", candidate.contracts.creatorRegistry);
  const factory = await hre.ethers.getContractAt("ArcForgeFactory", candidate.contracts.factory);
  const [registryOwner, activeFactory, factoryOwner, factoryUsdc, factoryVault, factoryRegistry] = await Promise.all([
    registry.owner(),
    registry.factory(),
    factory.owner(),
    factory.usdc(),
    factory.feeVault(),
    factory.creatorRegistry(),
  ]);
  assertEqual("registry owner", registryOwner, deployer.address);
  assertEqual("current registry factory", activeFactory, candidate.migration.previousFactory);
  assertEqual("V2 factory owner", factoryOwner, deployer.address);
  assertEqual("V2 factory USDC", factoryUsdc, candidate.contracts.usdc);
  assertEqual("V2 factory vault", factoryVault, candidate.contracts.feeVault);
  assertEqual("V2 factory registry", factoryRegistry, candidate.contracts.creatorRegistry);
  console.log(`V2 activation preflight passed for ${candidate.contracts.factory}.`);

  if (process.env.DEPLOY_PREFLIGHT_ONLY === "true") {
    console.log("Preflight-only mode complete. The registry was not changed.");
    return;
  }

  const activation = await registry.setFactory(candidate.contracts.factory);
  console.log(`Registry activation submitted: ${activation.hash}`);
  await activation.wait();
  assertEqual("activated registry factory", await registry.factory(), candidate.contracts.factory);
  candidate.status = "V2_ACTIVE";
  candidate.migration.registryActivationTx = activation.hash;
  candidate.migration.activatedAt = new Date().toISOString();
  fs.writeFileSync(candidatePath, JSON.stringify(candidate, null, 2));
  console.log(`V2 Factory activated: ${candidate.contracts.factory}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
