// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Upvote} from "../src/Upvote.sol";

/// @notice Deploys Upvote standalone — separate from Deploy.s.sol so re-running this never
/// touches the already-live Storage/Messaging/Profile contracts.
/// @dev Reads the deployer key from the `PRIVATE_KEY` env var. The deployer becomes Upvote's
/// owner (the address allowed to manage the collection allowlist). Deploys with open voting
/// already enabled — anyone can upvote with no NFT required until the owner turns it off.
///
/// Dry run (no gas spent, no broadcast):
///   forge script script/DeployUpvote.s.sol --rpc-url robinhood_mainnet
///
/// Real deploy (spends real ETH — only run this when you mean it):
///   forge script script/DeployUpvote.s.sol --rpc-url robinhood_mainnet --broadcast --verify
contract DeployUpvote is Script {
    function run() external returns (Upvote upvote) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Balance (wei):", deployer.balance);

        vm.startBroadcast(deployerKey);

        upvote = new Upvote(deployer, true);
        console.log("Upvote deployed at:", address(upvote));

        vm.stopBroadcast();
    }
}
