// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ArcForgeFeeVault} from "./ArcForgeFeeVault.sol";

/// @notice A simple virtual-USDC-reserve constant-product curve.
contract ArcForgeBondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint16 public constant CREATOR_FEE_SHARE_BPS = 7_000;
    address public constant PERMANENT_LIQUIDITY_LOCK = 0x000000000000000000000000000000000000dEaD;
    bytes32 public constant BUY_FEE = keccak256("BUY_FEE");
    bytes32 public constant SELL_FEE = keccak256("SELL_FEE");

    IERC20 public immutable token;
    IERC20 public immutable usdc;
    ArcForgeFeeVault public immutable feeVault;
    address public immutable creatorFeeRecipient;
    uint256 public immutable initialTokenReserve;
    uint256 public immutable virtualUsdcReserve;
    uint256 public immutable graduationThreshold;
    uint16 public immutable buyFeeBps;
    uint16 public immutable sellFeeBps;

    uint256 public tokenReserve;
    uint256 public usdcReserve;
    uint256 public tokensSoldAtGraduation;
    uint256 public totalCreatorFees;
    uint256 public totalProtocolFees;
    bool private graduated;

    event TokenBought(address indexed buyer, uint256 usdcIn, uint256 tokensOut, uint256 fee);
    event TokenSold(address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 fee);
    event FeeCollected(address indexed payer, bytes32 indexed feeType, uint256 amount);
    event FeeSplit(
        address indexed payer,
        bytes32 indexed feeType,
        address indexed creator,
        uint256 creatorAmount,
        uint256 protocolAmount
    );
    event CurveGraduated(uint256 raisedUsdc, uint256 tokensSold);
    event PermanentLiquidityActivated(uint256 usdcLiquidity, uint256 tokenLiquidity, uint256 lockedTokens);

    error ZeroAddress();
    error InvalidConfiguration();
    error ZeroAmount();
    error SlippageExceeded();
    error InsufficientLiquidity();
    error GraduationThresholdExceeded(uint256 maxUsdcAmount);
    error ReserveNotFunded();

    constructor(
        address token_,
        address usdc_,
        address feeVault_,
        address creatorFeeRecipient_,
        uint256 tokenReserve_,
        uint256 virtualUsdcReserve_,
        uint256 graduationThreshold_,
        uint16 buyFeeBps_,
        uint16 sellFeeBps_
    ) {
        if (
            token_ == address(0) || usdc_ == address(0) || feeVault_ == address(0) ||
            creatorFeeRecipient_ == address(0)
        ) revert ZeroAddress();
        if (
            tokenReserve_ == 0 || virtualUsdcReserve_ == 0 || graduationThreshold_ == 0 ||
            buyFeeBps_ > 1_000 || sellFeeBps_ > 1_000
        ) revert InvalidConfiguration();
        token = IERC20(token_);
        usdc = IERC20(usdc_);
        feeVault = ArcForgeFeeVault(feeVault_);
        creatorFeeRecipient = creatorFeeRecipient_;
        initialTokenReserve = tokenReserve_;
        tokenReserve = tokenReserve_;
        virtualUsdcReserve = virtualUsdcReserve_;
        graduationThreshold = graduationThreshold_;
        buyFeeBps = buyFeeBps_;
        sellFeeBps = sellFeeBps_;
    }

    function quoteBuy(uint256 usdcAmount) public view returns (uint256 tokensOut, uint256 fee) {
        if (usdcAmount == 0) return (0, 0);
        if (!graduated && usdcAmount > maxBuyAmount()) return (0, 0);
        fee = usdcAmount * buyFeeBps / BPS;
        uint256 netAmount = usdcAmount - fee;
        uint256 currentUsdc = _effectiveUsdcReserve();
        // Round the remaining reserve up so integer truncation can never give a buyer extra inventory.
        uint256 newTokenReserve = Math.mulDiv(
            currentUsdc, tokenReserve, currentUsdc + netAmount, Math.Rounding.Ceil
        );
        if (newTokenReserve == 0) return (0, fee);
        tokensOut = tokenReserve - newTokenReserve;
    }

    function quoteSell(uint256 tokenAmount) public view returns (uint256 usdcOut, uint256 fee) {
        if (tokenAmount == 0) return (0, 0);
        uint256 currentUsdc = _effectiveUsdcReserve();
        // Round the remaining reserve up. Flooring here would let a dust token sale receive
        // one whole USDC base unit even when its economic value is below that unit.
        uint256 newUsdc = Math.mulDiv(
            currentUsdc, tokenReserve, tokenReserve + tokenAmount, Math.Rounding.Ceil
        );
        uint256 grossOut = currentUsdc - newUsdc;
        if (grossOut > usdcReserve) return (0, 0);
        fee = grossOut * sellFeeBps / BPS;
        usdcOut = grossOut - fee;
    }

    function buy(uint256 usdcAmount, uint256 minTokensOut) external nonReentrant returns (uint256 tokensOut) {
        if (usdcAmount == 0) revert ZeroAmount();
        if (!graduated) {
            uint256 maximum = maxBuyAmount();
            if (usdcAmount > maximum) revert GraduationThresholdExceeded(maximum);
        }
        if (token.balanceOf(address(this)) < tokenReserve) revert ReserveNotFunded();
        uint256 fee;
        (tokensOut, fee) = quoteBuy(usdcAmount);
        if (tokensOut == 0 || tokensOut < minTokensOut) revert SlippageExceeded();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        uint256 netAmount = usdcAmount - fee;
        usdcReserve += netAmount;
        tokenReserve -= tokensOut;
        _distributeFee(msg.sender, BUY_FEE, fee);
        token.safeTransfer(msg.sender, tokensOut);
        emit TokenBought(msg.sender, usdcAmount, tokensOut, fee);
        _checkGraduation();
    }

    function sell(uint256 tokenAmount, uint256 minUsdcOut) external nonReentrant returns (uint256 usdcOut) {
        if (tokenAmount == 0) revert ZeroAmount();
        uint256 fee;
        (usdcOut, fee) = quoteSell(tokenAmount);
        if (usdcOut == 0) revert InsufficientLiquidity();
        if (usdcOut < minUsdcOut) revert SlippageExceeded();

        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        uint256 grossOut = usdcOut + fee;
        usdcReserve -= grossOut;
        tokenReserve += tokenAmount;
        _distributeFee(msg.sender, SELL_FEE, fee);
        usdc.safeTransfer(msg.sender, usdcOut);
        emit TokenSold(msg.sender, tokenAmount, usdcOut, fee);
    }

    function getCurrentPrice() external view returns (uint256 usdcPerWholeToken) {
        return Math.mulDiv(_effectiveUsdcReserve(), 1e18, tokenReserve);
    }

    function getCurveProgress() external view returns (uint256 progressBps) {
        if (graduated) return BPS;
        uint256 progress = usdcReserve * BPS / graduationThreshold;
        return progress > BPS ? BPS : progress;
    }

    function tokensSold() public view returns (uint256) {
        if (graduated) return tokensSoldAtGraduation;
        return tokenReserve < initialTokenReserve ? initialTokenReserve - tokenReserve : 0;
    }

    function realLiquidity() external view returns (uint256) {
        return usdcReserve;
    }

    function effectiveUsdcReserve() external view returns (uint256) {
        return _effectiveUsdcReserve();
    }

    function maxBuyAmount() public view returns (uint256) {
        if (graduated) return type(uint256).max;
        if (usdcReserve >= graduationThreshold) return 0;
        uint256 remainingNetUsdc = graduationThreshold - usdcReserve;
        return Math.mulDiv(remainingNetUsdc, BPS, BPS - buyFeeBps);
    }

    function isGraduated() external view returns (bool) {
        return graduated;
    }

    function _checkGraduation() internal {
        if (!graduated && usdcReserve >= graduationThreshold) {
            uint256 preGraduationTokenReserve = tokenReserve;
            uint256 effectiveUsdc = virtualUsdcReserve + usdcReserve;
            uint256 permanentTokenLiquidity = Math.mulDiv(
                usdcReserve, preGraduationTokenReserve, effectiveUsdc, Math.Rounding.Ceil
            );
            if (permanentTokenLiquidity == 0 || permanentTokenLiquidity >= preGraduationTokenReserve) {
                revert InvalidConfiguration();
            }
            uint256 lockedTokens = preGraduationTokenReserve - permanentTokenLiquidity;
            tokensSoldAtGraduation = initialTokenReserve - preGraduationTokenReserve;
            tokenReserve = permanentTokenLiquidity;
            graduated = true;
            token.safeTransfer(PERMANENT_LIQUIDITY_LOCK, lockedTokens);
            emit CurveGraduated(usdcReserve, tokensSoldAtGraduation);
            emit PermanentLiquidityActivated(usdcReserve, permanentTokenLiquidity, lockedTokens);
        }
    }

    function _effectiveUsdcReserve() internal view returns (uint256) {
        return graduated ? usdcReserve : virtualUsdcReserve + usdcReserve;
    }

    function _distributeFee(address payer, bytes32 feeType, uint256 fee) internal {
        if (fee == 0) return;
        uint256 protocolAmount = fee * (BPS - CREATOR_FEE_SHARE_BPS) / BPS;
        uint256 creatorAmount = fee - protocolAmount;
        totalCreatorFees += creatorAmount;
        totalProtocolFees += protocolAmount;
        if (creatorAmount != 0) usdc.safeTransfer(creatorFeeRecipient, creatorAmount);
        if (protocolAmount != 0) {
            usdc.forceApprove(address(feeVault), protocolAmount);
            feeVault.collectFee(address(usdc), payer, feeType, protocolAmount);
        }
        emit FeeCollected(payer, feeType, fee);
        emit FeeSplit(payer, feeType, creatorFeeRecipient, creatorAmount, protocolAmount);
    }
}
