const OPENSEA_API = "https://api.opensea.io/api/v2";
const CHAIN = "robinhood";

/** Every real OpenSea v2 endpoint requires a key — this one is free, self-issued with a single
 * POST, needs no signup/wallet/human, and is exactly what OpenSea's own docs recommend for
 * exactly this kind of light, automated use. Rate limit is 600 reads/hour, far more than this
 * gateway needs given its own cache below only refreshes every few minutes. */
const KEY_ISSUE_URL = `${OPENSEA_API}/auth/keys`;
/** Keys expire after 7 days — cached comfortably under that so a stale key is never served. */
const KEY_CACHE_TTL_SECONDS = 6 * 24 * 60 * 60;
const KEY_CACHE_URL = "https://internal.betrhood/opensea-api-key";

const PAGE_SIZE = 30;
/** Floor/volume don't come back from the collections list itself — only from a per-collection
 * stats call — so this caps how many of the top (by the list's own volume ordering) collections
 * get enriched, keeping the request count per refresh predictable. */
const STATS_ENRICH_LIMIT = 20;
const MAX_NFTS = 20;

export interface TrendingNFT {
  name: string;
  slug: string;
  imageUrl: string;
  floorPriceEth: number;
  volume24hEth: number;
  openseaUrl: string;
}

interface OpenSeaCollection {
  collection?: string;
  name?: string;
  image_url?: string;
  opensea_url?: string;
}

interface OpenSeaStats {
  total?: { floor_price?: number };
  intervals?: { interval?: string; volume?: number }[];
}

async function getApiKey(cache: Cache | undefined): Promise<string> {
  const cacheKey = new Request(KEY_CACHE_URL);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached.text();
  }

  const res = await fetch(KEY_ISSUE_URL, { method: "POST" });
  if (!res.ok) throw new Error(`OpenSea key issuance failed: ${res.status}`);
  const { api_key } = (await res.json()) as { api_key?: string };
  if (!api_key) throw new Error("OpenSea key issuance returned no api_key");

  if (cache) {
    const response = new Response(api_key, {
      headers: { "cache-control": `private, max-age=${KEY_CACHE_TTL_SECONDS}` },
    });
    await cache.put(cacheKey, response);
  }

  return api_key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pure and unit-testable — the actual network fetch is a thin wrapper around this. */
export function parseCollectionsList(json: unknown): { slug: string; name: string; imageUrl: string; openseaUrl: string }[] {
  const collections = (json as { collections?: OpenSeaCollection[] })?.collections;
  if (!Array.isArray(collections)) return [];

  return collections
    .map((c) => {
      if (!c.collection || !c.name) return null;
      return {
        slug: c.collection,
        name: c.name,
        imageUrl: c.image_url ?? "",
        openseaUrl: c.opensea_url ?? `https://opensea.io/collection/${c.collection}`,
      };
    })
    .filter((c): c is { slug: string; name: string; imageUrl: string; openseaUrl: string } => c !== null);
}

/** Pure and unit-testable — extracts floor price and 24h ("one_day") volume from a stats
 * response, defaulting missing figures to 0 rather than throwing. */
export function parseStats(json: unknown): { floorPriceEth: number; volume24hEth: number } {
  const stats = json as OpenSeaStats;
  const floorPriceEth = Number(stats?.total?.floor_price ?? 0);
  const oneDay = stats?.intervals?.find((i) => i.interval === "one_day");
  const volume24hEth = Number(oneDay?.volume ?? 0);
  return {
    floorPriceEth: Number.isFinite(floorPriceEth) ? floorPriceEth : 0,
    volume24hEth: Number.isFinite(volume24hEth) ? volume24hEth : 0,
  };
}

/** Real collections only — an upstream failure (rate limit, key issuance down) returns an empty
 * array rather than fabricating placeholder entries. A single collection's stats failing doesn't
 * fail the whole fetch, it's just dropped from the result. */
export async function fetchTrendingNFTs(cache?: Cache): Promise<TrendingNFT[]> {
  const apiKey = await getApiKey(cache);
  const headers = { "x-api-key": apiKey };

  const listRes = await fetch(
    `${OPENSEA_API}/collections?chain=${CHAIN}&order_by=one_day_volume&limit=${PAGE_SIZE}`,
    { headers },
  );
  if (!listRes.ok) throw new Error(`OpenSea collections list failed: ${listRes.status}`);
  const collections = parseCollectionsList(await listRes.json()).slice(0, STATS_ENRICH_LIMIT);

  const enriched: TrendingNFT[] = [];
  for (let i = 0; i < collections.length; i++) {
    if (i > 0) await sleep(150);
    const c = collections[i];
    try {
      const statsRes = await fetch(`${OPENSEA_API}/collections/${c.slug}/stats`, { headers });
      if (!statsRes.ok) continue;
      const { floorPriceEth, volume24hEth } = parseStats(await statsRes.json());
      if (volume24hEth <= 0) continue; // not really "trending" with zero recent activity
      enriched.push({ name: c.name, slug: c.slug, imageUrl: c.imageUrl, floorPriceEth, volume24hEth, openseaUrl: c.openseaUrl });
    } catch {
      // skip this collection, keep the rest
    }
  }

  return enriched.sort((a, b) => b.volume24hEth - a.volume24hEth).slice(0, MAX_NFTS);
}
