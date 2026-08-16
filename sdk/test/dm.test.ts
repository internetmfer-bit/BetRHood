import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveMessagingKeyPair } from "../src/dmCrypto.js";
import {
  getConversation,
  getMessagingPublicKey,
  publishMessagingPublicKey,
  RecipientNotEnabledError,
  sendDm,
} from "../src/dm.js";
import { postMessage } from "../src/messaging.js";
import { ANVIL_RPC, startChain, stopChain, TEST_PRIVATE_KEY, type TestAddresses } from "./setup.js";

const anvilChain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
});

let addresses: TestAddresses;
const publicClient = createPublicClient({ chain: anvilChain, transport: http() });

function walletFor(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return { account, wallet: createWalletClient({ account, chain: anvilChain, transport: http() }) };
}

// Anvil default accounts #0 and #1 — public, zero-value test keys, verified against anvil's
// own printed key list earlier this session, not typed from memory.
const alice = walletFor(TEST_PRIVATE_KEY);
const bob = walletFor("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

beforeAll(async () => {
  addresses = await startChain();
}, 30_000);

afterAll(() => {
  stopChain();
});

describe("publishMessagingPublicKey / getMessagingPublicKey", () => {
  it("returns null before anything is published", async () => {
    // Anvil default account #2 — never used for a publish anywhere in this suite.
    const fresh = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
    const key = await getMessagingPublicKey(publicClient, fresh.address, { storageAddress: addresses.storage });
    expect(key).toBeNull();
  });

  it("round-trips a published key", async () => {
    const keyPair = await deriveMessagingKeyPair(alice.wallet);
    await publishMessagingPublicKey(publicClient, alice.wallet, keyPair.publicKey, {
      storageAddress: addresses.storage,
    });

    const fetched = await getMessagingPublicKey(publicClient, alice.account.address, {
      storageAddress: addresses.storage,
    });
    expect(fetched).toEqual(keyPair.publicKey);
  });
});

describe("sendDm / getConversation", () => {
  it("throws RecipientNotEnabledError when the recipient hasn't published a key", async () => {
    // Anvil default account #3 — never published a key anywhere in this suite.
    const noKey = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as const;
    const aliceKeyPair = await deriveMessagingKeyPair(alice.wallet);

    await expect(
      sendDm(publicClient, alice.wallet, privateKeyToAccount(noKey).address, "hello?", aliceKeyPair, {
        messagingAddress: addresses.messaging,
        storageAddress: addresses.storage,
      }),
    ).rejects.toThrow(RecipientNotEnabledError);
  });

  it("sends and reads back a decrypted conversation between two accounts", async () => {
    const aliceKeyPair = await deriveMessagingKeyPair(alice.wallet);
    const bobKeyPair = await deriveMessagingKeyPair(bob.wallet);

    await publishMessagingPublicKey(publicClient, alice.wallet, aliceKeyPair.publicKey, {
      storageAddress: addresses.storage,
    });
    await publishMessagingPublicKey(publicClient, bob.wallet, bobKeyPair.publicKey, {
      storageAddress: addresses.storage,
    });

    await sendDm(publicClient, alice.wallet, bob.account.address, "gm bob", aliceKeyPair, {
      messagingAddress: addresses.messaging,
      storageAddress: addresses.storage,
    });
    await sendDm(publicClient, bob.wallet, alice.account.address, "gm alice, wagmi", bobKeyPair, {
      messagingAddress: addresses.messaging,
      storageAddress: addresses.storage,
    });

    const fromAlicesSide = await getConversation(publicClient, alice.account.address, bob.account.address, aliceKeyPair, {
      messagingAddress: addresses.messaging,
      storageAddress: addresses.storage,
    });
    const fromBobsSide = await getConversation(publicClient, bob.account.address, alice.account.address, bobKeyPair, {
      messagingAddress: addresses.messaging,
      storageAddress: addresses.storage,
    });

    expect(fromAlicesSide.filter((m) => m.status === "ok").map((m) => m.text)).toEqual(["gm bob", "gm alice, wagmi"]);
    expect(fromBobsSide.filter((m) => m.status === "ok").map((m) => m.text)).toEqual(["gm bob", "gm alice, wagmi"]);
  });

  it("surfaces non-envelope garbage posted directly to the dm topic as undecryptable, not a thrown error", async () => {
    const aliceKeyPair = await deriveMessagingKeyPair(alice.wallet);
    const bobKeyPair = await deriveMessagingKeyPair(bob.wallet);

    await publishMessagingPublicKey(publicClient, alice.wallet, aliceKeyPair.publicKey, {
      storageAddress: addresses.storage,
    });
    await publishMessagingPublicKey(publicClient, bob.wallet, bobKeyPair.publicKey, {
      storageAddress: addresses.storage,
    });

    // A well-formed envelope pointing at Bob...
    await sendDm(publicClient, alice.wallet, bob.account.address, "real message", aliceKeyPair, {
      messagingAddress: addresses.messaging,
      storageAddress: addresses.storage,
    });
    // ...and garbage posted straight to the "dm" topic, bypassing sendDm() entirely, with a
    // `to` field that still targets Bob so it shows up as part of this conversation.
    await postMessage(publicClient, alice.wallet, "dm", JSON.stringify({ to: bob.account.address, nonce: "0x00", ciphertext: "0x00" }), {
      messagingAddress: addresses.messaging,
    });

    const conversation = await getConversation(publicClient, bob.account.address, alice.account.address, bobKeyPair, {
      messagingAddress: addresses.messaging,
      storageAddress: addresses.storage,
    });

    expect(conversation.some((m) => m.status === "ok" && m.text === "real message")).toBe(true);
    expect(conversation.some((m) => m.status === "undecryptable")).toBe(true);
  });
});
