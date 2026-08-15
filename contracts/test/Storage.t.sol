// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Storage} from "../src/Storage.sol";

contract StorageTest is Test {
    Storage internal store;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        store = new Storage();
    }

    function _chunks1(bytes memory a) internal pure returns (bytes[] memory c) {
        c = new bytes[](1);
        c[0] = a;
    }

    function _chunks2(bytes memory a, bytes memory b) internal pure returns (bytes[] memory c) {
        c = new bytes[](2);
        c[0] = a;
        c[1] = b;
    }

    function test_WriteAndReadSingleChunk() public {
        vm.prank(alice);
        uint256 version = store.write("hello.txt", _chunks1("hello world"));

        assertEq(version, 0);
        assertEq(store.read(alice, "hello.txt"), "hello world");
        assertEq(store.versionCount(alice, "hello.txt"), 1);
        assertEq(store.chunkCount(alice, "hello.txt", 0), 1);
    }

    function test_WriteAndReadMultiChunk_ConcatenatesInOrder() public {
        vm.prank(alice);
        store.write("big.bin", _chunks2("first-half:", "second-half"));

        assertEq(store.read(alice, "big.bin"), "first-half:second-half");
        assertEq(store.chunkCount(alice, "big.bin", 0), 2);
    }

    function test_Versioning_LatestWins_OldStillReadable() public {
        vm.startPrank(alice);
        store.write("k", _chunks1("v0"));
        store.write("k", _chunks1("v1"));
        uint256 v2 = store.write("k", _chunks1("v2"));
        vm.stopPrank();

        assertEq(v2, 2);
        assertEq(store.versionCount(alice, "k"), 3);
        assertEq(store.read(alice, "k"), "v2", "read() should return the latest version");
        assertEq(store.readVersion(alice, "k", 0), "v0");
        assertEq(store.readVersion(alice, "k", 1), "v1");
        assertEq(store.readVersion(alice, "k", 2), "v2");
    }

    function test_Read_NeverWritten_ReturnsEmpty() public view {
        assertEq(store.read(alice, "nope"), "");
        assertEq(store.versionCount(alice, "nope"), 0);
    }

    function test_OwnersDoNotCollide() public {
        vm.prank(alice);
        store.write("k", _chunks1("alice's value"));

        vm.prank(bob);
        store.write("k", _chunks1("bob's value"));

        assertEq(store.read(alice, "k"), "alice's value");
        assertEq(store.read(bob, "k"), "bob's value");
    }

    function test_KeysDoNotCollide() public {
        vm.startPrank(alice);
        store.write("a", _chunks1("value-a"));
        store.write("b", _chunks1("value-b"));
        vm.stopPrank();

        assertEq(store.read(alice, "a"), "value-a");
        assertEq(store.read(alice, "b"), "value-b");
    }

    function test_Write_EmptyChunksArray_Reverts() public {
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(Storage.EmptyValue.selector);
        store.write("k", empty);
    }

    function test_Write_EmptyIndividualChunk_Reverts() public {
        vm.expectRevert(Storage.EmptyValue.selector);
        store.write("k", _chunks2("ok", ""));
    }

    function test_Write_ChunkTooLarge_Reverts() public {
        bytes memory tooBig = new bytes(store.MAX_CHUNK_SIZE() + 1);
        vm.expectRevert(abi.encodeWithSelector(Storage.ChunkTooLarge.selector, 0, tooBig.length));
        store.write("k", _chunks1(tooBig));
    }

    function test_Write_ChunkAtMaxSize_Succeeds() public {
        bytes memory maxSize = new bytes(store.MAX_CHUNK_SIZE());
        for (uint256 i = 0; i < maxSize.length; ++i) {
            maxSize[i] = 0x42;
        }
        vm.prank(alice);
        store.write("k", _chunks1(maxSize));
        assertEq(store.read(alice, "k").length, maxSize.length);
    }

    function test_Write_EmitsWrittenEvent() public {
        vm.expectEmit(true, true, true, true);
        emit Storage.Written(alice, "k", 0, 2);

        vm.prank(alice);
        store.write("k", _chunks2("a", "b"));
    }

    function testFuzz_WriteAndReadSingleChunk(bytes memory data) public {
        vm.assume(data.length > 0 && data.length <= store.MAX_CHUNK_SIZE());
        vm.prank(alice);
        store.write("fuzz", _chunks1(data));
        assertEq(store.read(alice, "fuzz"), data);
    }
}
