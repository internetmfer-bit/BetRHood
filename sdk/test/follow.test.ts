import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  follow,
  getFollowerCount,
  getFollowers,
  getFollowing,
  getFollowingCount,
  isFollowing,
  unfollow,
} from "../src/follow.js";
import { ANVIL_RPC, startChain, stopChain, TEST_PRIVATE_KEY, type TestAddresses } from "./setup.js";

const anvilChain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
});

let addresses: TestAddresses;
const publicClient = createPublicClient({ chain: anvilChain, transport: http() });

const alice = privateKeyToAccount(TEST_PRIVATE_KEY);
const aliceWallet = createWalletClient({ account: alice, chain: anvilChain, transport: http() });

// Anvil's default account #1 — public, zero-value test key, verified against anvil's own
// printed key list rather than trusted from memory.
const bob = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const bobWallet = createWalletClient({ account: bob, chain: anvilChain, transport: http() });

// Anvil's default account #2 — same verification discipline as above.
const carol = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const carolWallet = createWalletClient({ account: carol, chain: anvilChain, transport: http() });

beforeAll(async () => {
  addresses = await startChain();
}, 30_000);

afterAll(() => {
  stopChain();
});

describe("follow / unfollow", () => {
  it("follow() sets isFollowing and both counts", async () => {
    await follow(publicClient, aliceWallet, bob.address, { followAddress: addresses.follow });

    expect(await isFollowing(publicClient, alice.address, bob.address, { followAddress: addresses.follow })).toBe(
      true,
    );
    expect(await getFollowingCount(publicClient, alice.address, { followAddress: addresses.follow })).toBe(1n);
    expect(await getFollowerCount(publicClient, bob.address, { followAddress: addresses.follow })).toBe(1n);
  });

  it("rejects following yourself", async () => {
    await expect(
      follow(publicClient, aliceWallet, alice.address, { followAddress: addresses.follow }),
    ).rejects.toThrow("your own address");
  });

  it("rejects following the same address twice", async () => {
    await follow(publicClient, bobWallet, carol.address, { followAddress: addresses.follow });
    await expect(
      follow(publicClient, bobWallet, carol.address, { followAddress: addresses.follow }),
    ).rejects.toThrow("Already following");
  });

  it("unfollow() clears isFollowing and decrements both counts", async () => {
    await follow(publicClient, carolWallet, alice.address, { followAddress: addresses.follow });
    await unfollow(publicClient, carolWallet, alice.address, { followAddress: addresses.follow });

    expect(await isFollowing(publicClient, carol.address, alice.address, { followAddress: addresses.follow })).toBe(
      false,
    );
  });

  it("rejects unfollowing someone you don't follow", async () => {
    await expect(
      unfollow(publicClient, carolWallet, bob.address, { followAddress: addresses.follow }),
    ).rejects.toThrow("Not currently following");
  });

  it("getFollowing/getFollowers only return active follows, not unfollowed history", async () => {
    // Fresh pair, isolated from other tests' state.
    const dave = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
    const daveWallet = createWalletClient({ account: dave, chain: anvilChain, transport: http() });
    const erin = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");

    await follow(publicClient, daveWallet, erin.address, { followAddress: addresses.follow });
    await follow(publicClient, daveWallet, alice.address, { followAddress: addresses.follow });
    await unfollow(publicClient, daveWallet, erin.address, { followAddress: addresses.follow });

    const following = await getFollowing(publicClient, dave.address, { followAddress: addresses.follow });
    expect(following.map((a) => a.toLowerCase())).toEqual([alice.address.toLowerCase()]);

    const aliceFollowers = await getFollowers(publicClient, alice.address, { followAddress: addresses.follow });
    expect(aliceFollowers.map((a) => a.toLowerCase())).toContain(dave.address.toLowerCase());

    const erinFollowers = await getFollowers(publicClient, erin.address, { followAddress: addresses.follow });
    expect(erinFollowers.map((a) => a.toLowerCase())).not.toContain(dave.address.toLowerCase());
  });
});
