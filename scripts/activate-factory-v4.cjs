const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

const ARC_TESTNET_CHAIN_ID = 5_042_002;
const EXPECTED_GRADUATION_MULTIPLIER = 4n;
const EXPECTED_CREATOR_FEE_SHARE_BPS = 7_000n;
const candidatePath = path.join(__dirname, "..", "deployment", "arcTestnet-v4.local.json");
const deploymentPath = path.join(__dirname, "..", "deployment", "arc-testnet.json");

function assertEqual(label, actual, expected) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
  }
}

async function main() {
  if (!fs.existsSync(candidatePath)) throw new Error(`V4 candidate manifest not found at ${candidatePath}.`);
  const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  const current = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (candidate.status !== "V4_CANDIDATE_DEPLOYED") {
    throw new Error(`Candidate status must be V4_CANDIDATE_DEPLOYED, received ${candidate.status}.`);
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is required; no deployer account is configured.");
  const network = await hre.ethers.provider.getNetwork();
  assertEqual("chain ID", network.chainId, ARC_TESTNET_CHAIN_ID);
  assertEqual("deployer", deployer.address, candidate.deployer);
  assertEqual("manifest current factory", current.contracts.factory, candidate.migration.previousFactory);

  const registry = await hre.ethers.getContractAt("ArcForgeCreatorRegistry", candidate.contracts.creatorRegistry);
  const factory = await hre.ethers.getContractAt("ArcForgeFactory", candidate.contracts.factory);
  const [registryOwner, activeFactory, factoryOwner, factoryUsdc, factoryVault, factoryRegistry, multiplier, creatorShare] =
    await Promise.all([
      registry.owner(),
      registry.factory(),
      factory.owner(),
      factory.usdc(),
      factory.feeVault(),
      factory.creatorRegistry(),
      factory.GRADUATION_RESERVE_MULTIPLIER(),
      factory.CREATOR_FEE_SHARE_BPS(),
    ]);
  assertEqual("registry owner", registryOwner, deployer.address);
  assertEqual("current registry factory", activeFactory, candidate.migration.previousFactory);
  assertEqual("V4 factory owner", factoryOwner, deployer.address);
  assertEqual("V4 factory USDC", factoryUsdc, candidate.contracts.usdc);
  assertEqual("V4 factory vault", factoryVault, candidate.contracts.feeVault);
  assertEqual("V4 factory registry", factoryRegistry, candidate.contracts.creatorRegistry);
  assertEqual("V4 graduation multiplier", multiplier, EXPECTED_GRADUATION_MULTIPLIER);
  assertEqual("V4 creator fee share", creatorShare, EXPECTED_CREATOR_FEE_SHARE_BPS);
  console.log(`V4 activation preflight passed for ${candidate.contracts.factory}.`);

  if (process.env.DEPLOY_PREFLIGHT_ONLY === "true") {
    console.log("Preflight-only mode complete. The registry and production manifest were not changed.");
    return;
  }

  const activation = await registry.setFactory(candidate.contracts.factory);
  console.log(`Registry activation submitted: ${activation.hash}`);
  const receipt = await activation.wait();
  assertEqual("activated registry factory", await registry.factory(), candidate.contracts.factory);
  candidate.status = "V4_ACTIVE";
  candidate.migration.registryActivationTx = activation.hash;
  candidate.migration.registryActivationBlock = receipt.blockNumber;
  candidate.migration.activatedAt = new Date().toISOString();
  fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
  fs.writeFileSync(deploymentPath, `${JSON.stringify(candidate, null, 2)}\n`);
  console.log(`V4 Factory activated and production manifest updated: ${candidate.contracts.factory}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
