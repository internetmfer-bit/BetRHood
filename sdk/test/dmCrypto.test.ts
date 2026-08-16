import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";
import { decryptDm, deriveMessagingKeyPair, encryptDm } from "../src/dmCrypto.js";
import { TEST_PRIVATE_KEY } from "./setup.js";

// Signing is entirely local for a viem account backed by a private key — no RPC round-trip,
// so these tests need no Anvil instance at all, unlike messaging.test.ts/dm.test.ts.
function walletFor(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: mainnet, transport: http() });
}

describe("deriveMessagingKeyPair", () => {
  it("is deterministic — the same wallet derives the same keypair every time", async () => {
    // Two independently-constructed wallet clients sharing a private key, proving determinism
    // isn't an artifact of object identity/caching.
    const walletA = walletFor(TEST_PRIVATE_KEY);
    const walletB = walletFor(TEST_PRIVATE_KEY);

    const keyPairA = await deriveMessagingKeyPair(walletA);
    const keyPairB = await deriveMessagingKeyPair(walletB);

    expect(keyPairA.publicKey).toEqual(keyPairB.publicKey);
    expect(keyPairA.secretKey).toEqual(keyPairB.secretKey);
  });

  it("different wallets derive different keypairs", async () => {
    // Anvil default account #1 — public, zero-value test key, verified against anvil's own
    // printed key list earlier this session, not typed from memory.
    const other = walletFor("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const mine = walletFor(TEST_PRIVATE_KEY);

    const keyPairOther = await deriveMessagingKeyPair(other);
    const keyPairMine = await deriveMessagingKeyPair(mine);

    expect(keyPairOther.publicKey).not.toEqual(keyPairMine.publicKey);
  });

  it("produces a 32-byte X25519 keypair", async () => {
    const keyPair = await deriveMessagingKeyPair(walletFor(TEST_PRIVATE_KEY));
    expect(keyPair.publicKey.length).toBe(32);
    expect(keyPair.secretKey.length).toBe(32);
  });
});

describe("encryptDm / decryptDm", () => {
  it("round-trips a message between two independently-derived keypairs", async () => {
    const alice = await deriveMessagingKeyPair(walletFor(TEST_PRIVATE_KEY));
    const bob = await deriveMessagingKeyPair(
      walletFor("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
    );

    const plaintext = new TextEncoder().encode("gm bob, this is alice");
    const { nonce, ciphertext } = encryptDm(plaintext, bob.publicKey, alice.secretKey);

    const decrypted = decryptDm(ciphertext, nonce, alice.publicKey, bob.secretKey);
    expect(decrypted).toEqual(plaintext);
  });

  it("returns null, never throws, for a tampered ciphertext", async () => {
    const alice = await deriveMessagingKeyPair(walletFor(TEST_PRIVATE_KEY));
    const bob = await deriveMessagingKeyPair(
      walletFor("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
    );

    const plaintext = new TextEncoder().encode("secret message");
    const { nonce, ciphertext } = encryptDm(plaintext, bob.publicKey, alice.secretKey);

    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0xff;

    expect(decryptDm(tampered, nonce, alice.publicKey, bob.secretKey)).toBeNull();
  });

  it("returns null, never throws, for the wrong nonce", async () => {
    const alice = await deriveMessagingKeyPair(walletFor(TEST_PRIVATE_KEY));
    const bob = await deriveMessagingKeyPair(
      walletFor("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
    );

    const plaintext = new TextEncoder().encode("secret message");
    const { ciphertext } = encryptDm(plaintext, bob.publicKey, alice.secretKey);
    const wrongNonce = new Uint8Array(24).fill(1);

    expect(decryptDm(ciphertext, wrongNonce, alice.publicKey, bob.secretKey)).toBeNull();
  });

  it("returns null, never throws, when decrypting with the wrong recipient key", async () => {
    const alice = await deriveMessagingKeyPair(walletFor(TEST_PRIVATE_KEY));
    const bob = await deriveMessagingKeyPair(
      walletFor("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
    );
    // Anvil default account #2 — verified against anvil's own printed key list.
    const eve = await deriveMessagingKeyPair(
      walletFor("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"),
    );

    const plaintext = new TextEncoder().encode("only for bob");
    const { nonce, ciphertext } = encryptDm(plaintext, bob.publicKey, alice.secretKey);

    // Eve has no relationship to this message at all — neither sender nor intended recipient.
    expect(decryptDm(ciphertext, nonce, alice.publicKey, eve.secretKey)).toBeNull();
  });
});
