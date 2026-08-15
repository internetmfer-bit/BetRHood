/** Kept safely under Storage.sol's on-chain MAX_CHUNK_SIZE (23,500 bytes) so nothing here
 * can ever produce a chunk the contract would reject. */
export const CHUNK_SIZE = 20_000;

export function splitIntoChunks(data: Uint8Array, chunkSize = CHUNK_SIZE): Uint8Array[] {
  if (data.length === 0) return [new Uint8Array(0)];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    chunks.push(data.subarray(offset, offset + chunkSize));
  }
  return chunks;
}

export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
