import type { Abi, Address, Hex, PublicClient, WalletClient } from "viem";
import { zeroAddress, zeroHash } from "viem";
import { robinhoodChain } from "./chain.js";
import { getMessagesBySender, getMessagesByTopic, postMessage, type Message } from "./messaging.js";
import SeaportAbiJson from "./abi/Seaport.json" with { type: "json" };

const SeaportAbi = SeaportAbiJson as Abi;

/** Seaport 1.6 — canonical, ownerless, immutable deployment, same address on every chain it's
 * deployed to. Confirmed present on Robinhood Chain mainnet via getBytecode() (23,981 bytes,
 * matching Base/Unichain/Hyperliquid). Third-party contract we don't deploy, so it doesn't
 * belong in addresses.ts (that file is "our own deployed contracts" only) — self-contained here,
 * same convention as dm.ts's MESSAGING_PUBKEY_KEY. */
export const SEAPORT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395" as const;

/** v1 uses no conduit at all — Seaport moves tokens directly, so sellers approve the Seaport
 * contract address itself via setApprovalForAll, and buyers (pure-ETH consideration) need no
 * approval whatsoever. Keeps ConduitController completely out of scope. */
const NO_CONDUIT = zeroHash;

/** One shared reserved topic for every NFT listing ever posted — same "shared topic, JSON
 * discriminator-free" shape as DMs, since every listing envelope is self-describing (it's a
 * signed Seaport order, valid or not on its own). Defined here, not in the frontend, because
 * listing topic membership has to be known SDK-side for createListing()/getActiveListings() to
 * work at all — same reasoning as dm.ts's DM_TOPIC. */
export const NFT_LISTING_TOPIC = "nft-listing";

/** Bounds getActiveListings()'s validity-check fan-out, same purpose as social.ts's
 * FEED_CANDIDATE_CAP — most-recent-first, so growth beyond this only drops the oldest listings
 * from browse results (they still exist on-chain and are still directly fulfillable). */
export const LISTING_VALIDATION_CAP = 200;

const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";

/** Minimal inline ABI fragments — same convention as scripts/admin/allow-collection.ts's inline
 * supportsInterface ABI. Only the surface this module actually calls, not a full OZ import. */
const ERC721_FRAGMENT_ABI = [
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "isApprovedForAll", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
  { type: "function", name: "supportsInterface", stateMutability: "view", inputs: [{ name: "interfaceId", type: "bytes4" }], outputs: [{ name: "", type: "bool" }] },
] as const;

const ERC1155_FRAGMENT_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "isApprovedForAll", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
  { type: "function", name: "supportsInterface", stateMutability: "view", inputs: [{ name: "interfaceId", type: "bytes4" }], outputs: [{ name: "", type: "bool" }] },
] as const;

/** Verified struct field order against ProjectOpenSea/seaport-types (ConsiderationStructs.sol)
 * and the EIP-712 type layout against seaport-js's published EIP_712_ORDER_TYPE constant —
 * copied verbatim rather than hand-transcribed from Solidity typehash strings, since a wrong
 * field here would silently produce invalid signatures. */
const EIP712_ORDER_TYPE = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
} as const;

/** Seaport's ItemType enum (ConsiderationEnums.sol) — only the values v1 uses. */
const ItemType = { NATIVE: 0, ERC721: 2, ERC1155: 3 } as const;
/** Seaport's OrderType enum — v1 only ever uses FULL_OPEN (no zone restrictions, no partial fills). */
const ORDER_TYPE_FULL_OPEN = 0;

export type NftStandard = "ERC721" | "ERC1155";

export interface NftListingEnvelope {
  offerer: Address;
  standard: NftStandard;
  collection: Address;
  /** Decimal string — bigints aren't JSON-serializable, same convention as social.ts's repost()
   * storing originalMessageId as a string. */
  tokenId: string;
  priceWei: string;
  startTime: string;
  endTime: string;
  salt: string;
  /** Needed to rebuild OrderComponents for cancel()/getOrderHash(). */
  counter: string;
  /** Needed to rebuild OrderParameters for fulfillOrder(). Always 1 in v1 (single ETH
   * consideration item, no fees/royalties). */
  totalOriginalConsiderationItems: string;
  signature: Hex;
}

export type ListingStatus = "active" | "sold" | "cancelled" | "expired" | "not-fulfillable";

export interface NftListing {
  messageId: bigint;
  timestamp: bigint;
  envelope: NftListingEnvelope;
  status: ListingStatus;
}

export class NotOwnerError extends Error {
  constructor() {
    super("createListing() was called by an address that doesn't own this token.");
  }
}

export class ApprovalRequiredError extends Error {
  constructor() {
    super("Seaport isn't approved to move this collection yet — call approveForListing() first.");
  }
}

export class NotOrderOffererError extends Error {
  constructor() {
    super("cancelListing() was called by an address other than the listing's own seller.");
  }
}

export class InvalidTimeError extends Error {
  constructor() {
    super("This listing isn't within its valid time window (not yet started, or already expired).");
  }
}

export class OrderIsCancelledError extends Error {
  constructor() {
    super("This listing has been cancelled.");
  }
}

export class OrderAlreadyFilledError extends Error {
  constructor() {
    super("This listing has already been bought.");
  }
}

export class InsufficientNativeTokensSuppliedError extends Error {
  constructor() {
    super("Not enough ETH was sent to fulfill this listing.");
  }
}

export class InvalidMsgValueError extends Error {
  constructor() {
    super("The ETH sent doesn't match this listing's price.");
  }
}

export class BadOrderSignatureError extends Error {
  constructor() {
    super("This listing's signature is invalid — it may be corrupted or tampered with.");
  }
}

export class CannotCancelOrderError extends Error {
  constructor() {
    super("This listing can't be cancelled (already fully filled, or the counter has moved).");
  }
}

/** Casts a viem contract revert to the specific typed error it represents, if recognized —
 * same rethrowKnown() pattern as upvote.ts, mapped to Seaport's real custom errors (verified
 * against ConsiderationRevertReasons.sol / SignatureVerificationErrors.sol). */
function rethrowKnown(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("InvalidTime")) throw new InvalidTimeError();
  if (message.includes("OrderIsCancelled")) throw new OrderIsCancelledError();
  if (message.includes("OrderAlreadyFilled")) throw new OrderAlreadyFilledError();
  if (message.includes("InsufficientNativeTokensSupplied")) throw new InsufficientNativeTokensSuppliedError();
  if (message.includes("InvalidMsgValue")) throw new InvalidMsgValueError();
  if (/InvalidSigner|InvalidSignature|BadSignatureV|BadContractSignature/.test(message)) throw new BadOrderSignatureError();
  if (message.includes("CannotCancelOrder")) throw new CannotCancelOrderError();
  throw err;
}

/** Try/catch-returns-null codec, same shape as parseDmEnvelope/parseSocialBody — malformed JSON
 * or a missing field just means "not a real listing," never a thrown error, so one bad message
 * can't sink a whole listings list. */
export function parseNftListingBody(bytes: Uint8Array): NftListingEnvelope | null {
  try {
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof p?.offerer === "string" &&
      (p?.standard === "ERC721" || p?.standard === "ERC1155") &&
      typeof p?.collection === "string" &&
      typeof p?.tokenId === "string" &&
      typeof p?.priceWei === "string" &&
      typeof p?.startTime === "string" &&
      typeof p?.endTime === "string" &&
      typeof p?.salt === "string" &&
      typeof p?.counter === "string" &&
      typeof p?.totalOriginalConsiderationItems === "string" &&
      typeof p?.signature === "string"
    ) {
      return p as NftListingEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

function toOrderComponents(e: NftListingEnvelope) {
  return {
    offerer: e.offerer,
    zone: zeroAddress,
    offer: [
      {
        itemType: e.standard === "ERC721" ? ItemType.ERC721 : ItemType.ERC1155,
        token: e.collection,
        identifierOrCriteria: BigInt(e.tokenId),
        startAmount: 1n,
        endAmount: 1n,
      },
    ],
    consideration: [
      {
        itemType: ItemType.NATIVE,
        token: zeroAddress,
        identifierOrCriteria: 0n,
        startAmount: BigInt(e.priceWei),
        endAmount: BigInt(e.priceWei),
        recipient: e.offerer,
      },
    ],
    orderType: ORDER_TYPE_FULL_OPEN,
    startTime: BigInt(e.startTime),
    endTime: BigInt(e.endTime),
    zoneHash: zeroHash,
    salt: BigInt(e.salt),
    conduitKey: NO_CONDUIT,
    counter: BigInt(e.counter),
  };
}

function toOrderParameters(e: NftListingEnvelope) {
  const { counter: _counter, ...rest } = toOrderComponents(e);
  return { ...rest, totalOriginalConsiderationItems: BigInt(e.totalOriginalConsiderationItems) };
}

function randomSalt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let salt = 0n;
  for (const b of bytes) salt = (salt << 8n) | BigInt(b);
  return salt;
}

function fragmentAbiFor(standard: NftStandard) {
  return standard === "ERC721" ? ERC721_FRAGMENT_ABI : ERC1155_FRAGMENT_ABI;
}

async function isOwner(publicClient: PublicClient, owner: Address, collection: Address, tokenId: bigint, standard: NftStandard): Promise<boolean> {
  if (standard === "ERC721") {
    const actual = (await publicClient.readContract({
      address: collection,
      abi: ERC721_FRAGMENT_ABI,
      functionName: "ownerOf",
      args: [tokenId],
    })) as Address;
    return actual.toLowerCase() === owner.toLowerCase();
  }
  const balance = (await publicClient.readContract({
    address: collection,
    abi: ERC1155_FRAGMENT_ABI,
    functionName: "balanceOf",
    args: [owner, tokenId],
  })) as bigint;
  return balance > 0n;
}

/** Whether `owner` has approved Seaport to move tokens from `collection` on their behalf —
 * required before a listing can ever be fulfilled. Checked both at listing time (so a doomed
 * signature is never even requested) and at browse time (so an un-fulfillable listing never
 * shows as buyable). */
export async function isApprovedForListing(
  publicClient: PublicClient,
  owner: Address,
  collection: Address,
  standard: NftStandard,
  options?: { seaportAddress?: Address },
): Promise<boolean> {
  return (await publicClient.readContract({
    address: collection,
    abi: fragmentAbiFor(standard),
    functionName: "isApprovedForAll",
    args: [owner, options?.seaportAddress ?? SEAPORT_ADDRESS],
  })) as boolean;
}

/** Approves Seaport to move tokens from `collection` on the caller's behalf. A separate,
 * explicit step from createListing() — never an implicit second transaction — so the seller
 * always knows exactly what they're signing next. */
export async function approveForListing(
  publicClient: PublicClient,
  walletClient: WalletClient,
  collection: Address,
  standard: NftStandard,
  options?: { seaportAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const seaportAddress = options?.seaportAddress ?? SEAPORT_ADDRESS;

  const { request } = await publicClient.simulateContract({
    address: collection,
    abi: fragmentAbiFor(standard),
    functionName: "setApprovalForAll",
    args: [seaportAddress, true],
    account: walletClient.account,
  });
  return walletClient.writeContract(request);
}

/**
 * Lists `tokenId` from `collection` for `priceWei` (fixed price, ETH only). Requires the caller
 * to actually own the token (throws NotOwnerError otherwise) and to have already approved
 * Seaport for this collection (throws ApprovalRequiredError otherwise — call
 * approveForListing() first). Signs a Seaport order via EIP-712 (a signature, not a
 * transaction — free) and publishes it to NFT_LISTING_TOPIC; that published message is the
 * entire listing, no separate on-chain "list" call exists or is needed.
 */
export async function createListing(
  publicClient: PublicClient,
  walletClient: WalletClient,
  params: { collection: Address; tokenId: bigint; standard: NftStandard; priceWei: bigint; durationSeconds?: number },
  // chainId defaults to Robinhood Chain mainnet, matching this contract's real deployment. Only
  // ever needs overriding in local tests: Seaport caches its EIP-712 domain separator at
  // construction, keyed to whatever chain it was actually deployed on (4663 for Robinhood — a
  // real, live-verified fork-safety pattern, not a guess: it recomputes the separator fresh from
  // block.chainid whenever that doesn't match its cached one, same as OpenZeppelin's EIP712).
  // Local Anvil reports chain id 31337, not 4663, even when seeded with Robinhood's exact
  // Seaport bytecode — so a locally-signed order must target 31337 or its signature won't
  // recover to the real signer once Seaport recomputes its own separator at verification time.
  options?: { messagingAddress?: Address; seaportAddress?: Address; chainId?: number },
): Promise<{ messageId: bigint; txHash: Hex }> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const offerer = walletClient.account.address;
  const seaportAddress = options?.seaportAddress ?? SEAPORT_ADDRESS;

  const owns = await isOwner(publicClient, offerer, params.collection, params.tokenId, params.standard);
  if (!owns) throw new NotOwnerError();

  const approved = await isApprovedForListing(publicClient, offerer, params.collection, params.standard, { seaportAddress });
  if (!approved) throw new ApprovalRequiredError();

  const counter = (await publicClient.readContract({
    address: seaportAddress,
    abi: SeaportAbi,
    functionName: "getCounter",
    args: [offerer],
  })) as bigint;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const envelope: NftListingEnvelope = {
    offerer,
    standard: params.standard,
    collection: params.collection,
    tokenId: params.tokenId.toString(),
    priceWei: params.priceWei.toString(),
    startTime: now.toString(),
    endTime: (now + BigInt(params.durationSeconds ?? 30 * 24 * 60 * 60)).toString(),
    salt: randomSalt().toString(),
    counter: counter.toString(),
    totalOriginalConsiderationItems: "1",
    signature: "0x",
  };

  const signature = await walletClient.signTypedData({
    account: walletClient.account,
    domain: { name: "Seaport", version: "1.6", chainId: options?.chainId ?? robinhoodChain.id, verifyingContract: seaportAddress },
    types: EIP712_ORDER_TYPE,
    primaryType: "OrderComponents",
    message: toOrderComponents(envelope),
  });
  envelope.signature = signature;

  return postMessage(publicClient, walletClient, NFT_LISTING_TOPIC, JSON.stringify(envelope), {
    messagingAddress: options?.messagingAddress,
  });
}

async function describeListingStatus(
  publicClient: PublicClient,
  envelope: NftListingEnvelope,
  seaportAddress: Address,
): Promise<ListingStatus> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < BigInt(envelope.startTime) || now >= BigInt(envelope.endTime)) return "expired";

  const orderComponents = toOrderComponents(envelope);
  const [orderHash, owns, approved] = await Promise.all([
    publicClient.readContract({ address: seaportAddress, abi: SeaportAbi, functionName: "getOrderHash", args: [orderComponents] }) as Promise<Hex>,
    isOwner(publicClient, envelope.offerer, envelope.collection, BigInt(envelope.tokenId), envelope.standard),
    isApprovedForListing(publicClient, envelope.offerer, envelope.collection, envelope.standard, { seaportAddress }),
  ]);

  const [, isCancelled, totalFilled] = (await publicClient.readContract({
    address: seaportAddress,
    abi: SeaportAbi,
    functionName: "getOrderStatus",
    args: [orderHash],
  })) as [boolean, boolean, bigint, bigint];

  if (isCancelled) return "cancelled";
  if (totalFilled > 0n) return "sold";
  if (!owns || !approved) return "not-fulfillable";
  return "active";
}

/**
 * Every currently-active listing, newest first, bounded to the most recent
 * LISTING_VALIDATION_CAP listings ever posted. Best-effort: the authoritative fulfillability
 * check is buyListing()'s own simulateContract call immediately before sending — a listing that
 * passes here and still fails at buy time (the seller sold/moved it seconds earlier) always
 * fails as a clean Seaport revert, never a partial or bad trade.
 */
export async function getActiveListings(
  publicClient: PublicClient,
  options?: { messagingAddress?: Address; seaportAddress?: Address },
): Promise<NftListing[]> {
  const seaportAddress = options?.seaportAddress ?? SEAPORT_ADDRESS;
  const messages = await getMessagesByTopic(publicClient, NFT_LISTING_TOPIC, { messagingAddress: options?.messagingAddress });

  const candidates = messages
    .sort((a, b) => Number(b.timestamp - a.timestamp))
    .slice(0, LISTING_VALIDATION_CAP)
    .map((m) => ({ m, envelope: parseNftListingBody(m.body) }))
    .filter((c): c is { m: Message; envelope: NftListingEnvelope } => c.envelope !== null);

  const statuses = await Promise.all(candidates.map((c) => describeListingStatus(publicClient, c.envelope, seaportAddress)));

  return candidates
    .map((c, i) => ({ messageId: c.m.id, timestamp: c.m.timestamp, envelope: c.envelope, status: statuses[i] }))
    .filter((l) => l.status === "active");
}

/** Every listing `address` has ever posted, in every status (not just active) — powers a "Your
 * Listings" section with Active/Sold/Cancelled/Expired badges. Bounded the same way as every
 * other per-sender read in this SDK (see getRecentMessagesBySender's doc comment). */
export async function getMyListings(
  publicClient: PublicClient,
  address: Address,
  options?: { messagingAddress?: Address; seaportAddress?: Address },
): Promise<NftListing[]> {
  const seaportAddress = options?.seaportAddress ?? SEAPORT_ADDRESS;
  // getMessagesBySender returns this address's entire history, across every topic they've ever
  // posted to — no topic pre-filter needed, since parseNftListingBody's required-field shape
  // check is already a strong-enough discriminator (same convention as dm.ts's getConversation,
  // which relies on parseDmEnvelope's shape check rather than filtering by topic hex).
  const messages = await getMessagesBySender(publicClient, address, { messagingAddress: options?.messagingAddress });

  const candidates = messages
    .map((m) => ({ m, envelope: parseNftListingBody(m.body) }))
    .filter((c): c is { m: Message; envelope: NftListingEnvelope } => c.envelope !== null);

  const statuses = await Promise.all(candidates.map((c) => describeListingStatus(publicClient, c.envelope, seaportAddress)));

  return candidates.map((c, i) => ({ messageId: c.m.id, timestamp: c.m.timestamp, envelope: c.envelope, status: statuses[i] }));
}

/** getActiveListings() filtered to one collection — no separate on-chain index needed since the
 * whole active-listings set is already a bounded, cheap read. */
export async function getListingsByCollection(
  publicClient: PublicClient,
  collection: Address,
  options?: { messagingAddress?: Address; seaportAddress?: Address },
): Promise<NftListing[]> {
  const all = await getActiveListings(publicClient, options);
  return all.filter((l) => l.envelope.collection.toLowerCase() === collection.toLowerCase());
}

/** Buys `listing` — calls Seaport's fulfillOrder directly with the order data pulled from the
 * listing message. The NFT and ETH move exclusively through Seaport's own transfer logic; this
 * SDK never custodies either. simulateContract runs first (with the real buyer account and real
 * msg.value), which is the authoritative fulfillability check — see getActiveListings()'s doc
 * comment on why browse-time validity checks are best-effort, not final. */
export async function buyListing(
  publicClient: PublicClient,
  walletClient: WalletClient,
  listing: NftListing,
  options?: { seaportAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  const seaportAddress = options?.seaportAddress ?? SEAPORT_ADDRESS;

  try {
    const { request } = await publicClient.simulateContract({
      address: seaportAddress,
      abi: SeaportAbi,
      functionName: "fulfillOrder",
      args: [{ parameters: toOrderParameters(listing.envelope), signature: listing.envelope.signature }, NO_CONDUIT],
      value: BigInt(listing.envelope.priceWei),
      account: walletClient.account,
    });
    return await walletClient.writeContract(request);
  } catch (err) {
    rethrowKnown(err);
  }
}

/** Cancels `listing` — only the listing's own seller can cancel it (checked locally first, so a
 * doomed transaction is never even simulated). A cancelled listing simply fails validity
 * checking on the next getActiveListings() read; no discovery-topic cleanup is needed or
 * possible (messages are permanent). */
export async function cancelListing(
  publicClient: PublicClient,
  walletClient: WalletClient,
  listing: NftListing,
  options?: { seaportAddress?: Address },
): Promise<Hex> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");
  if (walletClient.account.address.toLowerCase() !== listing.envelope.offerer.toLowerCase()) {
    throw new NotOrderOffererError();
  }
  const seaportAddress = options?.seaportAddress ?? SEAPORT_ADDRESS;

  try {
    const { request } = await publicClient.simulateContract({
      address: seaportAddress,
      abi: SeaportAbi,
      functionName: "cancel",
      args: [[toOrderComponents(listing.envelope)]],
      account: walletClient.account,
    });
    return await walletClient.writeContract(request);
  } catch (err) {
    rethrowKnown(err);
  }
}
