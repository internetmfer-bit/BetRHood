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
