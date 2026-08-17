export interface TrendingToken {
  symbol: string;
  priceUsd: number;
  change24h: number;
  volumeUsd24h: number;
  dex: string;
  poolAddress: string;
}

/** GeckoTerminal's own pool page — the real source of this data, and the natural place to send
 * someone who wants a chart, contract address, and full trade history for one token. Returns
 * null when there's no pool address to link to, so callers can render plain text instead. */
export function geckoTerminalUrl(token: TrendingToken): string | null {
  if (!token.poolAddress) return null;
  return `https://www.geckoterminal.com/robinhood/pools/${token.poolAddress}`;
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
 * browser, since GeckoTerminal's free tier rate-limits hard under real traffic). Throws on a
 * failed fetch rather than resolving to an empty array — a rate-limited/failed request and a
 * genuinely empty result are different things callers need to tell apart (an error shouldn't
 * read as "nothing is trending"). */
export async function fetchTrending(): Promise<TrendingToken[]> {
  const res = await fetch("https://gateway.betrhood.com/trending");
  if (!res.ok) throw new Error(`gateway returned ${res.status}`);
  return (await res.json()) as TrendingToken[];
}
