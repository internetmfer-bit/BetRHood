import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { hexToBytes, toHex } from "viem";
import { decryptDm, encryptDm, type MessagingKeyPair } from "./dmCrypto.js";
import { getRecentMessagesBySender, postMessage, type Message } from "./messaging.js";
import { resolve, upload } from "./storage.js";

/** Fixed Storage key a DM public key lives under — same convention as Profile's
 * betrhood:profile-picture/betrhood:profile-bio. No contract-side pointer needed: empty bytes
 * unambiguously means "never published," same signal resolve() already gives everywhere else. */
export const MESSAGING_PUBKEY_KEY = "betrhood:messaging-pubkey";

/** One shared reserved topic for every encrypted DM ever sent — messages are told apart by the
 * `to` field in their JSON body, same "shared topic, JSON discriminator" convention the social
 * feed uses for post vs. repost. Defined here (not in the frontend) because DM topic membership
 * has to be known SDK-side for sendDm()/getConversation() to work at all, unlike the social
 * feed's topic, which the frontend alone needs to know about for Forum-listing purposes. */
export const DM_TOPIC = "dm";

const HOW_MANY_RECENT_MESSAGES_TO_SCAN = 100;

export class RecipientNotEnabledError extends Error {
  constructor(who: Address) {
    super(`${who} hasn't enabled encrypted messaging yet (no public key published).`);
  }
}

export class SenderNotEnabledError extends Error {
  constructor() {
    super("You haven't enabled encrypted messaging yet — publish a public key first.");
  }
}

interface DmEnvelope {
  to: Address;
  nonce: Hex;
  ciphertext: Hex;
}

export type DmThreadItem =
  | { id: bigint; from: Address; to: Address; timestamp: bigint; status: "ok"; text: string }
  | { id: bigint; from: Address; to: Address; timestamp: bigint; status: "undecryptable" };

/** Publishes `publicKey` (the public half of a deriveMessagingKeyPair() result) so others can
 * encrypt messages to this address. One-time, until/unless the key is rotated by publishing a
 * new one — Storage's versioning means the old key stays in history but resolve() always
 * returns the latest. */
export async function publishMessagingPublicKey(
  publicClient: PublicClient,
  walletClient: WalletClient,
  publicKey: Uint8Array,
  options?: { storageAddress?: Address },
): Promise<{ version: bigint; txHash: Hex }> {
  return upload(publicClient, walletClient, MESSAGING_PUBKEY_KEY, publicKey, {
    storageAddress: options?.storageAddress,
  });
}

/** Returns `null` if `who` has never published a messaging public key. */
export async function getMessagingPublicKey(
  publicClient: PublicClient,
  who: Address,
  options?: { storageAddress?: Address },
): Promise<Uint8Array | null> {
  const bytes = await resolve(publicClient, who, MESSAGING_PUBKEY_KEY, { storageAddress: options?.storageAddress });
  return bytes.length === 0 ? null : bytes;
}

/** Try/catch-returns-null codec, same shape as the social feed's parseSocialBody — malformed
 * JSON or a missing field just means "not a real envelope," never a thrown error. */
export function parseDmEnvelope(bytes: Uint8Array): DmEnvelope | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed?.to === "string" && typeof parsed?.nonce === "string" && typeof parsed?.ciphertext === "string") {
      return { to: parsed.to as Address, nonce: parsed.nonce as Hex, ciphertext: parsed.ciphertext as Hex };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Encrypts `plaintext` to `to` and posts it. Requires the recipient to have already published
 * a public key (throws RecipientNotEnabledError otherwise) — there's no way to encrypt to
 * someone whose key isn't discoverable yet. Also requires the sender's own keypair, since the
 * recipient will need the sender's public key to decrypt (X25519 is a two-sided exchange, not
 * "encrypt with just the recipient's key") — pass the result of deriveMessagingKeyPair().
 */
export async function sendDm(
  publicClient: PublicClient,
  walletClient: WalletClient,
  to: Address,
  plaintext: string,
  senderKeyPair: MessagingKeyPair,
  options?: { messagingAddress?: Address; storageAddress?: Address },
): Promise<{ messageId: bigint; txHash: Hex }> {
  const recipientPublicKey = await getMessagingPublicKey(publicClient, to, { storageAddress: options?.storageAddress });
  if (!recipientPublicKey) throw new RecipientNotEnabledError(to);

  const { nonce, ciphertext } = encryptDm(new TextEncoder().encode(plaintext), recipientPublicKey, senderKeyPair.secretKey);

  const envelope: DmEnvelope = { to, nonce: toHex(nonce), ciphertext: toHex(ciphertext) };
  return postMessage(publicClient, walletClient, DM_TOPIC, JSON.stringify(envelope), {
    messagingAddress: options?.messagingAddress,
  });
}

/**
 * The full conversation between `me` and `them`, newest activity included, oldest first,
 * decrypted with `myKeyPair`. Each item is tagged "ok" (decrypted successfully) or
 * "undecryptable" (wrong/missing key, tampered data, or non-envelope JSON posted directly to
 * the `dm` topic) — a single bad message never fails the whole conversation. Bounded to the
 * most recent messages each side has sent overall (not just DMs), matching the social feed's
 * getRecentMessagesBySender-based windowing, so a prolific poster elsewhere doesn't force an
 * unbounded scan just to find their handful of DMs.
 */
export async function getConversation(
  publicClient: PublicClient,
  me: Address,
  them: Address,
  myKeyPair: MessagingKeyPair,
  options?: { messagingAddress?: Address; storageAddress?: Address },
): Promise<DmThreadItem[]> {
  const [mine, theirs, theirPublicKey] = await Promise.all([
    getRecentMessagesBySender(publicClient, me, HOW_MANY_RECENT_MESSAGES_TO_SCAN, { messagingAddress: options?.messagingAddress }),
    getRecentMessagesBySender(publicClient, them, HOW_MANY_RECENT_MESSAGES_TO_SCAN, { messagingAddress: options?.messagingAddress }),
    getMessagingPublicKey(publicClient, them, { storageAddress: options?.storageAddress }),
  ]);

  const relevant = (msgs: Message[], from: Address, to: Address) =>
    msgs.filter((m) => {
      const env = parseDmEnvelope(m.body);
      return env !== null && env.to.toLowerCase() === to.toLowerCase();
    }).map((m) => ({ m, from, to }));

  // Timestamp alone isn't a reliable sort key — multiple messages can land in the same block
  // and share an identical second-granularity timestamp. Message id is globally monotonic
  // (assigned in strict posting order across every sender/topic), so it's the correct tiebreak.
  const combined = [...relevant(mine, me, them), ...relevant(theirs, them, me)].sort((a, b) => {
    if (a.m.timestamp !== b.m.timestamp) return Number(a.m.timestamp - b.m.timestamp);
    return Number(a.m.id - b.m.id);
  });

  return combined.map(({ m, from, to }): DmThreadItem => {
    const envelope = parseDmEnvelope(m.body)!;
    // Decrypting always needs the OTHER party's public key — the sender's, from the reader's
    // point of view — which is `theirPublicKey` regardless of which of the two sent this
    // particular message, since "them" is fixed for this whole conversation.
    const plaintext = theirPublicKey
      ? decryptDm(hexToBytes(envelope.ciphertext), hexToBytes(envelope.nonce), theirPublicKey, myKeyPair.secretKey)
      : null;

    return plaintext
      ? { id: m.id, from, to, timestamp: m.timestamp, status: "ok", text: new TextDecoder().decode(plaintext) }
      : { id: m.id, from, to, timestamp: m.timestamp, status: "undecryptable" };
  });
}
