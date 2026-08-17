import { useEffect, useMemo, useState } from "react";
import { fetchTrending, formatPrice, formatVolume, geckoTerminalUrl, type TrendingToken } from "../trending";

export function Trending() {
  const [tokens, setTokens] = useState<TrendingToken[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchTrending()
      .then((data) => {
        if (!cancelled) setTokens(data);
      })
      .catch(() => {
        // Leave tokens as null — the "still loading" message below doubles as the failure
        // state, since a stuck fetch and a failed one look identical to a reader either way.
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

        {tokens === null && (
          <p className="hint">Loading onchain data — if this takes a while, the RPC may be rate-limited. Refresh to try again.</p>
        )}
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
                {filtered.map((t) => {
                  const url = geckoTerminalUrl(t);
                  return (
                    <tr
                      key={t.symbol}
                      className={url ? "trending-row-clickable" : undefined}
                      onClick={url ? () => window.open(url, "_blank", "noopener,noreferrer") : undefined}
                    >
                      <td className="trending-symbol">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            {t.symbol}
                          </a>
                        ) : (
                          t.symbol
                        )}
                      </td>
                      <td>{formatPrice(t.priceUsd)}</td>
                      <td className={t.change24h >= 0 ? "ticker-change-up" : "ticker-change-down"}>
                        {t.change24h >= 0 ? "+" : ""}
                        {t.change24h.toFixed(1)}%
                      </td>
                      <td>{formatVolume(t.volumeUsd24h)}</td>
                      <td className="trending-dex">{t.dex.replace(/-/g, " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
