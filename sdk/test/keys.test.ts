import { describe, expect, it } from "vitest";
import { toKey } from "../src/keys.js";

describe("toKey", () => {
  it("is deterministic — same string always produces the same key", () => {
    expect(toKey("hello.txt")).toBe(toKey("hello.txt"));
  });

  it("different strings produce different keys", () => {
    expect(toKey("a")).not.toBe(toKey("b"));
  });

  it("always returns a 32-byte (66-char incl. 0x) hex value, regardless of input length", () => {
    expect(toKey("x").length).toBe(66);
    expect(toKey("a".repeat(500)).length).toBe(66);
  });
});
