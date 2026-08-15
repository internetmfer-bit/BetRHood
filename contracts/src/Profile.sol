// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Profile
/// @notice Optional display name + picture per address. The picture's bytes live in
/// `Storage`, under the same address; this contract only remembers which key to look at,
/// plus a plain-text name. Every address can only ever set its own profile.
contract Profile {
    uint256 public constant MAX_NAME_LENGTH = 32;

    mapping(address => string) private _names;
    mapping(address => bytes32) private _pictureKeys;
    mapping(address => bool) private _pictureSet;

    event NameSet(address indexed who, string name);
    event PictureSet(address indexed who, bytes32 pictureKey);

    error NameTooLong(uint256 length);

    function setName(string calldata name) external {
        uint256 len = bytes(name).length;
        if (len > MAX_NAME_LENGTH) revert NameTooLong(len);
        _names[msg.sender] = name;
        emit NameSet(msg.sender, name);
    }

    /// @notice Points this address's picture at `pictureKey` in `Storage` (same address,
    /// that key). Doesn't verify the key actually holds an image — resolving and rendering
    /// it is the gateway/frontend's job, same as any other stored file.
    function setPictureKey(bytes32 pictureKey) external {
        _pictureKeys[msg.sender] = pictureKey;
        _pictureSet[msg.sender] = true;
        emit PictureSet(msg.sender, pictureKey);
    }

    /// @return name Display name, empty string if never set.
    /// @return pictureKey Storage key for the picture — only meaningful if `hasPicture`.
    /// @return hasPicture Whether a picture key has ever been set, distinct from a key that
    /// happens to equal bytes32(0).
    function getProfile(address who) external view returns (string memory name, bytes32 pictureKey, bool hasPicture) {
        return (_names[who], _pictureKeys[who], _pictureSet[who]);
    }
}
