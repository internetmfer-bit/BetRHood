import { type Abi, type Address, type Hex, type PublicClient, type WalletClient, zeroAddress } from "viem";
import { addresses } from "./addresses.js";
import UpvoteAbiJson from "./abi/Upvote.json" with { type: "json" };

const UpvoteAbi = UpvoteAbiJson as Abi;

export type CollectionStandard = "ERC721" | "ERC1155";

export interface AllowedCollection {
  collection: Address;
  standard: CollectionStandard;
  /** Only meaningful for ERC1155 — the single token id that gates voting. */
  tokenId: bigint;
}

export class CollectionNotAllowedError extends Error {
  constructor() {
    super("upvote() was called with a collection that isn't (or is no longer) allowlisted.");
  }
}

export class AlreadyVotedError extends Error {
  constructor() {
    super("This address already upvoted this message.");
  }
}

export class NoBalanceError extends Error {
  constructor() {
    super("upvote() was called by an address that doesn't hold a qualifying NFT from this collection.");
  }
}

export class OpenVotingDisabledError extends Error {
  constructor() {
    super("Open voting is currently disabled — pass an allowlisted collection to upvote() instead, or enable open voting first.");
  }
}

function standardFromEnum(value: number): CollectionStandard {
  return value === 1 ? "ERC1155" : "ERC721";
}

/** Casts a viem contract revert to the specific typed error it represents, if recognized. */
function rethrowKnown(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("CollectionNotAllowed")) throw new CollectionNotAllowedError();
  if (message.includes("AlreadyVoted")) throw new AlreadyVotedError();
  if (message.includes("NoBalance")) throw new NoBalanceError();
  if (message.includes("OpenVotingDisabled")) throw new OpenVotingDisabledError();
  throw err;
}

/**
 * Upvotes `messageId`. Omit `collection` (or pass nothing) to vote via open voting — no NFT
 * required, only works if the owner has enabled it (throws `OpenVotingDisabledError`
 * otherwise). Pass an allowlisted collection address to instead prove eligibility by holding a
 * qualifying NFT from it. One vote per address per message either way — voting twice, or with
 * a collection the caller doesn't hold, throws.
 */
export async function upvote(
  publicClient: PublicClient,
  walletClient: WalletClient,
  messageId: bigint,
  collection?: Address,
  options?: { upvoteAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const address = options?.upvoteAddress ?? addresses.upvote;

  try {
    const { request } = await publicClient.simulateContract({
      address,
      abi: UpvoteAbi,
      functionName: "upvote",
      args: [messageId, collection ?? zeroAddress],
      account: walletClient.account,
    });
    return await walletClient.writeContract(request);
  } catch (err) {
    rethrowKnown(err);
  }
}

export async function isOpenVotingEnabled(
  publicClient: PublicClient,
  options?: { upvoteAddress?: Address },
): Promise<boolean> {
  return (await publicClient.readContract({
    address: options?.upvoteAddress ?? addresses.upvote,
    abi: UpvoteAbi,
    functionName: "openVotingEnabled",
  })) as boolean;
}

/** Turns open voting on or off. Owner-only. Independent of the collection allowlist — either
 * or both can be active at once. */
export async function setOpenVoting(
  publicClient: PublicClient,
  walletClient: WalletClient,
  enabled: boolean,
  options?: { upvoteAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const address = options?.upvoteAddress ?? addresses.upvote;

  const { request } = await publicClient.simulateContract({
    address,
    abi: UpvoteAbi,
    functionName: "setOpenVoting",
    args: [enabled],
    account: walletClient.account,
  });
  return walletClient.writeContract(request);
}

export async function getUpvoteCount(
  publicClient: PublicClient,
  messageId: bigint,
  options?: { upvoteAddress?: Address },
): Promise<bigint> {
  return (await publicClient.readContract({
    address: options?.upvoteAddress ?? addresses.upvote,
    abi: UpvoteAbi,
    functionName: "upvoteCount",
    args: [messageId],
  })) as bigint;
}

export async function hasVoted(
  publicClient: PublicClient,
  messageId: bigint,
  voter: Address,
  options?: { upvoteAddress?: Address },
): Promise<boolean> {
  return (await publicClient.readContract({
    address: options?.upvoteAddress ?? addresses.upvote,
    abi: UpvoteAbi,
    functionName: "hasVoted",
    args: [messageId, voter],
  })) as boolean;
}

/**
 * Returns every collection that's ever been allowlisted, each tagged with whether it's
 * currently active. Removed collections stay in this list (with `allowed: false`) rather than
 * disappearing — callers that want only active ones should filter on `allowed`.
 */
export async function getAllowedCollections(
  publicClient: PublicClient,
  options?: { upvoteAddress?: Address },
): Promise<(AllowedCollection & { allowed: boolean })[]> {
  const address = options?.upvoteAddress ?? addresses.upvote;

  const count = (await publicClient.readContract({
    address,
    abi: UpvoteAbi,
    functionName: "everAllowedCount",
  })) as bigint;

  const collectionAddresses = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      publicClient.readContract({
        address,
        abi: UpvoteAbi,
        functionName: "everAllowedAt",
        args: [BigInt(i)],
      }) as Promise<Address>,
    ),
  );

  return Promise.all(
    collectionAddresses.map(async (collection) => {
      const [allowed, standard, tokenId] = (await publicClient.readContract({
        address,
        abi: UpvoteAbi,
        functionName: "collections",
        args: [collection],
      })) as [boolean, number, bigint];

      return { collection, allowed, standard: standardFromEnum(standard), tokenId };
    }),
  );
}

/** Allowlists an ERC-721 collection — any token id from it qualifies. Owner-only. */
export async function allowCollection721(
  publicClient: PublicClient,
  walletClient: WalletClient,
  collection: Address,
  options?: { upvoteAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const address = options?.upvoteAddress ?? addresses.upvote;

  const { request } = await publicClient.simulateContract({
    address,
    abi: UpvoteAbi,
    functionName: "allowCollection721",
    args: [collection],
    account: walletClient.account,
  });
  return walletClient.writeContract(request);
}

/**
 * Allowlists an ERC-1155 collection, gated on a single `tokenId` (ERC-1155 has no "any token
 * in this collection" concept — pick the specific id, e.g. a particular badge). Owner-only.
 */
export async function allowCollection1155(
  publicClient: PublicClient,
  walletClient: WalletClient,
  collection: Address,
  tokenId: bigint,
  options?: { upvoteAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const address = options?.upvoteAddress ?? addresses.upvote;

  const { request } = await publicClient.simulateContract({
    address,
    abi: UpvoteAbi,
    functionName: "allowCollection1155",
    args: [collection, tokenId],
    account: walletClient.account,
  });
  return walletClient.writeContract(request);
}

/** Removes a collection from the active allowlist. Owner-only. Past votes cast through it
 * are unaffected — this only blocks new ones. */
export async function removeCollection(
  publicClient: PublicClient,
  walletClient: WalletClient,
  collection: Address,
  options?: { upvoteAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const address = options?.upvoteAddress ?? addresses.upvote;

  const { request } = await publicClient.simulateContract({
    address,
    abi: UpvoteAbi,
    functionName: "removeCollection",
    args: [collection],
    account: walletClient.account,
  });
  return walletClient.writeContract(request);
}
