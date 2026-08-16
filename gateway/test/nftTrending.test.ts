import { describe, expect, it } from "vitest";
import { parseCollectionsList, parseStats } from "../src/nftTrending.js";

// Trimmed from a real OpenSea /v2/collections?chain=robinhood response captured 2026-08-16 —
// real field names and shape, not guessed.
const REAL_COLLECTIONS_FIXTURE = {
  collections: [
    {
      collection: "cashcatss",
      name: "Cash Cats",
      description: "10,000 Cash Cats",
      image_url: "https://i2c.seadn.io/collection/cashcatss/image_type_logo/85d404f808ab106f13790b69054c3f/a185d404f808ab106f13790b69054c3f.png",
      opensea_url: "https://opensea.io/collection/cashcatss",
      contracts: [{ address: "0xe3b34c4bb0f12c82143745eee6a6cf4e3154b1fa", chain: "robinhood" }],
    },
    {
      collection: "stonkbrokers-434284142",
      name: "StonkBrokers",
      image_url: "https://i2c.seadn.io/collection/stonkbrokers-434284142/image_type_logo/d2dfd6700b856a0efa032fe803488f/96d2dfd6700b856a0efa032fe803488f.png",
      opensea_url: "https://opensea.io/collection/stonkbrokers-434284142",
      contracts: [{ address: "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0", chain: "robinhood" }],
    },
  ],
};

// Trimmed from a real OpenSea /v2/collections/{slug}/stats response captured 2026-08-16.
const REAL_STATS_FIXTURE = {
  total: { volume: 997.981283080234, sales: 22921, num_owners: 2915, floor_price: 0.109, floor_price_symbol: "ETH" },
  intervals: [
    { interval: "one_day", volume: 23.862515515041956, sales: 202 },
    { interval: "seven_day", volume: 705.507532113006, sales: 4106 },
    { interval: "thirty_day", volume: 995.7965563148339, sales: 19608 },
  ],
};

describe("parseCollectionsList", () => {
  it("parses real OpenSea collection data into the simplified shape", () => {
    const result = parseCollectionsList(REAL_COLLECTIONS_FIXTURE);
    expect(result).toEqual([
      {
        slug: "cashcatss",
        name: "Cash Cats",
        imageUrl: "https://i2c.seadn.io/collection/cashcatss/image_type_logo/85d404f808ab106f13790b69054c3f/a185d404f808ab106f13790b69054c3f.png",
        openseaUrl: "https://opensea.io/collection/cashcatss",
      },
      {
        slug: "stonkbrokers-434284142",
        name: "StonkBrokers",
        imageUrl: "https://i2c.seadn.io/collection/stonkbrokers-434284142/image_type_logo/d2dfd6700b856a0efa032fe803488f/96d2dfd6700b856a0efa032fe803488f.png",
        openseaUrl: "https://opensea.io/collection/stonkbrokers-434284142",
      },
    ]);
  });

  it("returns an empty array for a response with no collections — never fabricates entries", () => {
    expect(parseCollectionsList({ collections: [] })).toEqual([]);
    expect(parseCollectionsList({})).toEqual([]);
    expect(parseCollectionsList(null)).toEqual([]);
  });

  it("skips entries missing a slug or name rather than throwing", () => {
    const result = parseCollectionsList({
      collections: [
        { collection: "good", name: "Good Collection" },
        { name: "No slug" },
        { collection: "no-name" },
      ],
    });
    expect(result).toEqual([
      { slug: "good", name: "Good Collection", imageUrl: "", openseaUrl: "https://opensea.io/collection/good" },
    ]);
  });
});

describe("parseStats", () => {
  it("extracts floor price and 24h (one_day) volume from a real stats response", () => {
    expect(parseStats(REAL_STATS_FIXTURE)).toEqual({ floorPriceEth: 0.109, volume24hEth: 23.862515515041956 });
  });

  it("defaults missing floor/volume to 0 rather than NaN", () => {
    expect(parseStats({})).toEqual({ floorPriceEth: 0, volume24hEth: 0 });
    expect(parseStats({ total: {}, intervals: [] })).toEqual({ floorPriceEth: 0, volume24hEth: 0 });
  });

  it("returns 0 volume when the one_day interval is missing, without touching other intervals", () => {
    const result = parseStats({
      total: { floor_price: 1.5 },
      intervals: [{ interval: "seven_day", volume: 100 }],
    });
    expect(result).toEqual({ floorPriceEth: 1.5, volume24hEth: 0 });
  });
});
