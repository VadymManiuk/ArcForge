// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply launch token. It has no owner, mint, blacklist, pause, or tax hooks.
contract ArcForgeToken is ERC20 {
    address public immutable creator;
    address public immutable factory;
    string public metadataURI;

    event TokenInitialized(
        address indexed token,
        address indexed creator,
        uint256 totalSupply,
        uint256 creatorAllocation,
        string metadataURI
    );

    error InvalidCreator();
    error InvalidSupply();
    error InvalidAllocation();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address creator_,
        uint256 creatorAllocation_,
        string memory metadataURI_
    ) ERC20(name_, symbol_) {
        if (creator_ == address(0)) revert InvalidCreator();
        if (totalSupply_ == 0) revert InvalidSupply();
        if (creatorAllocation_ > totalSupply_) revert InvalidAllocation();

        creator = creator_;
        factory = msg.sender;
        metadataURI = metadataURI_;

        if (creatorAllocation_ != 0) _mint(creator_, creatorAllocation_);
        _mint(msg.sender, totalSupply_ - creatorAllocation_);
        emit TokenInitialized(address(this), creator_, totalSupply_, creatorAllocation_, metadataURI_);
    }
}
