export interface TrendingToken {
  symbol: string;
  priceUsd: number;
  change24h: number;
  volumeUsd24h: number;
  dex: string;
}

export function formatPrice(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

export function formatVolume(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/** Real tokens only, straight from Robinhood Chain's actual DEX activity (proxied through the
 * gateway's /trending, which itself proxies GeckoTerminal — never called directly from the
 * browser, since GeckoTerminal's free tier rate-limits hard under real traffic). Resolves to an
 * empty array (never rejects) if the upstream fetch fails — callers render "nothing trending
 * yet" rather than an error, and never fabricate placeholder rows to fill the space. */
export async function fetchTrending(): Promise<TrendingToken[]> {
  try {
    const res = await fetch("https://gateway.betrhood.com/trending");
    if (!res.ok) return [];
    return (await res.json()) as TrendingToken[];
  } catch {
    return [];
  }
}
