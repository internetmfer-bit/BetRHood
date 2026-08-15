/**
 * Compression helpers built on the native CompressionStream/DecompressionStream Web APIs —
 * available in Node 18+, all modern browsers, and Cloudflare Workers, so the exact same code
 * runs in the frontend, the gateway, and any Node-based integration without a dependency or
 * a version-mismatch risk between environments.
 */

export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  // Not awaited: write() resolves once the chunk is queued, not once compression finishes.
  // Waiting on it before reading `stream.readable` below would deadlock a single-chunk stream.
  void writer.write(new Uint8Array(data));
  void writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(data));
  void writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}
