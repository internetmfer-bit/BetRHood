// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Messaging} from "../src/Messaging.sol";

contract MessagingTest is Test {
    Messaging internal msging;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        msging = new Messaging();
    }

    function test_PostAndGetMessage() public {
        vm.prank(alice);
        uint256 id = msging.post("chess:game-1", "e2e4");

        (address sender, bytes32 topic, bytes memory body, uint64 timestamp) = msging.getMessage(id);
        assertEq(sender, alice);
        assertEq(topic, bytes32("chess:game-1"));
        assertEq(body, "e2e4");
        assertEq(timestamp, uint64(block.timestamp));
    }

    function test_SenderIsAlwaysMsgSender_NeverSpoofable() public {
        vm.prank(alice);
        uint256 id = msging.post("topic", "hi from alice");
        (address sender,,,) = msging.getMessage(id);
        assertEq(sender, alice, "sender must be the actual caller, not anything self-declared");

        vm.prank(bob);
        uint256 id2 = msging.post("topic", "hi from bob");
        (address sender2,,,) = msging.getMessage(id2);
        assertEq(sender2, bob);
    }

    function test_EmptyBody_Reverts() public {
        vm.expectRevert(Messaging.EmptyBody.selector);
        msging.post("topic", "");
    }

    function test_MessageCount_Increments() public {
        assertEq(msging.messageCount(), 0);
        msging.post("t", "a");
        assertEq(msging.messageCount(), 1);
        msging.post("t", "b");
        assertEq(msging.messageCount(), 2);
    }

    function test_TopicIndex_OrdersMessagesWithinTopic() public {
        vm.prank(alice);
        uint256 id0 = msging.post("chess:game-1", "e2e4");
        vm.prank(bob);
        uint256 id1 = msging.post("chess:game-1", "e7e5");
        // a different topic shouldn't appear in this index
        msging.post("chess:game-2", "d2d4");

        assertEq(msging.topicCount("chess:game-1"), 2);
        assertEq(msging.topicMessageId("chess:game-1", 0), id0);
        assertEq(msging.topicMessageId("chess:game-1", 1), id1);
        assertEq(msging.topicCount("chess:game-2"), 1);
    }

    function test_SenderIndex_OrdersMessagesBySender() public {
        vm.startPrank(alice);
        uint256 id0 = msging.post("t1", "a");
        uint256 id1 = msging.post("t2", "b");
        vm.stopPrank();

        vm.prank(bob);
        msging.post("t1", "c");

        assertEq(msging.senderCount(alice), 2);
        assertEq(msging.senderMessageId(alice, 0), id0);
        assertEq(msging.senderMessageId(alice, 1), id1);
        assertEq(msging.senderCount(bob), 1);
    }

    function test_Post_EmitsPostedEvent() public {
        vm.expectEmit(true, true, true, false);
        emit Messaging.Posted(0, alice, "topic");

        vm.prank(alice);
        msging.post("topic", "body");
    }

    function testFuzz_PostAndGetMessage(bytes32 topic, bytes memory body) public {
        vm.assume(body.length > 0 && body.length < 20_000);
        vm.prank(alice);
        uint256 id = msging.post(topic, body);
        (address sender, bytes32 gotTopic, bytes memory gotBody,) = msging.getMessage(id);
        assertEq(sender, alice);
        assertEq(gotTopic, topic);
        assertEq(gotBody, body);
    }
}
