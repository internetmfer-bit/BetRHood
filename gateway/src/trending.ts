const POOLS_URL = (page: number) =>
  `https://api.geckoterminal.com/api/v2/networks/robinhood/pools?page=${page}&sort=h24_volume_usd_desc`;

/** GeckoTerminal caps a single page at 20 pools — this many pages gets us up to MAX_TOKENS
 * unique symbols after dedup, without an unbounded number of upstream requests per cache
 * refresh (this only runs once per CACHE_TTL_SECONDS regardless of visitor count, but still
 * worth keeping modest given how aggressively their free tier rate-limits). */
const PAGES_TO_FETCH = 3;
const MAX_TOKENS = 50;

export interface TrendingToken {
  symbol: string;
  priceUsd: number;
  change24h: number;
  volumeUsd24h: number;
  dex: string;
  /** Pool contract address, for linking out to its GeckoTerminal page. Empty string if GeckoTerminal
   * didn't include one (link should be omitted in that case, not built with a blank address). */
  poolAddress: string;
}

interface GeckoTerminalPool {
  attributes?: {
    name?: string;
    address?: string;
    base_token_price_usd?: string;
    price_change_percentage?: { h24?: string };
    volume_usd?: { h24?: string };
  };
  relationships?: {
    dex?: { data?: { id?: string } };
  };
}

/** Pool names are shaped like "SYMBOL / WETH" or "SYMBOL / WETH 1%" (fee tier suffix on the
 * quote side) — the base token symbol is always the clean first segment. */
function symbolFromPoolName(name: string): string {
  return name.split(" / ")[0]?.trim() ?? name;
}

/** Pure and unit-testable on its own — the actual network fetch is a thin wrapper around this. */
export function parseTrendingPools(json: unknown): TrendingToken[] {
  const data = (json as { data?: GeckoTerminalPool[] })?.data;
  if (!Array.isArray(data)) return [];

  return data
    .map((pool): TrendingToken | null => {
      const a = pool.attributes;
      if (!a?.name || !a.base_token_price_usd) return null;
      const priceUsd = Number(a.base_token_price_usd);
      const change24h = Number(a.price_change_percentage?.h24 ?? "0");
      const volumeUsd24h = Number(a.volume_usd?.h24 ?? "0");
      if (!Number.isFinite(priceUsd)) return null;
      return {
        symbol: symbolFromPoolName(a.name),
        priceUsd,
        change24h: Number.isFinite(change24h) ? change24h : 0,
        volumeUsd24h: Number.isFinite(volumeUsd24h) ? volumeUsd24h : 0,
        dex: pool.relationships?.dex?.data?.id ?? "",
        poolAddress: a.address ?? "",
      };
    })
    .filter((t): t is TrendingToken => t !== null);
}

/** Same pool, listed under multiple fee-tier pairs, would otherwise show up as duplicate rows
 * — keeps the first (highest-volume, since pages are sorted by 24h volume descending) entry
 * per symbol. */
export function dedupeBySymbol(tokens: TrendingToken[]): TrendingToken[] {
  const seen = new Set<string>();
  const result: TrendingToken[] = [];
  for (const t of tokens) {
    if (seen.has(t.symbol)) continue;
    seen.add(t.symbol);
    result.push(t);
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Real tokens only — if GeckoTerminal has nothing (or errors on every page), this returns an
 * empty array rather than fabricating placeholder entries. Callers should render "nothing
 * trending yet" for an empty result, not treat it as a failure. A single failed page doesn't
 * fail the whole fetch — the other pages' real data still comes back.
 *
 * Fetched sequentially with a short delay between requests, not in parallel — a burst of
 * simultaneous requests from a Worker's shared IP range triggers GeckoTerminal's free-tier
 * rate limit far more readily than the same requests spread out by a couple hundred ms. */
export async function fetchTrendingPools(limit = MAX_TOKENS): Promise<TrendingToken[]> {
  const pages: TrendingToken[][] = [];
  for (let i = 0; i < PAGES_TO_FETCH; i++) {
    if (i > 0) await sleep(250);
    try {
      const res = await fetch(POOLS_URL(i + 1));
      if (!res.ok) continue;
      pages.push(parseTrendingPools(await res.json()));
    } catch {
      // skip this page, keep whatever the other pages returned
    }
  }

  return dedupeBySymbol(pages.flat()).slice(0, limit);
}
