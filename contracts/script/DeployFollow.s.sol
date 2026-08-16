// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Follow} from "../src/Follow.sol";

/// @notice Deploys Follow standalone — separate from Deploy.s.sol so re-running this never
/// touches the already-live Storage/Messaging/Profile/Upvote contracts.
/// @dev Reads the deployer key from the `PRIVATE_KEY` env var. Follow has no owner/admin —
/// anyone can follow or unfollow any address, no configuration needed at deploy time.
///
/// Dry run (no gas spent, no broadcast):
///   forge script script/DeployFollow.s.sol --rpc-url robinhood_mainnet
///
/// Real deploy (spends real ETH — only run this when you mean it):
///   forge script script/DeployFollow.s.sol --rpc-url robinhood_mainnet --broadcast --verify
contract DeployFollow is Script {
    function run() external returns (Follow follow) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Balance (wei):", deployer.balance);

        vm.startBroadcast(deployerKey);

        follow = new Follow();
        console.log("Follow deployed at:", address(follow));

        vm.stopBroadcast();
    }
}
