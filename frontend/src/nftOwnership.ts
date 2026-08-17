import type { Address, PublicClient } from "viem";

const ERC721_OWNER_OF_ABI = [
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

const ERC1155_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/** How many ownerOf/balanceOf calls one scan will batch through Multicall3 in a single RPC
 * round-trip — same "one wide call beats N narrow ones" idea as this app's other bounded-fan-out
 * reads (see social.ts's FEED_CANDIDATE_CAP). Callers page through wider ranges in chunks of
 * this size rather than scanning an entire collection at once. */
export const SCAN_CHUNK_SIZE = 250;

/**
 * Finds which token ids in [startTokenId, endTokenId] (inclusive) `owner` currently holds in
 * `collection` — the same mechanism Net Protocol's own Bazaar uses for "items owned by you"
 * (their API takes an explicit startTokenId/endTokenId range too): brute-force ownerOf/balanceOf
 * across the range, batched into one RPC round-trip via Multicall3 — a canonical, permissionless,
 * ownerless contract deployed at the same address on virtually every EVM chain (confirmed live on
 * Robinhood Chain mainnet), the same "reuse what's already there" pattern as Seaport. No indexer,
 * no third-party API, no dependency this app doesn't already have via viem's built-in multicall
 * support. Reverts on individual calls (a token id that was never minted) are tolerated
 * (allowFailure) rather than failing the whole scan.
 */
export async function scanOwnedTokens(
  publicClient: PublicClient,
  collection: Address,
  owner: Address,
  standard: "ERC721" | "ERC1155",
  startTokenId: bigint,
  endTokenId: bigint,
): Promise<bigint[]> {
  if (endTokenId < startTokenId) return [];
  const ids: bigint[] = [];
  for (let id = startTokenId; id <= endTokenId; id++) ids.push(id);

  if (standard === "ERC721") {
    const results = await publicClient.multicall({
      contracts: ids.map((id) => ({
        address: collection,
        abi: ERC721_OWNER_OF_ABI,
        functionName: "ownerOf",
        args: [id],
      })),
      allowFailure: true,
    });
    return ids.filter((_, i) => {
      const r = results[i];
      return r.status === "success" && (r.result as Address).toLowerCase() === owner.toLowerCase();
    });
  }

  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: collection,
      abi: ERC1155_BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [owner, id],
    })),
    allowFailure: true,
  });
  return ids.filter((_, i) => {
    const r = results[i];
    return r.status === "success" && (r.result as bigint) > 0n;
  });
}
