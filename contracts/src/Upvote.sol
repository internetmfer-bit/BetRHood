// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "solady/auth/Ownable.sol";

interface IERC721BalanceOf {
    function balanceOf(address owner) external view returns (uint256);
}

interface IERC1155BalanceOf {
    function balanceOf(address owner, uint256 id) external view returns (uint256);
}

/// @title Upvote
/// @notice One upvote per address per message. Two independent ways to qualify, both owner
/// controlled: (1) hold a token from an owner-allowlisted NFT collection, or (2) vote with no
/// NFT at all when the owner has "open voting" turned on. Both paths share the same
/// one-vote-per-address-per-message limit.
/// @dev The allowlist is unbounded — voters name which allowlisted collection they're voting
/// with, so eligibility is a single `balanceOf` call rather than a scan over every allowlisted
/// collection (which would get gas-unsafe as the list grows). ERC-1155 collections gate on a
/// single, owner-chosen token id (e.g. "the badge with id 3"), not "any token in the
/// collection" — ERC-1155 has no such concept natively, and per-id balances keep the check as
/// cheap as the ERC-721 case.
contract Upvote is Ownable {
    enum Standard {
        ERC721,
        ERC1155
    }

    struct Collection {
        bool allowed;
        Standard standard;
        uint256 tokenId; // only meaningful for ERC1155
    }

    mapping(address collection => Collection) public collections;
    mapping(uint256 messageId => mapping(address voter => bool)) public hasVoted;
    mapping(uint256 messageId => uint256) public upvoteCount;

    /// @notice When true, anyone can upvote by passing `collection = address(0)` to `upvote()`
    /// — no NFT required. Independent of the collection allowlist; both can be active at once.
    bool public openVotingEnabled;

    /// @dev Every collection ever allowlisted, for enumeration — entries are never removed
    /// from this list even after `removeCollection`, since `collections[c].allowed` is the
    /// actual source of truth. A frontend walks this list and filters on `allowed`.
    address[] private _everAllowed;
    mapping(address collection => bool everSeen) private _seen;

    event CollectionAllowed(address indexed collection, Standard standard, uint256 tokenId);
    event CollectionRemoved(address indexed collection);
    event OpenVotingSet(bool enabled);
    event Upvoted(uint256 indexed messageId, address indexed voter, address indexed collection);

    error CollectionNotAllowed();
    error NoBalance();
    error AlreadyVoted();
    error OpenVotingDisabled();

    constructor(address owner_, bool openVotingEnabled_) {
        _initializeOwner(owner_);
        openVotingEnabled = openVotingEnabled_;
    }

    function setOpenVoting(bool enabled) external onlyOwner {
        openVotingEnabled = enabled;
        emit OpenVotingSet(enabled);
    }

    function allowCollection721(address collection) external onlyOwner {
        _allow(collection, Standard.ERC721, 0);
    }

    function allowCollection1155(address collection, uint256 tokenId) external onlyOwner {
        _allow(collection, Standard.ERC1155, tokenId);
    }

    function removeCollection(address collection) external onlyOwner {
        collections[collection].allowed = false;
        emit CollectionRemoved(collection);
    }

    /// @notice Upvotes `messageId`. Pass `collection = address(0)` to vote via open voting
    /// (reverts with `OpenVotingDisabled` if the owner hasn't enabled it) — no NFT required.
    /// Pass a real allowlisted collection address to instead prove eligibility by holding a
    /// qualifying token from it. One vote per address per message either way, regardless of
    /// how many qualifying NFTs the caller holds or which collection they used to prove it.
    function upvote(uint256 messageId, address collection) external {
        if (hasVoted[messageId][msg.sender]) revert AlreadyVoted();

        if (collection == address(0)) {
            if (!openVotingEnabled) revert OpenVotingDisabled();
        } else {
            Collection memory c = collections[collection];
            if (!c.allowed) revert CollectionNotAllowed();

            uint256 balance = c.standard == Standard.ERC721
                ? IERC721BalanceOf(collection).balanceOf(msg.sender)
                : IERC1155BalanceOf(collection).balanceOf(msg.sender, c.tokenId);
            if (balance == 0) revert NoBalance();
        }

        hasVoted[messageId][msg.sender] = true;
        ++upvoteCount[messageId];

        emit Upvoted(messageId, msg.sender, collection);
    }

    function everAllowedCount() external view returns (uint256) {
        return _everAllowed.length;
    }

    /// @notice Returns the collection address at `index` in allowlist history, oldest first.
    /// Check `collections[addr].allowed` to see if it's still active.
    function everAllowedAt(uint256 index) external view returns (address) {
        return _everAllowed[index];
    }

    function _allow(address collection, Standard standard, uint256 tokenId) private {
        if (!_seen[collection]) {
            _seen[collection] = true;
            _everAllowed.push(collection);
        }
        collections[collection] = Collection({allowed: true, standard: standard, tokenId: tokenId});
        emit CollectionAllowed(collection, standard, tokenId);
    }
}
