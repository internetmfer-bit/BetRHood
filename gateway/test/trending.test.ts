import { describe, expect, it } from "vitest";
import { dedupeBySymbol, parseTrendingPools, type TrendingToken } from "../src/trending.js";

// Trimmed from a real GeckoTerminal /networks/robinhood/trending_pools response captured
// 2026-08-16 — real field names and real shape, not guessed.
const REAL_FIXTURE = {
  data: [
    {
      id: "robinhood_0x668bd096878e01a249a26c52db0a0a30def4815681c050d76e10fbd0c0f2c076",
      type: "pool",
      attributes: {
        base_token_price_usd: "0.0000299306797829554",
        name: "HONKCOIN / WETH",
        price_change_percentage: { h24: "-27.245" },
        volume_usd: { h24: "91749.7316252621" },
      },
      relationships: {
        dex: { data: { id: "pons-v2-dex" } },
      },
    },
    {
      id: "robinhood_0x2c52076b7a6500845bf55b290e0b1d18f3a89c52",
      type: "pool",
      attributes: {
        base_token_price_usd: "0.000359256485952708",
        name: "ONGR / WETH 1%",
        price_change_percentage: { h24: "3268.843" },
        volume_usd: { h24: "1615856.86247889" },
      },
      relationships: {
        dex: { data: { id: "pons-v2-dex" } },
      },
    },
  ],
};

describe("parseTrendingPools", () => {
  it("parses real GeckoTerminal pool data into the simplified shape", () => {
    const result = parseTrendingPools(REAL_FIXTURE);
    expect(result).toEqual([
      { symbol: "HONKCOIN", priceUsd: 0.0000299306797829554, change24h: -27.245, volumeUsd24h: 91749.7316252621, dex: "pons-v2-dex" },
      { symbol: "ONGR", priceUsd: 0.000359256485952708, change24h: 3268.843, volumeUsd24h: 1615856.86247889, dex: "pons-v2-dex" },
    ]);
  });

  it("strips the fee-tier suffix from the quote side, keeping only the base token symbol", () => {
    const result = parseTrendingPools({
      data: [{ attributes: { name: "FOO / WETH 1%", base_token_price_usd: "1" } }],
    });
    expect(result[0].symbol).toBe("FOO");
  });

  it("returns an empty array for a response with no data — never fabricates entries", () => {
    expect(parseTrendingPools({ data: [] })).toEqual([]);
    expect(parseTrendingPools({})).toEqual([]);
    expect(parseTrendingPools(null)).toEqual([]);
  });

  it("skips individual pools missing a name or price rather than throwing", () => {
    const result = parseTrendingPools({
      data: [
        { attributes: { name: "GOOD / WETH", base_token_price_usd: "1.5" } },
        { attributes: { name: "NO_PRICE / WETH" } },
        { attributes: { base_token_price_usd: "1" } },
      ],
    });
    expect(result).toEqual([{ symbol: "GOOD", priceUsd: 1.5, change24h: 0, volumeUsd24h: 0, dex: "" }]);
  });

  it("defaults missing 24h change/volume to 0 rather than NaN", () => {
    const result = parseTrendingPools({
      data: [{ attributes: { name: "X / WETH", base_token_price_usd: "1" } }],
    });
    expect(result[0].change24h).toBe(0);
    expect(result[0].volumeUsd24h).toBe(0);
  });
});

function token(symbol: string, volumeUsd24h: number): TrendingToken {
  return { symbol, priceUsd: 1, change24h: 0, volumeUsd24h, dex: "test-dex" };
}

describe("dedupeBySymbol", () => {
  it("keeps the first occurrence of a repeated symbol, dropping the rest", () => {
    const result = dedupeBySymbol([token("FOO", 100), token("BAR", 50), token("FOO", 10)]);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.symbol)).toEqual(["FOO", "BAR"]);
    // The kept FOO is the first (higher-volume, since callers pass already-sorted input).
    expect(result[0].volumeUsd24h).toBe(100);
  });

  it("passes through a list with no duplicates unchanged", () => {
    const input = [token("FOO", 100), token("BAR", 50)];
    expect(dedupeBySymbol(input)).toEqual(input);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeBySymbol([])).toEqual([]);
  });
});
