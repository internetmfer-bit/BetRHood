import { type Address, type Transport, createPublicClient, fallback, http } from "viem";
import { addresses, resolve, robinhoodChain } from "@betrhood/sdk";
import { contentTypeForKey } from "./contentType.js";
import { InvalidLinkError, parseLink } from "./parseLink.js";

export interface Env {
  /** Public endpoint, no API key — safe to commit as a plain var. Free but shared/rate-limited,
   * so it's the last resort, not the first choice. */
  RPC_URL?: string;
  /** Dedicated free-tier providers (Alchemy, Chainstack, ...) — these URLs embed an API key,
   * so they must be set as Cloudflare *secrets* (dashboard "Encrypt" toggle), never committed
   * to wrangler.jsonc. Either or both may be unset; the chain below degrades gracefully. */
  RPC_URL_PRIMARY?: string;
  RPC_URL_SECONDARY?: string;
  STORAGE_ADDRESS?: string;
}

/** Tries the dedicated providers first (highest free-tier limits), falling back to the next
 * one on failure, and only reaching the shared public endpoint if both are unset or down. */
function buildTransport(env: Env): Transport {
  const urls = [env.RPC_URL_PRIMARY, env.RPC_URL_SECONDARY, env.RPC_URL || robinhoodChain.rpcUrls.default.http[0]]
    .filter((url): url is string => Boolean(url));
  return urls.length === 1 ? http(urls[0]) : fallback(urls.map((url) => http(url)));
}

/** Content is mutable (Storage.sol versions can be overwritten), so this is a short cache,
 * not "immutable forever" — long enough to take real load off the RPC, short enough that an
 * update to a key shows up again quickly. */
const CACHE_TTL_SECONDS = 60;

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
};

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse("Method not allowed", 405);
    }

    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return textResponse("BetRHood Protocol gateway. Try /<address>/<key>.", 200);
    }

    let parsed: { owner: Address; key: string };
    try {
      parsed = parseLink(url.pathname);
    } catch (err) {
      if (err instanceof InvalidLinkError) return textResponse(err.message, 400);
      throw err;
    }

    // The Cache API only exists in the real Workers runtime, not in plain test environments —
    // guarded so the same code runs correctly in both.
    const cache = typeof caches !== "undefined" ? caches.default : undefined;
    const cacheKey = new Request(url.toString(), request);
    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    }

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: buildTransport(env),
    });

    const storageAddress = (env.STORAGE_ADDRESS as Address | undefined) || addresses.storage;

    let bytes: Uint8Array;
    try {
      bytes = await resolve(publicClient, parsed.owner, parsed.key, { storageAddress });
    } catch (err) {
      return textResponse(`Chain read failed: ${(err as Error).message}`, 502);
    }

    if (bytes.length === 0) {
      return textResponse("Not found", 404);
    }

    const response = new Response(bytes, {
      status: 200,
      headers: {
        "content-type": contentTypeForKey(parsed.key),
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
        ...CORS_HEADERS,
      },
    });

    if (cache) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
