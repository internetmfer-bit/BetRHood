import type { Abi, Address, Hex, PublicClient, WalletClient } from "viem";
import { addresses } from "./addresses.js";
import FollowAbiJson from "./abi/Follow.json" with { type: "json" };

const FollowAbi = FollowAbiJson as Abi;

export class CannotFollowSelfError extends Error {
  constructor() {
    super("You can't follow your own address.");
  }
}

export class AlreadyFollowingError extends Error {
  constructor() {
    super("Already following this address.");
  }
}

export class NotFollowingError extends Error {
  constructor() {
    super("Not currently following this address.");
  }
}

function rethrowKnown(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("CannotFollowSelf")) throw new CannotFollowSelfError();
  if (message.includes("AlreadyFollowing")) throw new AlreadyFollowingError();
  if (message.includes("NotFollowing")) throw new NotFollowingError();
  throw err;
}

export async function follow(
  publicClient: PublicClient,
  walletClient: WalletClient,
  followee: Address,
  options?: { followAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const address = options?.followAddress ?? addresses.follow;

  try {
    const { request } = await publicClient.simulateContract({
      address,
      abi: FollowAbi,
      functionName: "follow",
      args: [followee],
      account: walletClient.account,
    });
    return await walletClient.writeContract(request);
  } catch (err) {
    rethrowKnown(err);
  }
}

export async function unfollow(
  publicClient: PublicClient,
  walletClient: WalletClient,
  followee: Address,
  options?: { followAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const address = options?.followAddress ?? addresses.follow;

  try {
    const { request } = await publicClient.simulateContract({
      address,
      abi: FollowAbi,
      functionName: "unfollow",
      args: [followee],
      account: walletClient.account,
    });
    return await walletClient.writeContract(request);
  } catch (err) {
    rethrowKnown(err);
  }
}

export async function isFollowing(
  publicClient: PublicClient,
  follower: Address,
  followee: Address,
  options?: { followAddress?: Address },
): Promise<boolean> {
  return (await publicClient.readContract({
    address: options?.followAddress ?? addresses.follow,
    abi: FollowAbi,
    functionName: "isFollowing",
    args: [follower, followee],
  })) as boolean;
}

export async function getFollowingCount(
  publicClient: PublicClient,
  who: Address,
  options?: { followAddress?: Address },
): Promise<bigint> {
  return (await publicClient.readContract({
    address: options?.followAddress ?? addresses.follow,
    abi: FollowAbi,
    functionName: "followingCount",
    args: [who],
  })) as bigint;
}

export async function getFollowerCount(
  publicClient: PublicClient,
  who: Address,
  options?: { followAddress?: Address },
): Promise<bigint> {
  return (await publicClient.readContract({
    address: options?.followAddress ?? addresses.follow,
    abi: FollowAbi,
    functionName: "followerCount",
    args: [who],
  })) as bigint;
}

/** Everyone `who` currently follows — walks the append-only history and filters out anyone
 * since unfollowed, so this only ever returns active follows. */
export async function getFollowing(
  publicClient: PublicClient,
  who: Address,
  options?: { followAddress?: Address },
): Promise<Address[]> {
  const address = options?.followAddress ?? addresses.follow;

  const count = (await publicClient.readContract({
    address,
    abi: FollowAbi,
    functionName: "everFollowedCount",
    args: [who],
  })) as bigint;

  const history = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      publicClient.readContract({
        address,
        abi: FollowAbi,
        functionName: "everFollowedAt",
        args: [who, BigInt(i)],
      }) as Promise<Address>,
    ),
  );

  const active = await Promise.all(history.map((followee) => isFollowing(publicClient, who, followee, options)));
  return history.filter((_, i) => active[i]);
}

/** Everyone currently following `who` — same history-plus-filter approach as getFollowing(). */
export async function getFollowers(
  publicClient: PublicClient,
  who: Address,
  options?: { followAddress?: Address },
): Promise<Address[]> {
  const address = options?.followAddress ?? addresses.follow;

  const count = (await publicClient.readContract({
    address,
    abi: FollowAbi,
    functionName: "everFollowedByCount",
    args: [who],
  })) as bigint;

  const history = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      publicClient.readContract({
        address,
        abi: FollowAbi,
        functionName: "everFollowedByAt",
        args: [who, BigInt(i)],
      }) as Promise<Address>,
    ),
  );

  const active = await Promise.all(history.map((follower) => isFollowing(publicClient, follower, who, options)));
  return history.filter((_, i) => active[i]);
}
