import { describe, expect, it } from "vitest";
import { gunzip, gzip } from "../src/gzip.js";

describe("gzip/gunzip", () => {
  it("round-trips text data exactly", async () => {
    const original = new TextEncoder().encode("hello world, this is a test of gzip round-tripping");
    const compressed = await gzip(original);
    const decompressed = await gunzip(compressed);
    expect(decompressed).toEqual(original);
  });

  it("round-trips binary data exactly", async () => {
    const original = new Uint8Array(5000);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;
    const compressed = await gzip(original);
    const decompressed = await gunzip(compressed);
    expect(decompressed).toEqual(original);
  });

  it("round-trips empty data", async () => {
    const original = new Uint8Array(0);
    const compressed = await gzip(original);
    const decompressed = await gunzip(compressed);
    expect(decompressed).toEqual(original);
  });

  it("actually compresses repetitive data", async () => {
    const original = new TextEncoder().encode("a".repeat(10_000));
    const compressed = await gzip(original);
    expect(compressed.length).toBeLessThan(original.length / 10);
  });
});
