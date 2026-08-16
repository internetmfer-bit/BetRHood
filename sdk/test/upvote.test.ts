import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  allowCollection1155,
  allowCollection721,
  getAllowedCollections,
  getUpvoteCount,
  hasVoted,
  isOpenVotingEnabled,
  removeCollection,
  setOpenVoting,
  upvote,
} from "../src/upvote.js";
import { ANVIL_RPC, startChain, stopChain, TEST_PRIVATE_KEY, type TestAddresses } from "./setup.js";

const anvilChain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
});

const MOCK_MINT_721_ABI = [
  { type: "function", name: "mint", inputs: [{ name: "to", type: "address" }], outputs: [], stateMutability: "nonpayable" },
] as const;
const MOCK_MINT_1155_ABI = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

let addresses: TestAddresses;
// The Upvote contract's owner is whoever deployed it — same TEST_PRIVATE_KEY account that
// DeployUpvote.s.sol ran as inside startChain().
const owner = privateKeyToAccount(TEST_PRIVATE_KEY);
const publicClient = createPublicClient({ chain: anvilChain, transport: http() });
const ownerWallet = createWalletClient({ account: owner, chain: anvilChain, transport: http() });

// Anvil's default account #1 — public, zero-value test key, verified against anvil's own
// printed key list rather than trusted from memory.
const voter = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const voterWallet = createWalletClient({ account: voter, chain: anvilChain, transport: http() });

beforeAll(async () => {
  addresses = await startChain();
}, 30_000);

afterAll(() => {
  stopChain();
});

async function mint721(to: `0x${string}`) {
  const { request } = await publicClient.simulateContract({
    address: addresses.mockerc721,
    abi: MOCK_MINT_721_ABI,
    functionName: "mint",
    args: [to],
    account: owner,
  });
  await ownerWallet.writeContract(request);
}

async function mint1155(to: `0x${string}`, id: bigint) {
  const { request } = await publicClient.simulateContract({
    address: addresses.mockerc1155,
    abi: MOCK_MINT_1155_ABI,
    functionName: "mint",
    args: [to, id],
    account: owner,
  });
  await ownerWallet.writeContract(request);
}

describe("upvote allowlist + voting", () => {
  it("owner allowlists an ERC721 collection; a holder can upvote", async () => {
    await allowCollection721(publicClient, ownerWallet, addresses.mockerc721, { upvoteAddress: addresses.upvote });
    await mint721(voter.address);

    const messageId = BigInt(Date.now());
    await upvote(publicClient, voterWallet, messageId, addresses.mockerc721, { upvoteAddress: addresses.upvote });

    expect(await getUpvoteCount(publicClient, messageId, { upvoteAddress: addresses.upvote })).toBe(1n);
    expect(await hasVoted(publicClient, messageId, voter.address, { upvoteAddress: addresses.upvote })).toBe(true);
  });

  it("rejects a second vote on the same message from the same address", async () => {
    await allowCollection721(publicClient, ownerWallet, addresses.mockerc721, { upvoteAddress: addresses.upvote });
    await mint721(voter.address);

    const messageId = BigInt(Date.now()) + 1n;
    await upvote(publicClient, voterWallet, messageId, addresses.mockerc721, { upvoteAddress: addresses.upvote });

    await expect(
      upvote(publicClient, voterWallet, messageId, addresses.mockerc721, { upvoteAddress: addresses.upvote }),
    ).rejects.toThrow("already upvoted");
  });

  it("rejects a vote from an address that doesn't hold the collection", async () => {
    await allowCollection721(publicClient, ownerWallet, addresses.mockerc721, { upvoteAddress: addresses.upvote });

    const nonHolder = privateKeyToAccount(
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    );
    const nonHolderWallet = createWalletClient({ account: nonHolder, chain: anvilChain, transport: http() });

    const messageId = BigInt(Date.now()) + 2n;
    await expect(
      upvote(publicClient, nonHolderWallet, messageId, addresses.mockerc721, { upvoteAddress: addresses.upvote }),
    ).rejects.toThrow("doesn't hold a qualifying NFT");
  });

  it("rejects a vote naming a collection that was never allowlisted", async () => {
    const messageId = BigInt(Date.now()) + 3n;
    // mockerc1155 hasn't been allowlisted in this test — reuse it as "some random address".
    await expect(
      upvote(publicClient, voterWallet, messageId, addresses.mockerc1155, { upvoteAddress: addresses.upvote }),
    ).rejects.toThrow("isn't (or is no longer) allowlisted");
  });

  it("supports ERC1155 collections gated on a specific token id", async () => {
    const badgeId = 7n;
    await allowCollection1155(publicClient, ownerWallet, addresses.mockerc1155, badgeId, {
      upvoteAddress: addresses.upvote,
    });
    await mint1155(voter.address, badgeId);

    const messageId = BigInt(Date.now()) + 4n;
    await upvote(publicClient, voterWallet, messageId, addresses.mockerc1155, { upvoteAddress: addresses.upvote });

    expect(await getUpvoteCount(publicClient, messageId, { upvoteAddress: addresses.upvote })).toBe(1n);
  });

  it("removeCollection blocks new votes but getAllowedCollections still shows it as history", async () => {
    await allowCollection721(publicClient, ownerWallet, addresses.mockerc721, { upvoteAddress: addresses.upvote });
    await removeCollection(publicClient, ownerWallet, addresses.mockerc721, { upvoteAddress: addresses.upvote });

    const collections = await getAllowedCollections(publicClient, { upvoteAddress: addresses.upvote });
    const entry = collections.find((c) => c.collection.toLowerCase() === addresses.mockerc721.toLowerCase());
    expect(entry).toBeDefined();
    expect(entry?.allowed).toBe(false);

    const messageId = BigInt(Date.now()) + 5n;
    await mint721(voter.address);
    await expect(
      upvote(publicClient, voterWallet, messageId, addresses.mockerc721, { upvoteAddress: addresses.upvote }),
    ).rejects.toThrow("isn't (or is no longer) allowlisted");
  });
});

describe("open voting", () => {
  it("is enabled by default (DeployUpvote.s.sol deploys it that way)", async () => {
    expect(await isOpenVotingEnabled(publicClient, { upvoteAddress: addresses.upvote })).toBe(true);
  });

  it("lets anyone vote with no collection argument and no NFT held", async () => {
    const noHoldings = privateKeyToAccount(
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    );
    const noHoldingsWallet = createWalletClient({ account: noHoldings, chain: anvilChain, transport: http() });

    const messageId = BigInt(Date.now()) + 100n;
    await upvote(publicClient, noHoldingsWallet, messageId, undefined, { upvoteAddress: addresses.upvote });

    expect(await getUpvoteCount(publicClient, messageId, { upvoteAddress: addresses.upvote })).toBe(1n);
    expect(await hasVoted(publicClient, messageId, noHoldings.address, { upvoteAddress: addresses.upvote })).toBe(
      true,
    );
  });

  it("rejects a second open vote on the same message from the same address", async () => {
    const messageId = BigInt(Date.now()) + 101n;
    await upvote(publicClient, voterWallet, messageId, undefined, { upvoteAddress: addresses.upvote });

    await expect(
      upvote(publicClient, voterWallet, messageId, undefined, { upvoteAddress: addresses.upvote }),
    ).rejects.toThrow("already upvoted");
  });

  it("owner can disable open voting; re-enables it afterward so later tests aren't affected", async () => {
    await setOpenVoting(publicClient, ownerWallet, false, { upvoteAddress: addresses.upvote });

    const messageId = BigInt(Date.now()) + 102n;
    await expect(
      upvote(publicClient, voterWallet, messageId, undefined, { upvoteAddress: addresses.upvote }),
    ).rejects.toThrow("Open voting is currently disabled");

    await setOpenVoting(publicClient, ownerWallet, true, { upvoteAddress: addresses.upvote });
    expect(await isOpenVotingEnabled(publicClient, { upvoteAddress: addresses.upvote })).toBe(true);
  });
});
