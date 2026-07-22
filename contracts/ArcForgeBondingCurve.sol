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
    bytes32 public constant BUY_FEE = keccak256("BUY_FEE");
    bytes32 public constant SELL_FEE = keccak256("SELL_FEE");

    IERC20 public immutable token;
    IERC20 public immutable usdc;
    ArcForgeFeeVault public immutable feeVault;
    uint256 public immutable initialTokenReserve;
    uint256 public immutable virtualUsdcReserve;
    uint256 public immutable graduationThreshold;
    uint16 public immutable buyFeeBps;
    uint16 public immutable sellFeeBps;

    uint256 public tokenReserve;
    uint256 public usdcReserve;
    bool private graduated;

    event TokenBought(address indexed buyer, uint256 usdcIn, uint256 tokensOut, uint256 fee);
    event TokenSold(address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 fee);
    event FeeCollected(address indexed payer, bytes32 indexed feeType, uint256 amount);
    event CurveGraduated(uint256 raisedUsdc, uint256 tokensSold);

    error ZeroAddress();
    error InvalidConfiguration();
    error ZeroAmount();
    error SlippageExceeded();
    error InsufficientLiquidity();
    error AlreadyGraduated();
    error ReserveNotFunded();

    constructor(
        address token_,
        address usdc_,
        address feeVault_,
        uint256 tokenReserve_,
        uint256 virtualUsdcReserve_,
        uint256 graduationThreshold_,
        uint16 buyFeeBps_,
        uint16 sellFeeBps_
    ) {
        if (token_ == address(0) || usdc_ == address(0) || feeVault_ == address(0)) revert ZeroAddress();
        if (
            tokenReserve_ == 0 || virtualUsdcReserve_ == 0 || graduationThreshold_ == 0 ||
            buyFeeBps_ > 1_000 || sellFeeBps_ > 1_000
        ) revert InvalidConfiguration();
        token = IERC20(token_);
        usdc = IERC20(usdc_);
        feeVault = ArcForgeFeeVault(feeVault_);
        initialTokenReserve = tokenReserve_;
        tokenReserve = tokenReserve_;
        virtualUsdcReserve = virtualUsdcReserve_;
        graduationThreshold = graduationThreshold_;
        buyFeeBps = buyFeeBps_;
        sellFeeBps = sellFeeBps_;
    }

    function quoteBuy(uint256 usdcAmount) public view returns (uint256 tokensOut, uint256 fee) {
        if (usdcAmount == 0) return (0, 0);
        fee = usdcAmount * buyFeeBps / BPS;
        uint256 netAmount = usdcAmount - fee;
        uint256 currentUsdc = virtualUsdcReserve + usdcReserve;
        // Round the remaining reserve up so integer truncation can never give a buyer extra inventory.
        uint256 newTokenReserve = Math.mulDiv(
            currentUsdc, tokenReserve, currentUsdc + netAmount, Math.Rounding.Ceil
        );
        if (newTokenReserve == 0) return (0, fee);
        tokensOut = tokenReserve - newTokenReserve;
    }

    function quoteSell(uint256 tokenAmount) public view returns (uint256 usdcOut, uint256 fee) {
        if (tokenAmount == 0) return (0, 0);
        uint256 currentUsdc = virtualUsdcReserve + usdcReserve;
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
        if (graduated) revert AlreadyGraduated();
        if (usdcAmount == 0) revert ZeroAmount();
        if (token.balanceOf(address(this)) < tokenReserve) revert ReserveNotFunded();
        uint256 fee;
        (tokensOut, fee) = quoteBuy(usdcAmount);
        if (tokensOut == 0 || tokensOut < minTokensOut) revert SlippageExceeded();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        uint256 netAmount = usdcAmount - fee;
        usdcReserve += netAmount;
        tokenReserve -= tokensOut;
        if (fee != 0) {
            usdc.forceApprove(address(feeVault), fee);
            feeVault.collectFee(address(usdc), msg.sender, BUY_FEE, fee);
            emit FeeCollected(msg.sender, BUY_FEE, fee);
        }
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
        if (fee != 0) {
            usdc.forceApprove(address(feeVault), fee);
            feeVault.collectFee(address(usdc), msg.sender, SELL_FEE, fee);
            emit FeeCollected(msg.sender, SELL_FEE, fee);
        }
        usdc.safeTransfer(msg.sender, usdcOut);
        emit TokenSold(msg.sender, tokenAmount, usdcOut, fee);
    }

    function getCurrentPrice() external view returns (uint256 usdcPerWholeToken) {
        return Math.mulDiv(virtualUsdcReserve + usdcReserve, 1e18, tokenReserve);
    }

    function getCurveProgress() external view returns (uint256 progressBps) {
        uint256 progress = usdcReserve * BPS / graduationThreshold;
        return progress > BPS ? BPS : progress;
    }

    function tokensSold() public view returns (uint256) {
        return tokenReserve < initialTokenReserve ? initialTokenReserve - tokenReserve : 0;
    }

    function isGraduated() external view returns (bool) {
        return graduated;
    }

    function _checkGraduation() internal {
        if (!graduated && usdcReserve >= graduationThreshold) {
            graduated = true;
            emit CurveGraduated(usdcReserve, tokensSold());
        }
    }
}
