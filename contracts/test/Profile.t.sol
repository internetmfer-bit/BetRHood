// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Profile} from "../src/Profile.sol";

contract ProfileTest is Test {
    Profile internal profile;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        profile = new Profile();
    }

    function test_DefaultProfile_IsEmpty() public view {
        (string memory name, bytes32 pictureKey, bool hasPicture) = profile.getProfile(alice);
        assertEq(name, "");
        assertEq(pictureKey, bytes32(0));
        assertFalse(hasPicture);
    }

    function test_SetName_ThenGetProfile() public {
        vm.prank(alice);
        profile.setName("cody.bet");

        (string memory name,,) = profile.getProfile(alice);
        assertEq(name, "cody.bet");
    }

    function test_SetName_ExactlyMaxLength_Succeeds() public {
        bytes memory raw = new bytes(profile.MAX_NAME_LENGTH());
        for (uint256 i = 0; i < raw.length; ++i) {
            raw[i] = "x";
        }
        string memory name32 = string(raw);

        vm.prank(alice);
        profile.setName(name32);
        (string memory got,,) = profile.getProfile(alice);
        assertEq(got, name32);
    }

    function test_SetName_OverMaxLength_Reverts() public {
        bytes memory raw = new bytes(profile.MAX_NAME_LENGTH() + 1);
        for (uint256 i = 0; i < raw.length; ++i) {
            raw[i] = "x";
        }
        string memory tooLong = string(raw);

        vm.expectRevert(abi.encodeWithSelector(Profile.NameTooLong.selector, raw.length));
        profile.setName(tooLong);
    }

    function test_SetPictureKey_SetsHasPictureTrue() public {
        vm.prank(alice);
        profile.setPictureKey(bytes32("avatar.png"));

        (, bytes32 pictureKey, bool hasPicture) = profile.getProfile(alice);
        assertEq(pictureKey, bytes32("avatar.png"));
        assertTrue(hasPicture);
    }

    function test_PictureKeyOfZero_StillCountsAsSet() public {
        // Distinguishing "never set" from "set to the zero key" is the whole point of
        // the hasPicture flag — this is the case that would silently break without it.
        vm.prank(alice);
        profile.setPictureKey(bytes32(0));

        (, bytes32 pictureKey, bool hasPicture) = profile.getProfile(alice);
        assertEq(pictureKey, bytes32(0));
        assertTrue(hasPicture, "explicitly setting key=0 must still register as set");
    }

    function test_NameAndPicture_AreIndependent() public {
        vm.startPrank(alice);
        profile.setName("cody.bet");
        vm.stopPrank();

        (string memory name, bytes32 pictureKey, bool hasPicture) = profile.getProfile(alice);
        assertEq(name, "cody.bet");
        assertEq(pictureKey, bytes32(0));
        assertFalse(hasPicture, "setting a name must not touch the picture");
    }

    function test_AddressesDoNotCollide() public {
        vm.prank(alice);
        profile.setName("alice-name");
        vm.prank(bob);
        profile.setName("bob-name");

        (string memory aliceName,,) = profile.getProfile(alice);
        (string memory bobName,,) = profile.getProfile(bob);
        assertEq(aliceName, "alice-name");
        assertEq(bobName, "bob-name");
    }

    function test_SetName_Overwrites() public {
        vm.startPrank(alice);
        profile.setName("first");
        profile.setName("second");
        vm.stopPrank();

        (string memory name,,) = profile.getProfile(alice);
        assertEq(name, "second");
    }

    function test_SetName_EmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit Profile.NameSet(alice, "cody.bet");

        vm.prank(alice);
        profile.setName("cody.bet");
    }

    function test_SetPictureKey_EmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit Profile.PictureSet(alice, bytes32("k"));

        vm.prank(alice);
        profile.setPictureKey(bytes32("k"));
    }
}
