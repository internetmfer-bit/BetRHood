import type { Abi, Address, Hex, PublicClient, WalletClient } from "viem";
import { addresses } from "./addresses.js";
import ProfileAbiJson from "./abi/Profile.json" with { type: "json" };
import { toKey } from "./keys.js";
import { resolve, upload } from "./storage.js";

const ProfileAbi = ProfileAbiJson as Abi;

/** Fixed Storage key every profile picture lives under — a convention, not a contract rule,
 * so every integration that uses this SDK can find anyone's picture the same way. */
const PICTURE_KEY = "betrhood:profile-picture";

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
