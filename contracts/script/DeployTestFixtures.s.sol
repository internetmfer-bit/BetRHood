// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockERC721, MockERC1155} from "../test/mocks/MockTokens.sol";

/// @notice Deploys the mock NFT contracts used by SDK tests to exercise `upvote()` against a
/// real ERC721/ERC1155 `balanceOf` surface. Local test fixtures only — never run this against
/// mainnet or any real chain.
contract DeployTestFixtures is Script {
    function run() external returns (MockERC721 mockErc721, MockERC1155 mockErc1155) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        mockErc721 = new MockERC721();
        console.log("MockERC721 deployed at:", address(mockErc721));

        mockErc1155 = new MockERC1155();
        console.log("MockERC1155 deployed at:", address(mockErc1155));

        vm.stopBroadcast();
    }
}
