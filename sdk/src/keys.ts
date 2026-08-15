import { type Hex, keccak256, toBytes } from "viem";

/**
 * Every onchain key is a bytes32. This turns an arbitrary-length string key (a filename,
 * a slug, whatever the caller wants) into a deterministic bytes32 via keccak256, so callers
 * never have to think about the 32-byte limit themselves.
 */
export function toKey(key: string): Hex {
  return keccak256(toBytes(key));
}
