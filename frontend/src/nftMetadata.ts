import type { Address, PublicClient } from "viem";

export interface NftMetadata {
  name: string | null;
  image: string | null;
}

const ERC721_METADATA_ABI = [
  {
    type: "function",
    name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  { type: "function", name: "name", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;

const ERC1155_METADATA_ABI = [
  {
    type: "function",
    name: "uri",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/** Rewrites ipfs:// URIs to an HTTP gateway (browsers can't fetch ipfs:// directly) and, for
 * ERC1155, substitutes the {id} placeholder the standard allows — a 64-char zero-padded lowercase
 * hex token id, per EIP-1155's URI spec. */
function resolveUri(uri: string, erc1155TokenId?: bigint): string {
  let resolved = uri;
  if (erc1155TokenId !== undefined) {
    resolved = resolved.replace("{id}", erc1155TokenId.toString(16).padStart(64, "0"));
  }
  if (resolved.startsWith("ipfs://")) {
    return IPFS_GATEWAY + resolved.slice("ipfs://".length);
  }
  return resolved;
}

function parseJsonUri(uri: string): unknown | null {
  const base64Prefix = "data:application/json;base64,";
  const plainPrefix = "data:application/json,";
  if (uri.startsWith(base64Prefix)) {
    return JSON.parse(atob(uri.slice(base64Prefix.length)));
  }
  if (uri.startsWith(plainPrefix)) {
    return JSON.parse(decodeURIComponent(uri.slice(plainPrefix.length)));
  }
  return null;
}

/** Best-effort: the collection-level `name()` (ERC721 standard; many ERC1155 contracts implement
 * it too even though it isn't part of that standard, so it's worth trying either way). Returns
 * null rather than throwing on a non-compliant contract. */
export async function getCollectionName(publicClient: PublicClient, collection: Address): Promise<string | null> {
  try {
    return (await publicClient.readContract({
      address: collection,
      abi: ERC721_METADATA_ABI,
      functionName: "name",
    })) as string;
  } catch {
    return null;
  }
}

/** Best-effort: fetches on-chain tokenURI/uri, then the metadata JSON it points to, and pulls
 * out `name`/`image`. Returns nulls (never throws) on anything from a non-compliant contract to
 * an unreachable host — callers should fall back to the collection address/token id, same
 * "best-effort, never blocks the rest of the page" convention used everywhere else in this app. */
export async function getNftMetadata(
  publicClient: PublicClient,
  collection: Address,
  tokenId: bigint,
  standard: "ERC721" | "ERC1155",
): Promise<NftMetadata> {
  try {
    let uri: string;
    let fallbackName: string | null = null;

    if (standard === "ERC721") {
      const [tokenUri, collectionName] = await Promise.all([
        publicClient.readContract({
          address: collection,
          abi: ERC721_METADATA_ABI,
          functionName: "tokenURI",
          args: [tokenId],
        }) as Promise<string>,
        getCollectionName(publicClient, collection),
      ]);
      uri = tokenUri;
      fallbackName = collectionName;
    } else {
      uri = (await publicClient.readContract({
        address: collection,
        abi: ERC1155_METADATA_ABI,
        functionName: "uri",
        args: [tokenId],
      })) as string;
    }

    if (!uri) return { name: fallbackName, image: null };
    const resolved = resolveUri(uri, standard === "ERC1155" ? tokenId : undefined);

    const json = (parseJsonUri(resolved) ?? (await (await fetch(resolved)).json())) as { name?: unknown; image?: unknown };

    const image = typeof json.image === "string" ? resolveUri(json.image) : null;
    const name = typeof json.name === "string" ? json.name : fallbackName;
    return { name, image };
  } catch {
    return { name: null, image: null };
  }
}
