import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, joinChunks, splitIntoChunks } from "../src/chunk.js";

describe("splitIntoChunks / joinChunks", () => {
  it("keeps small data as a single chunk", () => {
    const data = new TextEncoder().encode("small");
    const chunks = splitIntoChunks(data);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toEqual(data);
  });

  it("splits data larger than CHUNK_SIZE into multiple chunks", () => {
    const data = new Uint8Array(CHUNK_SIZE * 2 + 500);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;

    const chunks = splitIntoChunks(data);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(CHUNK_SIZE);
    expect(chunks[1].length).toBe(CHUNK_SIZE);
    expect(chunks[2].length).toBe(500);
  });

  it("every chunk is at most CHUNK_SIZE, never larger", () => {
    const data = new Uint8Array(CHUNK_SIZE * 5 + 1);
    const chunks = splitIntoChunks(data);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it("joinChunks reverses splitIntoChunks exactly", () => {
    const data = new Uint8Array(CHUNK_SIZE * 3 + 1234);
    for (let i = 0; i < data.length; i++) data[i] = (i * 7) % 256;

    const chunks = splitIntoChunks(data);
    const rejoined = joinChunks(chunks);
    expect(rejoined).toEqual(data);
  });

  it("handles data exactly divisible by CHUNK_SIZE without an empty trailing chunk", () => {
    const data = new Uint8Array(CHUNK_SIZE * 2);
    const chunks = splitIntoChunks(data);
    expect(chunks.length).toBe(2);
    expect(chunks.every((c) => c.length === CHUNK_SIZE)).toBe(true);
  });
});
