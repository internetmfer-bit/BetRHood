/**
 * Storage.sol has no concept of a MIME type — it just stores bytes. The gateway infers
 * Content-Type from the file extension in the key itself (e.g. "avatar.png"), which is why
 * the SDK's upload() convention is to give files real extensioned names as keys.
 */
const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  woff: "font/woff",
  woff2: "font/woff2",
};

export function contentTypeForKey(key: string): string {
  const dotIndex = key.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === key.length - 1) return "application/octet-stream";
  const ext = key.slice(dotIndex + 1).toLowerCase();
  return EXTENSION_TO_MIME[ext] ?? "application/octet-stream";
}

/** Matches a byte signature at a fixed offset, `null` bytes acting as wildcards. */
function matchesSignature(bytes: Uint8Array, offset: number, signature: (number | null)[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((expected, i) => expected === null || bytes[offset + i] === expected);
}

/**
 * Guesses a Content-Type straight from the file's actual bytes, for keys with no extension (or
 * an unrecognized one) — an extensionless key like "dickbutt" shouldn't force a download when
 * the bytes themselves are clearly, say, a PNG. Checked in order; the first match wins. Returns
 * `null` (caller falls back to application/octet-stream) if nothing matches.
 */
export function contentTypeForBytes(bytes: Uint8Array): string | null {
  if (matchesSignature(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matchesSignature(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchesSignature(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (matchesSignature(bytes, 0, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (
    matchesSignature(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    matchesSignature(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }

  // No known binary signature — if it decodes as valid UTF-8 with no null bytes or unusual
  // control characters, it's overwhelmingly likely to be plain text worth rendering inline
  // rather than forcing a download of something that's actually just readable.
  if (looksLikeText(bytes)) return "text/plain; charset=utf-8";

  return null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    // Allow tab/newline/carriage-return; anything else in the C0 control range is a strong
    // signal this is actually binary data that merely happened to decode as valid UTF-8.
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return false;
    }
    return true;
  } catch {
    return false;
  }
}
