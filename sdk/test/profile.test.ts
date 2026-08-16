import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBio, getNameDirectory, getProfile, getProfilePicture, setBio, setName, setPicture } from "../src/profile.js";
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

  it("getBio returns empty string when never set", async () => {
    // Anvil default account #7, verified against anvil's own printed key list.
    const fresh = privateKeyToAccount("0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356");
    const bio = await getBio(publicClient, fresh.address, { storageAddress: addresses.storage });
    expect(bio).toBe("");
  });

  it("setBio then getBio round-trips", async () => {
    await setBio(publicClient, walletClient, "building onchain things.", { storageAddress: addresses.storage });
    const bio = await getBio(publicClient, account.address, { storageAddress: addresses.storage });
    expect(bio).toBe("building onchain things.");
  });

  it("rejects a bio over the max length before calling the chain", async () => {
    const tooLong = "x".repeat(281);
    await expect(
      setBio(publicClient, walletClient, tooLong, { storageAddress: addresses.storage }),
    ).rejects.toThrow(/281 bytes, max is 280/);
  });

  describe("getNameDirectory", () => {
    it("includes an address once it sets a name", async () => {
      // Anvil default account #1 — verified against anvil's own printed key list.
      const alice = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
      const aliceWallet = createWalletClient({ account: alice, chain: anvilChain, transport: http() });
      await setName(publicClient, aliceWallet, "alice", { profileAddress: addresses.profile });

      const directory = await getNameDirectory(publicClient, { profileAddress: addresses.profile });
      expect(directory.find((e) => e.address.toLowerCase() === alice.address.toLowerCase())).toEqual({
        address: alice.address,
        name: "alice",
      });
      // "cody.bet" was set on account #0 earlier in this file — confirms multiple addresses coexist.
      expect(directory.some((e) => e.name === "cody.bet")).toBe(true);
    });

    it("reflects only the most recent name after a rename, not both", async () => {
      // Anvil default account #2.
      const bob = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
      const bobWallet = createWalletClient({ account: bob, chain: anvilChain, transport: http() });
      await setName(publicClient, bobWallet, "bob-old", { profileAddress: addresses.profile });
      await setName(publicClient, bobWallet, "bob-new", { profileAddress: addresses.profile });

      const directory = await getNameDirectory(publicClient, { profileAddress: addresses.profile });
      const entries = directory.filter((e) => e.address.toLowerCase() === bob.address.toLowerCase());
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe("bob-new");
    });

    it("drops an address that renamed to an empty string", async () => {
      // Anvil default account #3.
      const carol = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
      const carolWallet = createWalletClient({ account: carol, chain: anvilChain, transport: http() });
      await setName(publicClient, carolWallet, "carol-temp", { profileAddress: addresses.profile });
      await setName(publicClient, carolWallet, "", { profileAddress: addresses.profile });

      const directory = await getNameDirectory(publicClient, { profileAddress: addresses.profile });
      expect(directory.some((e) => e.address.toLowerCase() === carol.address.toLowerCase())).toBe(false);
    });
  });
});
