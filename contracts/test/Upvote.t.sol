// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Upvote} from "../src/Upvote.sol";

/// @dev Minimal fake ERC721 — only the `balanceOf` surface Upvote actually calls.
contract MockERC721 {
    mapping(address => uint256) public balanceOf;

    function mint(address to) external {
        balanceOf[to] += 1;
    }
}

/// @dev Minimal fake ERC1155 — only the `balanceOf(address,uint256)` surface Upvote calls.
contract MockERC1155 {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function mint(address to, uint256 id) external {
        balanceOf[to][id] += 1;
    }
}

contract UpvoteTest is Test {
    Upvote internal upvote;
    MockERC721 internal nft721;
    MockERC1155 internal nft1155;

    address internal owner = address(0xB055);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant BADGE_ID = 3;

    function setUp() public {
        upvote = new Upvote(owner);
        nft721 = new MockERC721();
        nft1155 = new MockERC1155();
    }

    function test_Upvote_RevertsIfCollectionNotAllowed() public {
        nft721.mint(alice);
        vm.prank(alice);
        vm.expectRevert(Upvote.CollectionNotAllowed.selector);
        upvote.upvote(1, address(nft721));
    }

    function test_Upvote_ERC721Holder_Succeeds() public {
        vm.prank(owner);
        upvote.allowCollection721(address(nft721));

        nft721.mint(alice);

        vm.prank(alice);
        upvote.upvote(1, address(nft721));

        assertEq(upvote.upvoteCount(1), 1);
        assertTrue(upvote.hasVoted(1, alice));
    }

    function test_Upvote_ERC721NonHolder_Reverts() public {
        vm.prank(owner);
        upvote.allowCollection721(address(nft721));

        vm.prank(alice);
        vm.expectRevert(Upvote.NoBalance.selector);
        upvote.upvote(1, address(nft721));
    }

    function test_Upvote_ERC1155Holder_Succeeds() public {
        vm.prank(owner);
        upvote.allowCollection1155(address(nft1155), BADGE_ID);

        nft1155.mint(alice, BADGE_ID);

        vm.prank(alice);
        upvote.upvote(1, address(nft1155));

        assertEq(upvote.upvoteCount(1), 1);
    }

    function test_Upvote_ERC1155HolderOfWrongId_Reverts() public {
        vm.prank(owner);
        upvote.allowCollection1155(address(nft1155), BADGE_ID);

        nft1155.mint(alice, BADGE_ID + 1); // holds a different token id

        vm.prank(alice);
        vm.expectRevert(Upvote.NoBalance.selector);
        upvote.upvote(1, address(nft1155));
    }

    function test_Upvote_SameAddressTwice_Reverts() public {
        vm.prank(owner);
        upvote.allowCollection721(address(nft721));
        nft721.mint(alice);

        vm.prank(alice);
        upvote.upvote(1, address(nft721));

        vm.prank(alice);
        vm.expectRevert(Upvote.AlreadyVoted.selector);
        upvote.upvote(1, address(nft721));
    }

    function test_Upvote_DifferentVotersOnSameMessage_BothCount() public {
        vm.prank(owner);
        upvote.allowCollection721(address(nft721));
        nft721.mint(alice);
        nft721.mint(bob);

        vm.prank(alice);
        upvote.upvote(1, address(nft721));
        vm.prank(bob);
        upvote.upvote(1, address(nft721));

        assertEq(upvote.upvoteCount(1), 2);
    }

    function test_Upvote_SameVoterDifferentMessages_BothCount() public {
        vm.prank(owner);
        upvote.allowCollection721(address(nft721));
        nft721.mint(alice);

        vm.prank(alice);
        upvote.upvote(1, address(nft721));
        vm.prank(alice);
        upvote.upvote(2, address(nft721));

        assertEq(upvote.upvoteCount(1), 1);
        assertEq(upvote.upvoteCount(2), 1);
    }

    function test_RemoveCollection_BlocksFurtherVotes() public {
        vm.prank(owner);
        upvote.allowCollection721(address(nft721));
        nft721.mint(alice);
        nft721.mint(bob);

        vm.prank(alice);
        upvote.upvote(1, address(nft721));

        vm.prank(owner);
        upvote.removeCollection(address(nft721));

        vm.prank(bob);
        vm.expectRevert(Upvote.CollectionNotAllowed.selector);
        upvote.upvote(1, address(nft721));

        // Alice's earlier vote still stands — removal isn't retroactive.
        assertEq(upvote.upvoteCount(1), 1);
    }

    function test_OnlyOwner_CanManageAllowlist() public {
        vm.prank(alice);
        vm.expectRevert(); // Solady Ownable's Unauthorized()
        upvote.allowCollection721(address(nft721));

        vm.prank(alice);
        vm.expectRevert();
        upvote.removeCollection(address(nft721));
    }

    function test_Enumeration_TracksEverAllowedRegardlessOfRemoval() public {
        vm.startPrank(owner);
        upvote.allowCollection721(address(nft721));
        upvote.allowCollection1155(address(nft1155), BADGE_ID);
        upvote.removeCollection(address(nft721));
        vm.stopPrank();

        assertEq(upvote.everAllowedCount(), 2);
        assertEq(upvote.everAllowedAt(0), address(nft721));
        assertEq(upvote.everAllowedAt(1), address(nft1155));

        (bool nft721Allowed,,) = upvote.collections(address(nft721));
        (bool nft1155Allowed,,) = upvote.collections(address(nft1155));
        assertFalse(nft721Allowed);
        assertTrue(nft1155Allowed);
    }
}
