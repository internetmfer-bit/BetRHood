import { describe, expect, it } from "vitest";
import { contentTypeForKey } from "../src/contentType.js";

describe("contentTypeForKey", () => {
  it("maps known extensions to their MIME type", () => {
    expect(contentTypeForKey("avatar.png")).toBe("image/png");
    expect(contentTypeForKey("photo.jpg")).toBe("image/jpeg");
    expect(contentTypeForKey("data.json")).toBe("application/json");
  });

  it("is case-insensitive on the extension", () => {
    expect(contentTypeForKey("AVATAR.PNG")).toBe("image/png");
  });

  it("falls back to application/octet-stream for unknown extensions", () => {
    expect(contentTypeForKey("file.xyz123")).toBe("application/octet-stream");
  });

  it("falls back to application/octet-stream when there's no extension at all", () => {
    expect(contentTypeForKey("no-extension-here")).toBe("application/octet-stream");
  });

  it("falls back to application/octet-stream when the dot is the last character", () => {
    expect(contentTypeForKey("trailing-dot.")).toBe("application/octet-stream");
  });

  it("uses the last dot for files with multiple dots", () => {
    expect(contentTypeForKey("archive.tar.gz")).toBe("application/octet-stream");
    expect(contentTypeForKey("my.file.png")).toBe("image/png");
  });
});
