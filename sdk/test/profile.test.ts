import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getProfile, getProfilePicture, setName, setPicture } from "../src/profile.js";
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

describe("Profile", () => {
  it("has no picture and empty name before anything is set", async () => {
    // Anvil default account #5 — never used for writes anywhere in this suite, verified
    // against anvil's own printed key list, not typed from memory.
    const fresh = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
    const profile = await getProfile(publicClient, fresh.address, { profileAddress: addresses.profile });
    expect(profile.name).toBe("");
    expect(profile.hasPicture).toBe(false);
  });

  it("setName then getProfile reflects the new name", async () => {
    await setName(publicClient, walletClient, "cody.bet", { profileAddress: addresses.profile });
    const profile = await getProfile(publicClient, account.address, { profileAddress: addresses.profile });
    expect(profile.name).toBe("cody.bet");
  });

  it("rejects a name over MAX_NAME_LENGTH before calling the chain", async () => {
    const tooLong = "x".repeat(33);
    await expect(
      setName(publicClient, walletClient, tooLong, { profileAddress: addresses.profile }),
    ).rejects.toThrow(/33 bytes, max is 32/);
  });

  it("setPicture uploads through Storage and getProfilePicture resolves the same bytes", async () => {
    const picture = new Uint8Array(2000);
    for (let i = 0; i < picture.length; i++) picture[i] = (i * 3) % 256;

    await setPicture(publicClient, walletClient, picture, {
      profileAddress: addresses.profile,
      storageAddress: addresses.storage,
    });

    const profile = await getProfile(publicClient, account.address, { profileAddress: addresses.profile });
    expect(profile.hasPicture).toBe(true);

    const resolved = await getProfilePicture(publicClient, account.address, {
      profileAddress: addresses.profile,
      storageAddress: addresses.storage,
    });
    expect(resolved).toEqual(picture);
  });

  it("getProfilePicture returns null when no picture is set", async () => {
    // Anvil default account #6, verified the same way.
    const fresh = privateKeyToAccount("0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e");
    const result = await getProfilePicture(publicClient, fresh.address, {
      profileAddress: addresses.profile,
      storageAddress: addresses.storage,
    });
    expect(result).toBeNull();
  });
});
