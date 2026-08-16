export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
export const TEXT_EXTENSIONS = new Set(["txt", "json", "md", "html", "css", "js"]);

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function extensionOf(key: string): string {
  const i = key.lastIndexOf(".");
  return i === -1 ? "" : key.slice(i + 1).toLowerCase();
}

export function isImageKey(key: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(key));
}

export function mimeForExtension(ext: string): string {
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}
