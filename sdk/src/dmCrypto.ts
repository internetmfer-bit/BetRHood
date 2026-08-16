import { x25519 } from "@noble/curves/ed25519.js";
import { xsalsa20poly1305 } from "@noble/ciphers/salsa.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, type WalletClient } from "viem";

/**
 * Signed once to deterministically derive a DM encryption keypair — the same wallet signing
 * this exact string always reproduces the same signature (modern EOA wallets use RFC 6979
 * deterministic-k ECDSA), so the same keypair is recoverable forever, on any device, with
 * nothing to back up. "Your wallet is your key," same as everything else in this app.
 *
 * The wording is domain-bound on purpose, not boilerplate: nothing about a `personal_sign`
 * request ties it to this site except the message text itself. A phishing site (or any other
 * dapp) requesting a signature over this *exact* string would recover the identical DM keypair.
 * Never change this string casually — every existing user's derived key depends on it — and
 * never log, transmit, or persist the raw signature anywhere. It functions as private key
 * material even though it's produced by a normal signing prompt.
 */
export const KEY_DERIVATION_MESSAGE =
  "betrhood.com wants you to sign in to generate your private DM encryption key. Only sign " +
  "this on betrhood.com. Signing this on any other site exposes your messages.";

const IDENTITY_KDF_INFO = new TextEncoder().encode("betrhood:dm-keypair:v1");
const BOX_KDF_INFO = new TextEncoder().encode("betrhood:dm-box:v1");
const NONCE_LENGTH = 24;

export interface MessagingKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** Derives a stable X25519 keypair from a wallet signature — see KEY_DERIVATION_MESSAGE's
 * comment for why this is safe to re-derive on demand rather than generating and storing a
 * random keypair somewhere. */
export async function deriveMessagingKeyPair(walletClient: WalletClient): Promise<MessagingKeyPair> {
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");

  const signature = await walletClient.signMessage({
    account: walletClient.account,
    message: KEY_DERIVATION_MESSAGE,
  });
  const signatureBytes = hexToBytes(signature as `0x${string}`);
  const seed = hkdf(sha256, signatureBytes, undefined, IDENTITY_KDF_INFO, 32);
  const { publicKey, secretKey } = x25519.keygen(seed);
  return { publicKey, secretKey };
}

/** X25519 ECDH followed by HKDF-SHA256 to derive a symmetric key, then XSalsa20-Poly1305 to
 * encrypt — the standard ECIES-style composition. Not byte-for-byte identical to NaCl's own
 * `crypto_box` (which derives its symmetric key via HSalsa20 rather than HKDF), which is fine:
 * both sides of every conversation always use this same code, so there's no interop
 * requirement with an external NaCl implementation, and HKDF is the more standard, more
 * auditable choice for "derive a symmetric key from a DH shared secret." */
export function encryptDm(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array,
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const key = deriveBoxKey(senderSecretKey, recipientPublicKey);
  const nonce = randomNonce();
  const ciphertext = xsalsa20poly1305(key, nonce).encrypt(plaintext);
  return { nonce, ciphertext };
}

/** Returns `null` on any decryption failure — wrong keys, tampered ciphertext, or data that
 * was never a valid envelope at all (e.g. garbage posted directly to the `dm` topic, bypassing
 * the UI) — never throws. `xsalsa20poly1305(...).decrypt()` itself throws on an authentication
 * failure (a Poly1305 tag mismatch); this wraps that into the null-return contract the rest of
 * the DM code expects, so one bad message can be skipped without a try/catch at every call
 * site. */
export function decryptDm(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array,
): Uint8Array | null {
  try {
    const key = deriveBoxKey(recipientSecretKey, senderPublicKey);
    return xsalsa20poly1305(key, nonce).decrypt(ciphertext);
  } catch {
    return null;
  }
}

function deriveBoxKey(mySecretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  const sharedSecret = x25519.getSharedSecret(mySecretKey, theirPublicKey);
  return hkdf(sha256, sharedSecret, undefined, BOX_KDF_INFO, 32);
}

function randomNonce(): Uint8Array {
  const nonce = new Uint8Array(NONCE_LENGTH);
  crypto.getRandomValues(nonce);
  return nonce;
}
