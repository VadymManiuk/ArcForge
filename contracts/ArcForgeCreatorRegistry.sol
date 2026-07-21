// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ArcForgeCreatorRegistry is Ownable {
    struct CreatorProfile {
        string metadataURI;
        uint64 launchCount;
        uint64 graduatedCount;
        uint64 flaggedCount;
        bool registered;
    }

    address public factory;
    mapping(address creator => CreatorProfile profile) private profiles;

    event CreatorRegistered(address indexed creator, string metadataURI);
    event CreatorUpdated(address indexed creator, string metadataURI);
    event CreatorLaunchRecorded(address indexed creator, address indexed token, uint256 launchCount);
    event FactoryUpdated(address indexed previousFactory, address indexed newFactory);

    error ZeroAddress();
    error Unauthorized();
    error AlreadyRegistered();
    error NotRegistered();

    constructor(address owner_) Ownable(owner_) {}

    function setFactory(address newFactory) external onlyOwner {
        if (newFactory == address(0)) revert ZeroAddress();
        address previous = factory;
        factory = newFactory;
        emit FactoryUpdated(previous, newFactory);
    }

    function registerCreator(string calldata metadataURI) external {
        _register(msg.sender, metadataURI);
    }

    function registerCreatorFor(address creator, string calldata metadataURI) external {
        if (msg.sender != factory) revert Unauthorized();
        _register(creator, metadataURI);
    }

    function updateCreatorMetadata(string calldata metadataURI) external {
        CreatorProfile storage profile = profiles[msg.sender];
        if (!profile.registered) revert NotRegistered();
        profile.metadataURI = metadataURI;
        emit CreatorUpdated(msg.sender, metadataURI);
    }

    function recordLaunch(address creator, address token) external {
        if (msg.sender != factory) revert Unauthorized();
        CreatorProfile storage profile = profiles[creator];
        if (!profile.registered) {
            profile.registered = true;
            emit CreatorRegistered(creator, "");
        }
        unchecked { profile.launchCount += 1; }
        emit CreatorLaunchRecorded(creator, token, profile.launchCount);
    }

    function getCreatorProfile(address creator) external view returns (CreatorProfile memory) {
        return profiles[creator];
    }

    function _register(address creator, string calldata metadataURI) internal {
        if (creator == address(0)) revert ZeroAddress();
        if (profiles[creator].registered) revert AlreadyRegistered();
        profiles[creator] = CreatorProfile(metadataURI, 0, 0, 0, true);
        emit CreatorRegistered(creator, metadataURI);
    }
}
