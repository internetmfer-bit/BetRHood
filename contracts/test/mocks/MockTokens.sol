// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal fake ERC721 — only the `balanceOf` surface Upvote actually calls, plus an
/// open `mint` so tests (Foundry and SDK/TS alike) can hand out tokens freely.
contract MockERC721 {
    mapping(address => uint256) public balanceOf;

    function mint(address to) external {
        balanceOf[to] += 1;
    }
}

/// @dev Minimal fake ERC1155 — only the `balanceOf(address,uint256)` surface Upvote calls,
/// plus an open `mint`.
contract MockERC1155 {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function mint(address to, uint256 id) external {
        balanceOf[to][id] += 1;
    }
}
