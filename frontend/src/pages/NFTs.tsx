import { useEffect, useMemo, useState } from "react";
import { fetchTrendingNFTs, formatEth, type TrendingNFT } from "../nfts";

export function NFTs() {
  const [collections, setCollections] = useState<TrendingNFT[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchTrendingNFTs().then((data) => {
      if (!cancelled) setCollections(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!collections) return [];
    const q = query.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.name.toLowerCase().includes(q));
  }, [collections, query]);

  return (
    <div className="main-wide">
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Trending NFTs on Robinhood</h2>
          <span className="section-note">real OpenSea activity, sorted by 24h volume</span>
        </div>

        <input
          className="field trending-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
        />

        {collections === null && <p className="hint">Loading…</p>}
        {collections !== null && collections.length === 0 && <p className="hint">Nothing trending right now.</p>}
        {collections !== null && collections.length > 0 && filtered.length === 0 && (
          <p className="hint">No collections match "{query}".</p>
        )}

        {filtered.length > 0 && (
          <div className="nft-grid">
            {filtered.map((c) => (
              <a
                key={c.slug}
                href={c.openseaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="nft-card"
                title={c.name}
              >
                <span className="nft-card-thumb">
                  {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" /> : null}
                </span>
                <span className="nft-card-name">{c.name}</span>
                <span className="nft-card-stats">
                  <span>
                    <span className="nft-card-stat-label">Floor</span> {formatEth(c.floorPriceEth)}
                  </span>
                  <span>
                    <span className="nft-card-stat-label">24h Vol</span> {formatEth(c.volume24hEth)}
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
