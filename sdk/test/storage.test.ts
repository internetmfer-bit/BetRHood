import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getVersionCount, resolve, upload } from "../src/storage.js";
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

describe("upload / resolve", () => {
  it("round-trips small data exactly", async () => {
    const data = new TextEncoder().encode("hello from the SDK test suite");
    const key = `test-key-${Date.now()}`;

    await upload(publicClient, walletClient, key, data, { storageAddress: addresses.storage });
    const result = await resolve(publicClient, account.address, key, { storageAddress: addresses.storage });

    expect(result).toEqual(data);
  });

  it("round-trips data large enough to require multiple chunks", async () => {
    const data = new Uint8Array(50_000);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;
    const key = `big-key-${Date.now()}`;

    await upload(publicClient, walletClient, key, data, { storageAddress: addresses.storage });
    const result = await resolve(publicClient, account.address, key, { storageAddress: addresses.storage });

    expect(result).toEqual(data);
  });

  it("returns the assigned version number", async () => {
    const key = `versioned-${Date.now()}`;
    const { version: v0 } = await upload(publicClient, walletClient, key, new TextEncoder().encode("v0"), {
      storageAddress: addresses.storage,
    });
    const { version: v1 } = await upload(publicClient, walletClient, key, new TextEncoder().encode("v1"), {
      storageAddress: addresses.storage,
    });

    expect(v0).toBe(0n);
    expect(v1).toBe(1n);
  });

  it("read() on a never-written key returns empty bytes, not an error", async () => {
    const result = await resolve(publicClient, account.address, `never-written-${Date.now()}`, {
      storageAddress: addresses.storage,
    });
    expect(result.length).toBe(0);
  });

  it("getVersionCount reflects the number of writes", async () => {
    const key = `count-${Date.now()}`;
    expect(await getVersionCount(publicClient, account.address, key, { storageAddress: addresses.storage })).toBe(
      0n,
    );

    await upload(publicClient, walletClient, key, new TextEncoder().encode("v0"), {
      storageAddress: addresses.storage,
    });
    expect(await getVersionCount(publicClient, account.address, key, { storageAddress: addresses.storage })).toBe(
      1n,
    );
  });

  it("rejects empty data before ever calling the chain", async () => {
    await expect(
      upload(publicClient, walletClient, "empty-test", new Uint8Array(0), { storageAddress: addresses.storage }),
    ).rejects.toThrow("empty data");
  });
});
