// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockERC721Full, MockERC1155Full} from "../test/mocks/MockNftFull.sol";

/// @notice Deploys full-standard mock NFTs for local Anvil testing of the NFT Store.
/// @dev Seaport itself is NOT deployed here — it's seeded directly via anvil_setCode from
/// sdk/test/setup.ts, copying the exact runtime bytecode already live on Robinhood Chain mainnet
/// at SEAPORT_ADDRESS (see sdk/test/fixtures/seaport-1.6-runtime-bytecode.txt). That's simpler
/// and more faithful than replaying Seaport's original create2 bootstrap sequence (which relies
/// on cheatcodes like vm.etch that only mutate Foundry's in-process simulation state and don't
/// persist against a real external Anvil node driven over RPC, which is how this repo's test
/// harness runs — verified empirically before choosing this approach). Copying the real runtime
/// bytecode also preserves Seaport's compiled-in immutables (domain separator, chain id) exactly
/// as they are on the real deployment. Local test fixtures only — never run against mainnet.
contract DeploySeaportFixture is Script {
    function run() external returns (MockERC721Full mockErc721Full, MockERC1155Full mockErc1155Full) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        mockErc721Full = new MockERC721Full();
        console.log("MockERC721Full deployed at:", address(mockErc721Full));

        mockErc1155Full = new MockERC1155Full();
        console.log("MockERC1155Full deployed at:", address(mockErc1155Full));

        vm.stopBroadcast();
    }
}
