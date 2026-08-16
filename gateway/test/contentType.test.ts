import { describe, expect, it } from "vitest";
import { contentTypeForBytes, contentTypeForKey } from "../src/contentType.js";

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

describe("contentTypeForBytes", () => {
  it("recognizes a PNG signature", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(contentTypeForBytes(bytes)).toBe("image/png");
  });

  it("recognizes a JPEG signature", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(contentTypeForBytes(bytes)).toBe("image/jpeg");
  });

  it("recognizes a GIF signature", () => {
    const bytes = new TextEncoder().encode("GIF89a" + "junk");
    expect(contentTypeForBytes(bytes)).toBe("image/gif");
  });

  it("recognizes a PDF signature", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 rest of file");
    expect(contentTypeForBytes(bytes)).toBe("application/pdf");
  });

  it("recognizes a WEBP signature (RIFF....WEBP)", () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x00, 0x00, 0x00, 0x00, // size, irrelevant here
      0x57, 0x45, 0x42, 0x50, // "WEBP"
    ]);
    expect(contentTypeForBytes(bytes)).toBe("image/webp");
  });

  it("falls back to text/plain for valid UTF-8 with no unusual control characters", () => {
    const bytes = new TextEncoder().encode("hello world, this is dickbutt\nsecond line");
    expect(contentTypeForBytes(bytes)).toBe("text/plain; charset=utf-8");
  });

  it("does not treat binary data containing null bytes as text", () => {
    const bytes = new Uint8Array([104, 105, 0, 1, 2, 255]);
    expect(contentTypeForBytes(bytes)).toBeNull();
  });

  it("returns null for bytes matching no known signature and not valid UTF-8", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x02]);
    expect(contentTypeForBytes(bytes)).toBeNull();
  });

  it("returns null for empty bytes", () => {
    expect(contentTypeForBytes(new Uint8Array(0))).toBeNull();
  });
});
