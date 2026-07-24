// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ArcForgeToken} from "./ArcForgeToken.sol";
import {ArcForgeBondingCurve} from "./ArcForgeBondingCurve.sol";
import {ArcForgeFeeVault} from "./ArcForgeFeeVault.sol";
import {ArcForgeCreatorRegistry} from "./ArcForgeCreatorRegistry.sol";

contract ArcForgeFactory is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_CREATOR_ALLOCATION_BPS = 2_000;
    uint16 public constant CREATOR_FEE_SHARE_BPS = 7_000;
    uint256 public constant GRADUATION_RESERVE_MULTIPLIER = 4;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_SYMBOL_BYTES = 10;
    uint256 public constant MAX_METADATA_URI_BYTES = 512;
    bytes32 public constant LAUNCH_FEE = keccak256("LAUNCH_FEE");

    struct LaunchParams {
        string name;
        string symbol;
        string metadataURI;
        uint256 totalSupply;
        uint16 creatorAllocationBps;
        uint256 virtualUsdcReserve;
        uint256 graduationThreshold;
    }

    struct TokenInfo {
        address token;
        address curve;
        address creator;
        uint64 launchedAt;
        string metadataURI;
    }

    IERC20 public immutable usdc;
    ArcForgeFeeVault public immutable feeVault;
    ArcForgeCreatorRegistry public immutable creatorRegistry;
    uint256 public launchFee;
    uint16 public buyFeeBps;
    uint16 public sellFeeBps;

    address[] private launchedTokens;
    mapping(address token => TokenInfo info) private tokenInfo;
    mapping(address creator => address[] tokens) private creatorTokens;

    event TokenLaunched(address indexed token, address indexed curve, address indexed creator, string name, string symbol);
    event LaunchFeePaid(address indexed creator, uint256 amount);
    event BondingCurveCreated(address indexed token, address indexed curve, uint256 graduationThreshold);
    event CreatorRegistered(address indexed creator);
    event LaunchFeeUpdated(uint256 previousFee, uint256 newFee);
    event TradingFeesUpdated(uint16 buyFeeBps, uint16 sellFeeBps);

    error EmptyName();
    error EmptySymbol();
    error NameTooLong();
    error SymbolTooLong();
    error MetadataURITooLong();
    error InvalidAllocation();
    error InvalidConfiguration();

    constructor(
        address owner_,
        address usdc_,
        address feeVault_,
        address creatorRegistry_,
        uint256 launchFee_
    ) Ownable(owner_) {
        if (usdc_ == address(0) || feeVault_ == address(0) || creatorRegistry_ == address(0)) {
            revert InvalidConfiguration();
        }
        usdc = IERC20(usdc_);
        feeVault = ArcForgeFeeVault(feeVault_);
        creatorRegistry = ArcForgeCreatorRegistry(creatorRegistry_);
        launchFee = launchFee_;
        buyFeeBps = 100;
        sellFeeBps = 100;
    }

    function launchToken(LaunchParams calldata params) external nonReentrant returns (address token, address curve) {
        if (bytes(params.name).length == 0) revert EmptyName();
        if (bytes(params.symbol).length == 0) revert EmptySymbol();
        if (bytes(params.name).length > MAX_NAME_BYTES) revert NameTooLong();
        if (bytes(params.symbol).length > MAX_SYMBOL_BYTES) revert SymbolTooLong();
        if (bytes(params.metadataURI).length > MAX_METADATA_URI_BYTES) revert MetadataURITooLong();
        if (params.creatorAllocationBps > MAX_CREATOR_ALLOCATION_BPS) revert InvalidAllocation();
        if (
            params.totalSupply == 0 || params.virtualUsdcReserve == 0 ||
            params.graduationThreshold != params.virtualUsdcReserve * GRADUATION_RESERVE_MULTIPLIER
        ) {
            revert InvalidConfiguration();
        }

        if (launchFee != 0) {
            usdc.safeTransferFrom(msg.sender, address(this), launchFee);
            usdc.forceApprove(address(feeVault), launchFee);
            feeVault.collectFee(address(usdc), msg.sender, LAUNCH_FEE, launchFee);
            emit LaunchFeePaid(msg.sender, launchFee);
        }

        uint256 creatorAllocation = params.totalSupply * params.creatorAllocationBps / 10_000;
        ArcForgeToken launchedToken = new ArcForgeToken(
            params.name, params.symbol, params.totalSupply, msg.sender, creatorAllocation, params.metadataURI
        );
        uint256 curveAllocation = params.totalSupply - creatorAllocation;
        ArcForgeBondingCurve launchedCurve = new ArcForgeBondingCurve(
            address(launchedToken), address(usdc), address(feeVault), msg.sender, curveAllocation,
            params.virtualUsdcReserve, params.graduationThreshold, buyFeeBps, sellFeeBps
        );
        IERC20(address(launchedToken)).safeTransfer(address(launchedCurve), curveAllocation);

        token = address(launchedToken);
        curve = address(launchedCurve);
        launchedTokens.push(token);
        creatorTokens[msg.sender].push(token);
        tokenInfo[token] = TokenInfo(token, curve, msg.sender, uint64(block.timestamp), params.metadataURI);
        creatorRegistry.recordLaunch(msg.sender, token);

        emit CreatorRegistered(msg.sender);
        emit BondingCurveCreated(token, curve, params.graduationThreshold);
        emit TokenLaunched(token, curve, msg.sender, params.name, params.symbol);
    }

    function setLaunchFee(uint256 newFee) external onlyOwner {
        uint256 previous = launchFee;
        launchFee = newFee;
        emit LaunchFeeUpdated(previous, newFee);
    }

    function setTradingFees(uint16 newBuyFeeBps, uint16 newSellFeeBps) external onlyOwner {
        if (newBuyFeeBps > 1_000 || newSellFeeBps > 1_000) revert InvalidConfiguration();
        buyFeeBps = newBuyFeeBps;
        sellFeeBps = newSellFeeBps;
        emit TradingFeesUpdated(newBuyFeeBps, newSellFeeBps);
    }

    function getLaunchedTokens() external view returns (address[] memory) { return launchedTokens; }
    function getCreatorTokens(address creator) external view returns (address[] memory) { return creatorTokens[creator]; }
    function getTokenInfo(address token) external view returns (TokenInfo memory) { return tokenInfo[token]; }
}
