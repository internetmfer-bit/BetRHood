import type { Abi, Address, Hex, PublicClient, WalletClient } from "viem";
import { addresses } from "./addresses.js";
import ProfileAbiJson from "./abi/Profile.json" with { type: "json" };
import { toKey } from "./keys.js";
import { resolve, upload } from "./storage.js";

const ProfileAbi = ProfileAbiJson as Abi;

/** Fixed Storage key every profile picture lives under — a convention, not a contract rule,
 * so every integration that uses this SDK can find anyone's picture the same way. */
const PICTURE_KEY = "betrhood:profile-picture";

/** Same convention as PICTURE_KEY, but for bio text. Bio lives entirely in Storage — unlike
 * the picture, there's no pointer on the Profile contract at all, since resolve() already
 * returns empty bytes for "never written," which is all the signal we need. */
const BIO_KEY = "betrhood:profile-bio";
const MAX_BIO_LENGTH = 280;

export class BioTooLongError extends Error {
  constructor(length: number, max: number) {
    super(`Bio is ${length} bytes, max is ${max}. Use a shorter bio.`);
  }
}

/** Note: this only carries the name and whether a picture is set — resolving the actual
 * picture bytes is a separate call, `getProfilePicture()`, since it's a second contract read. */
export interface Profile {
  name: string;
  pictureKey: Hex;
  hasPicture: boolean;
}

export class NameTooLongError extends Error {
  constructor(length: number, max: number) {
    super(`Name is ${length} bytes, max is ${max}. Use a shorter name.`);
  }
}

export async function setName(
  publicClient: PublicClient,
  walletClient: WalletClient,
  name: string,
  options?: { profileAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const address = options?.profileAddress ?? addresses.profile;

  const maxLength = (await publicClient.readContract({
    address,
    abi: ProfileAbi,
    functionName: "MAX_NAME_LENGTH",
  })) as bigint;

  const nameBytes = new TextEncoder().encode(name).length;
  if (nameBytes > Number(maxLength)) throw new NameTooLongError(nameBytes, Number(maxLength));

  const { request } = await publicClient.simulateContract({
    address,
    abi: ProfileAbi,
    functionName: "setName",
    args: [name],
    account: walletClient.account,
  });

  return walletClient.writeContract(request);
}

/** Uploads `picture` through the normal Storage path, then points the caller's profile at it. */
export async function setPicture(
  publicClient: PublicClient,
  walletClient: WalletClient,
  picture: Uint8Array,
  options?: { profileAddress?: Address; storageAddress?: Address },
): Promise<{ uploadTxHash: Hex; profileTxHash: Hex }> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");

  const { txHash: uploadTxHash } = await upload(publicClient, walletClient, PICTURE_KEY, picture, {
    storageAddress: options?.storageAddress,
  });

  const address = options?.profileAddress ?? addresses.profile;

  const { request } = await publicClient.simulateContract({
    address,
    abi: ProfileAbi,
    functionName: "setPictureKey",
    args: [toKey(PICTURE_KEY)],
    account: walletClient.account,
  });

  const profileTxHash = await walletClient.writeContract(request);

  return { uploadTxHash, profileTxHash };
}

export async function setBio(
  publicClient: PublicClient,
  walletClient: WalletClient,
  bio: string,
  options?: { storageAddress?: Address },
): Promise<Hex> {
  const bytes = new TextEncoder().encode(bio);
  if (bytes.length > MAX_BIO_LENGTH) throw new BioTooLongError(bytes.length, MAX_BIO_LENGTH);

  const { txHash } = await upload(publicClient, walletClient, BIO_KEY, bytes, {
    storageAddress: options?.storageAddress,
  });
  return txHash;
}

/** Returns the empty string if no bio has ever been set — same "empty means unset" signal
 * resolve() already gives for any never-written key. */
export async function getBio(
  publicClient: PublicClient,
  who: Address,
  options?: { storageAddress?: Address },
): Promise<string> {
  const bytes = await resolve(publicClient, who, BIO_KEY, { storageAddress: options?.storageAddress });
  return bytes.length === 0 ? "" : new TextDecoder().decode(bytes);
}

export interface DirectoryEntry {
  address: Address;
  name: string;
}

/**
 * Every address that currently has a display name set, newest-first by when the name was
 * (last) set — built by scanning `NameSet` events rather than a contract-side index, since
 * `Profile` itself has no way to enumerate every address that's ever called `setName`. An
 * address that renamed multiple times appears once, with its current name; an address that
 * renamed to an empty string is dropped (equivalent to never having set one). Cheap today —
 * one log-fetch covers the whole history — but this does re-scan the entire event log every
 * call, so a caller displaying this often should cache the result rather than re-fetching on
 * every render.
 */
export async function getNameDirectory(
  publicClient: PublicClient,
  options?: { profileAddress?: Address; fromBlock?: bigint },
): Promise<DirectoryEntry[]> {
  const address = options?.profileAddress ?? addresses.profile;

  const logs = await publicClient.getContractEvents({
    address,
    abi: ProfileAbi,
    eventName: "NameSet",
    fromBlock: options?.fromBlock ?? 0n,
    toBlock: "latest",
  });

  // Ascending by (blockNumber, logIndex) so the last write per address wins below — most RPC
  // nodes already return logs in this order, but that's not a guarantee worth relying on.
  const sorted = [...logs].sort((a, b) => {
    const blockDiff = (a.blockNumber ?? 0n) - (b.blockNumber ?? 0n);
    if (blockDiff !== 0n) return blockDiff < 0n ? -1 : 1;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });

  const latest = new Map<Address, string>();
  for (const log of sorted) {
    const args = (log as unknown as { args: { who: Address; name: string } }).args;
    latest.set(args.who, args.name);
  }

  return [...latest.entries()]
    .filter(([, name]) => name.length > 0)
    .reverse()
    .map(([entryAddress, name]) => ({ address: entryAddress, name }));
}

export async function getProfile(
  publicClient: PublicClient,
  who: Address,
  options?: { profileAddress?: Address },
): Promise<Profile> {
  const [name, pictureKey, hasPicture] = (await publicClient.readContract({
    address: options?.profileAddress ?? addresses.profile,
    abi: ProfileAbi,
    functionName: "getProfile",
    args: [who],
  })) as [string, Hex, boolean];

  return { name, pictureKey, hasPicture };
}

/** Resolves the actual picture bytes via Storage, using the same fixed key convention
 * `setPicture` wrote to. Returns `null` if the address has no picture set. */
export async function getProfilePicture(
  publicClient: PublicClient,
  who: Address,
  options?: { profileAddress?: Address; storageAddress?: Address },
): Promise<Uint8Array | null> {
  const profile = await getProfile(publicClient, who, options);
  if (!profile.hasPicture) return null;
  return resolve(publicClient, who, PICTURE_KEY, { storageAddress: options?.storageAddress });
}
