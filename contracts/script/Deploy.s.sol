// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Storage} from "../src/Storage.sol";
import {Messaging} from "../src/Messaging.sol";
import {Profile} from "../src/Profile.sol";

/// @notice Deploys Storage, Messaging, and Profile in one broadcast.
/// @dev Reads the deployer key from the `PRIVATE_KEY` env var — never hardcode it here,
/// never commit a `.env` with a real value (it's gitignored, keep it that way).
///
/// Dry run (no gas spent, no broadcast):
///   forge script script/Deploy.s.sol --rpc-url robinhood_mainnet
///
/// Real deploy (spends real ETH — only run this when you mean it):
///   forge script script/Deploy.s.sol --rpc-url robinhood_mainnet --broadcast --verify
contract Deploy is Script {
    function run() external returns (Storage storageContract, Messaging messaging, Profile profile) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Balance (wei):", deployer.balance);

        vm.startBroadcast(deployerKey);

        storageContract = new Storage();
        console.log("Storage deployed at:", address(storageContract));

        messaging = new Messaging();
        console.log("Messaging deployed at:", address(messaging));

        profile = new Profile();
        console.log("Profile deployed at:", address(profile));

        vm.stopBroadcast();
    }
}
