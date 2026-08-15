// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SSTORE2} from "solady/utils/SSTORE2.sol";

/// @title Storage
/// @notice Permanent, versioned key-value storage. Every write is content the caller owns
/// forever — nothing here can be deleted, only superseded by a new version. Data is stored
/// via SSTORE2 (as contract bytecode) rather than SSTORE, which is far cheaper for anything
/// bigger than a few words.
/// @dev A "value" is one or more chunks. Splitting and compressing large files into chunks
/// under `MAX_CHUNK_SIZE` is the caller's (SDK's) job — this contract just stores whatever
/// it's given, in order, and remembers how to read it back as one blob.
contract Storage {
    /// @dev owner => key => versions => chunk pointers for that version.
    mapping(address owner => mapping(bytes32 key => address[][] versions)) private _versions;

    /// @dev Comfortably under the 24,576-byte EVM contract-size limit (EIP-170) so a single
    /// chunk write can never fail from hitting it — SSTORE2 would revert anyway, but this
    /// gives a clearer error naming the offending chunk instead of a generic deploy failure.
    uint256 public constant MAX_CHUNK_SIZE = 23_500;

    event Written(address indexed owner, bytes32 indexed key, uint256 indexed version, uint256 chunkCount);

    error EmptyValue();
    error ChunkTooLarge(uint256 index, uint256 size);

    /// @notice Writes a new version of `key` for the caller.
    /// @param key Caller-chosen identifier for this piece of data (e.g. keccak256 of a slug).
    /// @param chunks One or more pieces that concatenate back into the original value.
    /// @return version Index of the newly written version (0 for the first write).
    function write(bytes32 key, bytes[] calldata chunks) external returns (uint256 version) {
        uint256 n = chunks.length;
        if (n == 0) revert EmptyValue();

        address[][] storage versionSlots = _versions[msg.sender][key];
        address[] storage pointers = versionSlots.push();

        for (uint256 i = 0; i < n; ++i) {
            uint256 len = chunks[i].length;
            if (len == 0) revert EmptyValue();
            if (len > MAX_CHUNK_SIZE) revert ChunkTooLarge(i, len);
            pointers.push(SSTORE2.write(chunks[i]));
        }

        version = versionSlots.length - 1;
        emit Written(msg.sender, key, version, n);
    }

    /// @notice Reads the latest version of `owner`'s `key`, concatenated into one blob.
    /// Returns empty bytes if nothing has ever been written to this (owner, key).
    function read(address owner, bytes32 key) external view returns (bytes memory data) {
        uint256 count = _versions[owner][key].length;
        if (count == 0) return "";
        return readVersion(owner, key, count - 1);
    }

    /// @notice Reads a specific historical version, oldest write is version 0.
    function readVersion(address owner, bytes32 key, uint256 version) public view returns (bytes memory data) {
        address[] storage pointers = _versions[owner][key][version];
        uint256 n = pointers.length;
        if (n == 1) return SSTORE2.read(pointers[0]);
        for (uint256 i = 0; i < n; ++i) {
            data = bytes.concat(data, SSTORE2.read(pointers[i]));
        }
    }

    function versionCount(address owner, bytes32 key) external view returns (uint256) {
        return _versions[owner][key].length;
    }

    function chunkCount(address owner, bytes32 key, uint256 version) external view returns (uint256) {
        return _versions[owner][key][version].length;
    }
}
