const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = 10n ** 6n;
const TOKEN = 10n ** 18n;
const LAUNCH_FEE = 25n * USDC;

async function deployPlatform() {
  const [owner, creator, trader, recipient, stranger] = await ethers.getSigners();
  const Usdc = await ethers.getContractFactory("MockUSDC");
  const usdc = await Usdc.deploy();
  const Vault = await ethers.getContractFactory("ArcForgeFeeVault");
  const vault = await Vault.deploy(owner.address, recipient.address);
  const Registry = await ethers.getContractFactory("ArcForgeCreatorRegistry");
  const registry = await Registry.deploy(owner.address);
  const Factory = await ethers.getContractFactory("ArcForgeFactory");
  const factory = await Factory.deploy(
    owner.address,
    await usdc.getAddress(),
    await vault.getAddress(),
    await registry.getAddress(),
    LAUNCH_FEE,
  );
  await registry.setFactory(await factory.getAddress());
  await usdc.mint(creator.address, 1_000_000n * USDC);
  await usdc.mint(trader.address, 1_000_000n * USDC);
  return { owner, creator, trader, recipient, stranger, usdc, vault, registry, factory };
}

function launchParams(overrides = {}) {
  return {
    name: "Forge Token",
    symbol: "FORGE",
    metadataURI: "ipfs://forge-metadata",
    totalSupply: 1_000_000_000n * TOKEN,
    creatorAllocationBps: 500,
    virtualUsdcReserve: 10_000n * USDC,
    graduationThreshold: 50_000n * USDC,
    ...overrides,
  };
}

async function launch(platform, overrides = {}) {
  const { creator, usdc, factory } = platform;
  await usdc.connect(creator).approve(await factory.getAddress(), LAUNCH_FEE);
  const tx = await factory.connect(creator).launchToken(launchParams(overrides));
  const receipt = await tx.wait();
  const parsed = receipt.logs
    .map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } })
    .find((event) => event?.name === "TokenLaunched");
  return {
    token: await ethers.getContractAt("ArcForgeToken", parsed.args.token),
    curve: await ethers.getContractAt("ArcForgeBondingCurve", parsed.args.curve),
    tx,
  };
}

describe("ArcForgeFactory and ArcForgeToken", function () {
  it("launches a fixed-supply token, funds its curve, records the creator, and collects the launch fee", async function () {
    const platform = await deployPlatform();
    const { creator, factory, registry, vault, usdc } = platform;
    const params = launchParams();

    const { token, curve, tx } = await launch(platform);
    const creatorAllocation = params.totalSupply * 500n / 10_000n;
    const curveAllocation = params.totalSupply - creatorAllocation;

    await expect(tx).to.emit(factory, "TokenLaunched");
    expect(await token.totalSupply()).to.equal(params.totalSupply);
    expect(await token.balanceOf(creator.address)).to.equal(creatorAllocation);
    expect(await token.balanceOf(await curve.getAddress())).to.equal(curveAllocation);
    expect(await token.metadataURI()).to.equal("ipfs://forge-metadata");
    expect(token.interface.fragments.some((fragment) => fragment.name === "mint")).to.equal(false);
    expect((await registry.getCreatorProfile(creator.address)).launchCount).to.equal(1);
    expect(await vault.getFeeTotal(await usdc.getAddress(), ethers.keccak256(ethers.toUtf8Bytes("LAUNCH_FEE"))))
      .to.equal(LAUNCH_FEE);
  });

  it("rejects invalid names, symbols, and creator allocations", async function () {
    const platform = await deployPlatform();
    const { creator, usdc, factory } = platform;
    await usdc.connect(creator).approve(await factory.getAddress(), LAUNCH_FEE * 3n);
    await expect(factory.connect(creator).launchToken(launchParams({ name: "" }))).to.be.revertedWithCustomError(factory, "EmptyName");
    await expect(factory.connect(creator).launchToken(launchParams({ symbol: "" }))).to.be.revertedWithCustomError(factory, "EmptySymbol");
    await expect(factory.connect(creator).launchToken(launchParams({ name: "N".repeat(65) }))).to.be.revertedWithCustomError(factory, "NameTooLong");
    await expect(factory.connect(creator).launchToken(launchParams({ symbol: "SYMBOL-LONG" }))).to.be.revertedWithCustomError(factory, "SymbolTooLong");
    await expect(factory.connect(creator).launchToken(launchParams({ metadataURI: `ipfs://${"x".repeat(506)}` }))).to.be.revertedWithCustomError(factory, "MetadataURITooLong");
    await expect(factory.connect(creator).launchToken(launchParams({ creatorAllocationBps: 2001 })))
      .to.be.revertedWithCustomError(factory, "InvalidAllocation");
  });
});

describe("ArcForgeBondingCurve", function () {
  it("quotes and executes buys and sells while collecting transparent fees", async function () {
    const platform = await deployPlatform();
    const { trader, usdc, vault } = platform;
    const { token, curve } = await launch(platform);
    const amountIn = 1_000n * USDC;
    const [quotedTokens, buyFee] = await curve.quoteBuy(amountIn);
    expect(quotedTokens).to.be.greaterThan(0);
    expect(buyFee).to.equal(10n * USDC);

    await usdc.connect(trader).approve(await curve.getAddress(), amountIn);
    await expect(curve.connect(trader).buy(amountIn, quotedTokens)).to.emit(curve, "TokenBought");
    expect(await token.balanceOf(trader.address)).to.equal(quotedTokens);
    expect(await vault.getFeeTotal(await usdc.getAddress(), ethers.keccak256(ethers.toUtf8Bytes("BUY_FEE"))))
      .to.equal(buyFee);

    const tokenIn = quotedTokens / 2n;
    const [quotedUsdc, sellFee] = await curve.quoteSell(tokenIn);
    await token.connect(trader).approve(await curve.getAddress(), tokenIn);
    await expect(curve.connect(trader).sell(tokenIn, quotedUsdc)).to.emit(curve, "TokenSold");
    expect(quotedUsdc).to.be.greaterThan(0);
    expect(await vault.getFeeTotal(await usdc.getAddress(), ethers.keccak256(ethers.toUtf8Bytes("SELL_FEE"))))
      .to.equal(sellFee);
  });

  it("enforces amount and slippage checks", async function () {
    const platform = await deployPlatform();
    const { trader, usdc } = platform;
    const { token, curve } = await launch(platform);
    await expect(curve.connect(trader).buy(0, 0)).to.be.revertedWithCustomError(curve, "ZeroAmount");
    const amount = 100n * USDC;
    const [quote] = await curve.quoteBuy(amount);
    await usdc.connect(trader).approve(await curve.getAddress(), amount);
    await expect(curve.connect(trader).buy(amount, quote + 1n)).to.be.revertedWithCustomError(curve, "SlippageExceeded");
    await expect(curve.connect(trader).sell(0, 0)).to.be.revertedWithCustomError(curve, "ZeroAmount");
    await expect(curve.connect(trader).sell(TOKEN, 0)).to.be.reverted;
    expect(await token.balanceOf(trader.address)).to.equal(0);
  });

  it("refuses a buy that would round the token reserve to zero", async function () {
    const platform = await deployPlatform();
    const { trader, usdc } = platform;
    const { curve } = await launch(platform);
    const excessiveInput = 10n ** 40n;
    await usdc.mint(trader.address, excessiveInput);
    await usdc.connect(trader).approve(await curve.getAddress(), excessiveInput);
    const [quote] = await curve.quoteBuy(excessiveInput);
    expect(quote).to.equal(0);
    await expect(curve.connect(trader).buy(excessiveInput, 0)).to.be.revertedWithCustomError(curve, "SlippageExceeded");
  });

  it("graduates at the configured net-USDC threshold", async function () {
    const platform = await deployPlatform();
    const { trader, usdc } = platform;
    const { token, curve } = await launch(platform, { graduationThreshold: 99n * USDC });
    const amount = 100n * USDC;
    const [quote] = await curve.quoteBuy(amount);
    await usdc.connect(trader).approve(await curve.getAddress(), amount);
    await expect(curve.connect(trader).buy(amount, quote)).to.emit(curve, "CurveGraduated");
    expect(await curve.isGraduated()).to.equal(true);
    await expect(curve.connect(trader).buy(amount, 0)).to.be.revertedWithCustomError(curve, "AlreadyGraduated");
    const tokensToSell = quote / 2n;
    const [usdcOut] = await curve.quoteSell(tokensToSell);
    await token.connect(trader).approve(await curve.getAddress(), tokensToSell);
    await expect(curve.connect(trader).sell(tokensToSell, usdcOut)).to.emit(curve, "TokenSold");
    expect(usdcOut).to.be.greaterThan(0);
  });
});

describe("ArcForgeFeeVault", function () {
  it("records real fees, withdraws to the recipient, and rejects unauthorized withdrawals", async function () {
    const { owner, creator, recipient, stranger, usdc, vault } = await deployPlatform();
    const fee = 75n * USDC;
    const feeType = ethers.keccak256(ethers.toUtf8Bytes("TEST_FEE"));
    await usdc.connect(creator).approve(await vault.getAddress(), fee);
    await expect(vault.connect(creator).collectFee(await usdc.getAddress(), creator.address, feeType, fee))
      .to.emit(vault, "FeeReceived");
    await expect(vault.connect(stranger).withdraw(await usdc.getAddress(), fee))
      .to.be.revertedWithCustomError(vault, "Unauthorized");
    await expect(vault.connect(owner).withdraw(await usdc.getAddress(), fee)).to.emit(vault, "FeeWithdrawn");
    expect(await usdc.balanceOf(recipient.address)).to.equal(fee);
  });
});

describe("ArcForgeCreatorRegistry", function () {
  it("registers and lets a creator update metadata", async function () {
    const { creator, registry } = await deployPlatform();
    await expect(registry.connect(creator).registerCreator("ipfs://profile")).to.emit(registry, "CreatorRegistered");
    await expect(registry.connect(creator).updateCreatorMetadata("ipfs://profile-v2")).to.emit(registry, "CreatorUpdated");
    expect((await registry.getCreatorProfile(creator.address)).metadataURI).to.equal("ipfs://profile-v2");
  });
});
