// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Follow} from "../src/Follow.sol";

contract FollowTest is Test {
    Follow internal follow;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);

    function setUp() public {
        follow = new Follow();
    }

    function test_Follow_SetsIsFollowingAndCounts() public {
        vm.prank(alice);
        follow.follow(bob);

        assertTrue(follow.isFollowing(alice, bob));
        assertEq(follow.followingCount(alice), 1);
        assertEq(follow.followerCount(bob), 1);
    }

    function test_Follow_EmitsFollowedEvent() public {
        vm.expectEmit(true, true, false, false);
        emit Follow.Followed(alice, bob);
        vm.prank(alice);
        follow.follow(bob);
    }

    function test_Follow_CannotFollowSelf() public {
        vm.prank(alice);
        vm.expectRevert(Follow.CannotFollowSelf.selector);
        follow.follow(alice);
    }

    function test_Follow_CannotFollowTwice() public {
        vm.prank(alice);
        follow.follow(bob);

        vm.prank(alice);
        vm.expectRevert(Follow.AlreadyFollowing.selector);
        follow.follow(bob);
    }

    function test_Unfollow_ClearsIsFollowingAndDecrementsCounts() public {
        vm.prank(alice);
        follow.follow(bob);

        vm.prank(alice);
        follow.unfollow(bob);

        assertFalse(follow.isFollowing(alice, bob));
        assertEq(follow.followingCount(alice), 0);
        assertEq(follow.followerCount(bob), 0);
    }

    function test_Unfollow_WithoutFollowing_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(Follow.NotFollowing.selector);
        follow.unfollow(bob);
    }

    function test_RefollowAfterUnfollow_Works() public {
        vm.startPrank(alice);
        follow.follow(bob);
        follow.unfollow(bob);
        follow.follow(bob);
        vm.stopPrank();

        assertTrue(follow.isFollowing(alice, bob));
        assertEq(follow.followingCount(alice), 1);
        assertEq(follow.followerCount(bob), 1);
    }

    function test_MultipleFollowers_CountAndEnumerateCorrectly() public {
        vm.prank(alice);
        follow.follow(carol);
        vm.prank(bob);
        follow.follow(carol);

        assertEq(follow.followerCount(carol), 2);
        assertEq(follow.everFollowedByCount(carol), 2);
        assertEq(follow.everFollowedByAt(carol, 0), alice);
        assertEq(follow.everFollowedByAt(carol, 1), bob);
    }

    function test_MultipleFollowees_CountAndEnumerateCorrectly() public {
        vm.startPrank(alice);
        follow.follow(bob);
        follow.follow(carol);
        vm.stopPrank();

        assertEq(follow.followingCount(alice), 2);
        assertEq(follow.everFollowedCount(alice), 2);
        assertEq(follow.everFollowedAt(alice, 0), bob);
        assertEq(follow.everFollowedAt(alice, 1), carol);
    }

    function test_EverFollowedHistory_KeepsGhostEntryAfterUnfollow() public {
        vm.startPrank(alice);
        follow.follow(bob);
        follow.unfollow(bob);
        vm.stopPrank();

        // History still shows bob was once followed — isFollowing is the actual source of
        // truth, not the history list's mere presence.
        assertEq(follow.everFollowedCount(alice), 1);
        assertEq(follow.everFollowedAt(alice, 0), bob);
        assertFalse(follow.isFollowing(alice, bob));
    }

    function test_EverFollowedHistory_DoesNotDuplicateOnRefollow() public {
        vm.startPrank(alice);
        follow.follow(bob);
        follow.unfollow(bob);
        follow.follow(bob);
        vm.stopPrank();

        // Same address, followed twice total — history should list it once, not twice.
        assertEq(follow.everFollowedCount(alice), 1);
    }

    function test_FollowingAndFollowersAreIndependent() public {
        vm.prank(alice);
        follow.follow(bob);

        // Bob following Alice back is a separate edge — doesn't happen automatically.
        assertFalse(follow.isFollowing(bob, alice));
        assertEq(follow.followingCount(bob), 0);
    }
}
