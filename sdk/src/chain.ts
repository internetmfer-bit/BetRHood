import { defineChain } from "viem";

/**
 * Robinhood Chain mainnet — chain ID 4663, Arbitrum Orbit L2, ETH for gas.
 * https://docs.robinhood.com/chain/connecting
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: {
    // Canonical, permissionless, ownerless deployment — same address on virtually every EVM
    // chain (confirmed live here via getBytecode()). viem only auto-populates this for its own
    // built-in chain definitions, not custom ones like this, so it must be set explicitly or
    // publicClient.multicall() fails with "chain does not support contract multicall3".
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});
