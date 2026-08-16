import { useEffect, useState } from "react";

interface TrendingToken {
  symbol: string;
  priceUsd: number;
  change24h: number;
  volumeUsd24h: number;
  dex: string;
}

function formatPrice(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Real tokens only, straight from Robinhood Chain's actual DEX activity (proxied through our
 * gateway's /trending, which itself proxies GeckoTerminal — never called directly from the
 * browser, since GeckoTerminal's free tier rate-limits hard under real traffic). Renders
 * nothing at all if there's no real data — never fabricates placeholder rows to fill the space.
 */
export function TrendingTicker() {
  const [tokens, setTokens] = useState<TrendingToken[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("https://gateway.betrhood.com/trending")
      .then((res) => (res.ok ? (res.json() as Promise<TrendingToken[]>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setTokens(data);
      })
      .catch(() => {
        if (!cancelled) setTokens([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!tokens || tokens.length === 0) return null;

  // Duplicated once so the scroll animation can loop seamlessly — it translates exactly -50%,
  // landing on an identical second copy of the same list.
  const doubled = [...tokens, ...tokens];

  return (
    <div className="ticker" aria-label="Trending tokens on Robinhood Chain">
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
    </div>
  );
}
