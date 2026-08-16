export interface TrendingNFT {
  name: string;
  slug: string;
  imageUrl: string;
  floorPriceEth: number;
  volume24hEth: number;
  openseaUrl: string;
}

export function formatEth(n: number): string {
  if (n === 0) return "0 ETH";
  if (n >= 1) return `${n.toFixed(2)} ETH`;
  return `${n.toFixed(4)} ETH`;
}

/** Real collections only, straight from OpenSea's actual Robinhood Chain listings (proxied
 * through the gateway's /nfts, never called directly from the browser — OpenSea's API requires
 * a key, and the gateway is what holds one). Resolves to an empty array (never rejects) if the
 * upstream fetch fails — callers render "nothing trending yet" rather than an error. */
export async function fetchTrendingNFTs(): Promise<TrendingNFT[]> {
  try {
    const res = await fetch("https://gateway.betrhood.com/nfts");
    if (!res.ok) return [];
    return (await res.json()) as TrendingNFT[];
  } catch {
    return [];
  }
}
