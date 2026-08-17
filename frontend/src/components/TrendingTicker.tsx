import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTrending, formatPrice, formatVolume, type TrendingToken } from "../trending";

const TICKER_DISPLAY_LIMIT = 16;

export function TrendingTicker() {
  const [tokens, setTokens] = useState<TrendingToken[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTrending()
      .then((data) => {
        if (!cancelled) setTokens(data);
      })
      .catch(() => {
        // The ticker just stays hidden (renders null below) on a failed/rate-limited fetch —
        // unlike the dedicated Trending page, there's no room here to explain why.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!tokens || tokens.length === 0) return null;

  const shown = tokens.slice(0, TICKER_DISPLAY_LIMIT);
  // Duplicated once so the scroll animation can loop seamlessly — it translates exactly -50%,
  // landing on an identical second copy of the same list.
  const doubled = [...shown, ...shown];

  return (
    <Link to="/trending" className="ticker" aria-label="Trending tokens on Robinhood Chain — click to see all">
      <div className="ticker-track">
        {doubled.map((t, i) => (
          <span
            className="ticker-item"
            key={i}
            title={`${t.dex.replace(/-/g, " ")} · 24h volume ${formatVolume(t.volumeUsd24h)}`}
          >
            <span className="ticker-symbol">{t.symbol}</span>
            <span className="ticker-price">{formatPrice(t.priceUsd)}</span>
            <span className={t.change24h >= 0 ? "ticker-change-up" : "ticker-change-down"}>
              {t.change24h >= 0 ? "+" : ""}
              {t.change24h.toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </Link>
  );
}
