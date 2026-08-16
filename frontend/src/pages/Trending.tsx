import { useEffect, useMemo, useState } from "react";
import { fetchTrending, formatPrice, formatVolume, type TrendingToken } from "../trending";

export function Trending() {
  const [tokens, setTokens] = useState<TrendingToken[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchTrending().then((data) => {
      if (!cancelled) setTokens(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!tokens) return [];
    const q = query.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter((t) => t.symbol.toLowerCase().includes(q));
  }, [tokens, query]);

  return (
    <div className="main-wide">
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Trending on Robinhood</h2>
          <span className="section-note">real DEX activity, sorted by 24h volume</span>
        </div>

        <input
          className="field trending-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by symbol…"
        />

        {tokens === null && <p className="hint">Loading…</p>}
        {tokens !== null && tokens.length === 0 && <p className="hint">Nothing trending right now.</p>}
        {tokens !== null && tokens.length > 0 && filtered.length === 0 && (
          <p className="hint">No tokens match "{query}".</p>
        )}

        {filtered.length > 0 && (
          <div className="trending-table-wrap">
            <table className="trending-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>24h</th>
                  <th>24h Volume</th>
                  <th>DEX</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.symbol}>
                    <td className="trending-symbol">{t.symbol}</td>
                    <td>{formatPrice(t.priceUsd)}</td>
                    <td className={t.change24h >= 0 ? "ticker-change-up" : "ticker-change-down"}>
                      {t.change24h >= 0 ? "+" : ""}
                      {t.change24h.toFixed(1)}%
                    </td>
                    <td>{formatVolume(t.volumeUsd24h)}</td>
                    <td className="trending-dex">{t.dex.replace(/-/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
