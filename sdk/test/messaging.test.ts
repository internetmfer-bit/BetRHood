import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMessage, getMessageCount, getMessagesBySender, getMessagesByTopic, postMessage } from "../src/messaging.js";
import { ANVIL_RPC, startChain, stopChain, TEST_PRIVATE_KEY, type TestAddresses } from "./setup.js";

const anvilChain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
});

let addresses: TestAddresses;
const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const publicClient = createPublicClient({ chain: anvilChain, transport: http() });
const walletClient = createWalletClient({ account, chain: anvilChain, transport: http() });

beforeAll(async () => {
  addresses = await startChain();
}, 30_000);

afterAll(() => {
  stopChain();
});

describe("postMessage / getMessage(s)", () => {
  it("posts a string body and reads it back", async () => {
    const topic = `topic-${Date.now()}`;
    const { messageId } = await postMessage(publicClient, walletClient, topic, "e2e4", {
      messagingAddress: addresses.messaging,
    });

    const message = await getMessage(publicClient, messageId, { messagingAddress: addresses.messaging });
    expect(message.sender.toLowerCase()).toBe(account.address.toLowerCase());
    expect(new TextDecoder().decode(message.body)).toBe("e2e4");
  });

  it("getMessagesByTopic returns only that topic's messages, oldest first", async () => {
    const topicA = `topic-a-${Date.now()}`;
    const topicB = `topic-b-${Date.now()}`;

    await postMessage(publicClient, walletClient, topicA, "first", { messagingAddress: addresses.messaging });
    await postMessage(publicClient, walletClient, topicB, "other-topic", { messagingAddress: addresses.messaging });
    await postMessage(publicClient, walletClient, topicA, "second", { messagingAddress: addresses.messaging });

    const messages = await getMessagesByTopic(publicClient, topicA, { messagingAddress: addresses.messaging });
    expect(messages.length).toBe(2);
    expect(new TextDecoder().decode(messages[0].body)).toBe("first");
    expect(new TextDecoder().decode(messages[1].body)).toBe("second");
  });

  it("getMessagesBySender returns everything one address has posted", async () => {
    const otherAccount = privateKeyToAccount(
      // Anvil's default account #1 — public, zero-value test key, verified by actually
      // starting anvil and reading its printed key list (not typed from memory).
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    const otherWallet = createWalletClient({ account: otherAccount, chain: anvilChain, transport: http() });

    const topic = `sender-test-${Date.now()}`;
    await postMessage(publicClient, walletClient, topic, "from account 1", {
      messagingAddress: addresses.messaging,
    });
    await postMessage(publicClient, otherWallet, topic, "from account 2", {
      messagingAddress: addresses.messaging,
    });

    const bySender2 = await getMessagesBySender(publicClient, otherAccount.address, {
      messagingAddress: addresses.messaging,
    });
    expect(bySender2.every((m) => m.sender.toLowerCase() === otherAccount.address.toLowerCase())).toBe(true);
    expect(bySender2.some((m) => new TextDecoder().decode(m.body) === "from account 2")).toBe(true);
  });

  it("getMessageCount reflects total posts across all topics and senders", async () => {
    const before = await getMessageCount(publicClient, { messagingAddress: addresses.messaging });
    await postMessage(publicClient, walletClient, `count-test-${Date.now()}`, "one", {
      messagingAddress: addresses.messaging,
    });
    const after = await getMessageCount(publicClient, { messagingAddress: addresses.messaging });
    expect(after).toBe(before + 1n);
  });

  it("rejects an empty body before calling the chain", async () => {
    await expect(
      postMessage(publicClient, walletClient, "empty-body-test", "", { messagingAddress: addresses.messaging }),
    ).rejects.toThrow("empty body");
  });
});
