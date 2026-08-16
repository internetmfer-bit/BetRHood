import { getNameDirectory, type DirectoryEntry } from "@betrhood/sdk";
import type { PublicClient } from "viem";

/** The name directory (every address with a name currently set) is fetched by scanning the
 * whole Profile contract's event history — cheap today, but re-fetching it on every render
 * everywhere it's needed would add unnecessary RPC load. Cached at module scope so it's
 * fetched once per page load, the first time anyone actually searches, not eagerly on mount. */
let cached: Promise<DirectoryEntry[]> | null = null;

export function loadDirectory(publicClient: PublicClient): Promise<DirectoryEntry[]> {
  if (!cached) {
    cached = getNameDirectory(publicClient).catch((err) => {
      cached = null; // let the next search retry instead of caching a permanent failure
      throw err;
    });
  }
  return cached;
}

export function matchesQuery(entry: DirectoryEntry, query: string): boolean {
  const q = query.toLowerCase();
  return entry.name.toLowerCase().includes(q) || entry.address.toLowerCase().includes(q);
}
