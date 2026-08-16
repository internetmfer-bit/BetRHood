// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Follow
/// @notice Public, permanent follow graph. Anyone can follow or unfollow any address (except
/// themselves) — no approval, no privacy setting, visible to everyone by design.
/// @dev Both directions are separately indexed so "who does X follow" and "who follows X" are
/// each a direct enumeration, not a scan — Messaging.sol can't answer the second question
/// efficiently (it only indexes by sender and topic, not by an arbitrary target address), which
/// is why this is its own contract rather than a messaging convention.
///
/// Followee lists are append-only history, same pattern as Upvote.sol's collection allowlist:
/// `_everFollowed`/`_everFollowedBy` may contain addresses no longer followed (someone
/// followed, unfollowed, then followed again only appears once, but an unfollow alone doesn't
/// remove the entry) — `isFollowing` is the actual source of truth; callers enumerate the list
/// and filter on that. This avoids in-place array removal entirely.
contract Follow {
    mapping(address follower => mapping(address followee => bool)) public isFollowing;
    mapping(address follower => uint256) public followingCount;
    mapping(address followee => uint256) public followerCount;

    mapping(address follower => address[] everFollowed) private _everFollowed;
    mapping(address follower => mapping(address followee => bool)) private _everFollowedSeen;

    mapping(address followee => address[] everFollowedBy) private _everFollowedBy;
    mapping(address followee => mapping(address follower => bool)) private _everFollowedBySeen;

    event Followed(address indexed follower, address indexed followee);
    event Unfollowed(address indexed follower, address indexed followee);

    error CannotFollowSelf();
    error AlreadyFollowing();
    error NotFollowing();

    function follow(address followee) external {
        if (followee == msg.sender) revert CannotFollowSelf();
        if (isFollowing[msg.sender][followee]) revert AlreadyFollowing();

        isFollowing[msg.sender][followee] = true;
        ++followingCount[msg.sender];
        ++followerCount[followee];

        if (!_everFollowedSeen[msg.sender][followee]) {
            _everFollowedSeen[msg.sender][followee] = true;
            _everFollowed[msg.sender].push(followee);
        }
        if (!_everFollowedBySeen[followee][msg.sender]) {
            _everFollowedBySeen[followee][msg.sender] = true;
            _everFollowedBy[followee].push(msg.sender);
        }

        emit Followed(msg.sender, followee);
    }

    function unfollow(address followee) external {
        if (!isFollowing[msg.sender][followee]) revert NotFollowing();

        isFollowing[msg.sender][followee] = false;
        --followingCount[msg.sender];
        --followerCount[followee];

        emit Unfollowed(msg.sender, followee);
    }

    function everFollowedCount(address follower) external view returns (uint256) {
        return _everFollowed[follower].length;
    }

    /// @notice Returns the address at `index` in `follower`'s follow history, oldest first.
    /// Check `isFollowing[follower][addr]` to see if it's still active.
    function everFollowedAt(address follower, uint256 index) external view returns (address) {
        return _everFollowed[follower][index];
    }

    function everFollowedByCount(address followee) external view returns (uint256) {
        return _everFollowedBy[followee].length;
    }

    /// @notice Returns the address at `index` in `followee`'s follower history, oldest first.
    /// Check `isFollowing[addr][followee]` to see if it's still active.
    function everFollowedByAt(address followee, uint256 index) external view returns (address) {
        return _everFollowedBy[followee][index];
    }
}
