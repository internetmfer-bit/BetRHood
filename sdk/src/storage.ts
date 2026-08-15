import { type Abi, type Address, type Hex, type PublicClient, type WalletClient, hexToBytes, toHex } from "viem";
import { addresses } from "./addresses.js";
import StorageAbiJson from "./abi/Storage.json" with { type: "json" };
import { gunzip, gzip } from "./gzip.js";
import { splitIntoChunks } from "./chunk.js";
import { toKey } from "./keys.js";

const StorageAbi = StorageAbiJson as Abi;

export class EmptyDataError extends Error {
  constructor() {
    super("upload() was called with empty data — there's nothing to store.");
  }
}

/**
 * Uploads `data` under `key`, owned by the connected wallet. Compresses with gzip and splits
 * into on-chain-sized chunks automatically — callers never touch chunking directly.
 *
 * Uses simulate-then-write rather than a plain write: a transaction hash alone can't tell you
 * the version number the contract assigned, only simulating the call first can.
 */
export async function upload(
  publicClient: PublicClient,
  walletClient: WalletClient,
  key: string,
  data: Uint8Array,
  options?: { storageAddress?: Address },
): Promise<{ version: bigint; txHash: Hex }> {
  if (data.length === 0) throw new EmptyDataError();
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");

  const compressed = await gzip(data);
  const chunks = splitIntoChunks(compressed).map((c) => toHex(c));
  const address = options?.storageAddress ?? addresses.storage;

  const { request, result: version } = await publicClient.simulateContract({
    address,
    abi: StorageAbi,
    functionName: "write",
    args: [toKey(key), chunks],
    account: walletClient.account,
  });

  const txHash = await walletClient.writeContract(request);

  return { version: version as bigint, txHash };
}

/**
 * Reads the latest version of `owner`'s `key`, decompresses, and returns the original bytes.
 * Returns an empty Uint8Array if nothing has ever been written to this (owner, key).
 */
export async function resolve(
  publicClient: PublicClient,
  owner: Address,
  key: string,
  options?: { storageAddress?: Address },
): Promise<Uint8Array> {
  const raw = (await publicClient.readContract({
    address: options?.storageAddress ?? addresses.storage,
    abi: StorageAbi,
    functionName: "read",
    args: [owner, toKey(key)],
  })) as Hex;

  const bytes = hexToBytes(raw);
  if (bytes.length === 0) return bytes;
  return gunzip(bytes);
}

export async function getVersionCount(
  publicClient: PublicClient,
  owner: Address,
  key: string,
  options?: { storageAddress?: Address },
): Promise<bigint> {
  return (await publicClient.readContract({
    address: options?.storageAddress ?? addresses.storage,
    abi: StorageAbi,
    functionName: "versionCount",
    args: [owner, toKey(key)],
  })) as bigint;
}
