// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "solady/tokens/ERC721.sol";
import {ERC1155} from "solady/tokens/ERC1155.sol";

/// @dev Full-standard fake ERC721 (ownerOf, approvals, safeTransferFrom, supportsInterface) —
/// unlike the existing minimal MockERC721 in MockTokens.sol (which only implements `balanceOf`
/// for Upvote's read-only gating check), Seaport actually executes a transfer on fulfillment, so
/// the NFT Store's local tests need a real, transferable token. Built on solady's ERC721 rather
/// than hand-rolled to avoid a second hand-written implementation of the standard. Open `mint`
/// so tests can hand out tokens freely — never deployed to mainnet.
contract MockERC721Full is ERC721 {
    function name() public pure override returns (string memory) {
        return "Mock NFT";
    }

    function symbol() public pure override returns (string memory) {
        return "MOCK";
    }

    function tokenURI(uint256) public pure override returns (string memory) {
        return "";
    }

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

/// @dev Full-standard fake ERC1155, same rationale as MockERC721Full above.
contract MockERC1155Full is ERC1155 {
    function uri(uint256) public pure override returns (string memory) {
        return "";
    }

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}
