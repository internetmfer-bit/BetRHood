// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SSTORE2} from "solady/utils/SSTORE2.sol";

/// @title Messaging
/// @notice Permanent, indexed message log. Anyone can post; every message is indexed by its
/// topic and by whoever posted it, so reading back is a direct index lookup rather than a
/// scan across every message ever posted. This is the base primitive — threads, feeds, game
/// moves, and profile fields are all just conventions layered on top of `topic` and `body`.
contract Messaging {
    struct MessageMeta {
        address sender;
        bytes32 topic;
        address body;
        uint64 timestamp;
    }

    MessageMeta[] private _messages;
    mapping(bytes32 topic => uint256[] messageIds) private _byTopic;
    mapping(address sender => uint256[] messageIds) private _bySender;

    event Posted(uint256 indexed messageId, address indexed sender, bytes32 indexed topic);

    error EmptyBody();

    /// @notice Posts `body` under `topic`.
    /// @dev `sender` is always `msg.sender` — there is no parameter to post "on behalf of"
    /// another address. Allowing a caller to self-declare a different sender would make
    /// every downstream index built on `sender` spoofable and untrustworthy. A contract
    /// that wants to attribute a post to a specific user should encode that in `body` or
    /// `topic` itself, where a reader can see exactly whose word they're trusting.
    function post(bytes32 topic, bytes calldata body) external returns (uint256 messageId) {
        if (body.length == 0) revert EmptyBody();

        address pointer = SSTORE2.write(body);
        messageId = _messages.length;
        _messages.push(
            MessageMeta({sender: msg.sender, topic: topic, body: pointer, timestamp: uint64(block.timestamp)})
        );

        _byTopic[topic].push(messageId);
        _bySender[msg.sender].push(messageId);

        emit Posted(messageId, msg.sender, topic);
    }

    function getMessage(uint256 messageId)
        external
        view
        returns (address sender, bytes32 topic, bytes memory body, uint64 timestamp)
    {
        MessageMeta storage m = _messages[messageId];
        return (m.sender, m.topic, SSTORE2.read(m.body), m.timestamp);
    }

    function messageCount() external view returns (uint256) {
        return _messages.length;
    }

    function topicCount(bytes32 topic) external view returns (uint256) {
        return _byTopic[topic].length;
    }

    /// @notice Returns the message id at `index` within `topic`'s list, oldest first.
    function topicMessageId(bytes32 topic, uint256 index) external view returns (uint256) {
        return _byTopic[topic][index];
    }

    function senderCount(address sender) external view returns (uint256) {
        return _bySender[sender].length;
    }

    /// @notice Returns the message id at `index` within `sender`'s list, oldest first.
    function senderMessageId(address sender, uint256 index) external view returns (uint256) {
        return _bySender[sender][index];
    }
}
