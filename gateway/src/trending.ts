const GECKOTERMINAL_URL = "https://api.geckoterminal.com/api/v2/networks/robinhood/trending_pools?limit=10";

export interface TrendingToken {
  symbol: string;
  priceUsd: number;
  change24h: number;
  volumeUsd24h: number;
  dex: string;
}

interface GeckoTerminalPool {
  attributes?: {
    name?: string;
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
      };
    })
    .filter((t): t is TrendingToken => t !== null);
}

/** Real tokens only — if GeckoTerminal has nothing (or errors), this returns an empty array
 * rather than fabricating placeholder entries. Callers should render "nothing trending yet"
 * for an empty result, not treat it as a failure. */
export async function fetchTrendingPools(limit = 10): Promise<TrendingToken[]> {
  const res = await fetch(GECKOTERMINAL_URL);
  if (!res.ok) throw new Error(`GeckoTerminal request failed: ${res.status}`);
  const json = await res.json();
  return parseTrendingPools(json).slice(0, limit);
}
