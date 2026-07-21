// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ArcForgeFeeVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public feeRecipient;
    mapping(address asset => mapping(bytes32 feeType => uint256 amount)) private feeTotals;

    event FeeReceived(address indexed asset, address indexed payer, bytes32 indexed feeType, uint256 amount);
    event FeeWithdrawn(address indexed asset, address indexed recipient, uint256 amount);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);

    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();

    constructor(address owner_, address feeRecipient_) Ownable(owner_) {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
    }

    /// @notice Pulls a real fee from the caller and records its source. No trusted recorder is required.
    function collectFee(address asset, address payer, bytes32 feeType, uint256 amount) external nonReentrant {
        if (asset == address(0) || payer == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        feeTotals[asset][feeType] += amount;
        emit FeeReceived(asset, payer, feeType, amount);
    }

    function withdraw(address asset, uint256 amount) external nonReentrant {
        if (msg.sender != owner() && msg.sender != feeRecipient) revert Unauthorized();
        if (amount == 0) revert ZeroAmount();
        IERC20(asset).safeTransfer(feeRecipient, amount);
        emit FeeWithdrawn(asset, feeRecipient, amount);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        address previous = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previous, newRecipient);
    }

    function getFeeTotal(address asset, bytes32 feeType) external view returns (uint256) {
        return feeTotals[asset][feeType];
    }
}
