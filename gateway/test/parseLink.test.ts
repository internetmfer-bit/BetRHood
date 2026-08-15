import { describe, expect, it } from "vitest";
import { InvalidLinkError, parseLink } from "../src/parseLink.js";

const VALID_ADDRESS = "0xf89fb2197682f0679ABeDE1D61bbc978f2667210";

describe("parseLink", () => {
  it("parses a well-formed /<address>/<key> path", () => {
    const result = parseLink(`/${VALID_ADDRESS}/avatar.png`);
    expect(result.owner).toBe(VALID_ADDRESS);
    expect(result.key).toBe("avatar.png");
  });

  it("decodes a URL-encoded key", () => {
    const result = parseLink(`/${VALID_ADDRESS}/my%20file.png`);
    expect(result.key).toBe("my file.png");
  });

  it("tolerates a trailing slash", () => {
    const result = parseLink(`/${VALID_ADDRESS}/avatar.png/`);
    expect(result.key).toBe("avatar.png");
  });

  it("rejects a path with no key segment", () => {
    expect(() => parseLink(`/${VALID_ADDRESS}`)).toThrow(InvalidLinkError);
  });

  it("rejects a path with extra segments", () => {
    expect(() => parseLink(`/${VALID_ADDRESS}/folder/file.png`)).toThrow(InvalidLinkError);
  });

  it("rejects an invalid address", () => {
    expect(() => parseLink("/not-an-address/file.png")).toThrow(InvalidLinkError);
  });

  it("rejects an address that's the wrong length", () => {
    expect(() => parseLink("/0xabc123/file.png")).toThrow(InvalidLinkError);
  });
});
