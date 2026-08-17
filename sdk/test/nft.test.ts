import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveForListing,
  buyListing,
  cancelListing,
  createListing,
  getActiveListings,
  getMyListings,
} from "../src/nft.js";
import { ANVIL_RPC, startChain, stopChain, TEST_PRIVATE_KEY, type TestAddresses } from "./setup.js";

const anvilChain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
});

const MOCK_MINT_721_ABI = [
  { type: "function", name: "mint", inputs: [{ name: "to", type: "address" }, { name: "id", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
] as const;
const MOCK_SET_APPROVAL_ABI = [
  { type: "function", name: "setApprovalForAll", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [], stateMutability: "nonpayable" },
] as const;
const MOCK_OWNER_OF_ABI = [
  { type: "function", name: "ownerOf", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
] as const;

let addresses: TestAddresses;
const seller = privateKeyToAccount(TEST_PRIVATE_KEY);
const publicClient = createPublicClient({ chain: anvilChain, transport: http() });
const sellerWallet = createWalletClient({ account: seller, chain: anvilChain, transport: http() });

// Anvil's default account #1 — public, zero-value test key, same one upvote.test.ts uses.
const buyer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const buyerWallet = createWalletClient({ account: buyer, chain: anvilChain, transport: http() });

let nextTokenId = 1n;

beforeAll(async () => {
  addresses = await startChain();
}, 30_000);

afterAll(() => {
  stopChain();
});

async function mint(to: `0x${string}`): Promise<bigint> {
  const tokenId = nextTokenId++;
  const { request } = await publicClient.simulateContract({
    address: addresses.mockerc721full,
    abi: MOCK_MINT_721_ABI,
    functionName: "mint",
    args: [to, tokenId],
    account: seller,
  });
  await sellerWallet.writeContract(request);
  return tokenId;
}

async function ownerOf(tokenId: bigint): Promise<`0x${string}`> {
  return (await publicClient.readContract({
    address: addresses.mockerc721full,
    abi: MOCK_OWNER_OF_ABI,
    functionName: "ownerOf",
    args: [tokenId],
  })) as `0x${string}`;
}

const PRICE = 1_000_000_000_000_000n; // 0.001 ETH

// Every nft.ts call needs these overrides on local Anvil: seaportAddress (else it silently
// falls back to nothing deployed locally), messagingAddress (else it falls back to the SDK's
// hardcoded mainnet address, which doesn't exist here either), and chainId — Seaport caches its
// EIP-712 domain separator keyed to the chain id live at ITS construction (4663, Robinhood
// mainnet) and recomputes it fresh from block.chainid whenever that doesn't match, so a listing
// signed for chainId 4663 fails signature verification here, where Anvil reports 31337.
function opts() {
  return { seaportAddress: addresses.seaport, messagingAddress: addresses.messaging, chainId: anvilChain.id };
}

async function listOne(): Promise<{ tokenId: bigint; messageId: bigint }> {
  const tokenId = await mint(seller.address);
  await approveForListing(publicClient, sellerWallet, addresses.mockerc721full, "ERC721", { seaportAddress: addresses.seaport });
  const { messageId } = await createListing(
    publicClient,
    sellerWallet,
    { collection: addresses.mockerc721full, tokenId, standard: "ERC721", priceWei: PRICE },
    opts(),
  );
  return { tokenId, messageId };
}

describe("nft store", () => {
  it("lists an NFT, then a buyer can buy it — ownership and balances move correctly", async () => {
    const { tokenId, messageId } = await listOne();

    const active = await getActiveListings(publicClient, opts());
    expect(active.some((l) => l.messageId === messageId)).toBe(true);

    const sellerBalanceBefore = await publicClient.getBalance({ address: seller.address });
    const listing = active.find((l) => l.messageId === messageId)!;

    await buyListing(publicClient, buyerWallet, listing, { seaportAddress: addresses.seaport });

    expect((await ownerOf(tokenId)).toLowerCase()).toBe(buyer.address.toLowerCase());
    const sellerBalanceAfter = await publicClient.getBalance({ address: seller.address });
    expect(sellerBalanceAfter - sellerBalanceBefore).toBe(PRICE);

    const activeAfter = await getActiveListings(publicClient, opts());
    expect(activeAfter.some((l) => l.messageId === messageId)).toBe(false);
  });

  it("cancelling a listing removes it from active listings and a buy attempt throws OrderIsCancelledError", async () => {
    const { messageId } = await listOne();

    const active = await getActiveListings(publicClient, opts());
    const listing = active.find((l) => l.messageId === messageId)!;

    await cancelListing(publicClient, sellerWallet, listing, { seaportAddress: addresses.seaport });

    const activeAfter = await getActiveListings(publicClient, opts());
    expect(activeAfter.some((l) => l.messageId === messageId)).toBe(false);

    await expect(
      buyListing(publicClient, buyerWallet, listing, { seaportAddress: addresses.seaport }),
    ).rejects.toThrow("cancelled");
  });

  it("excludes a listing whose endTime has already passed, with no RPC call needed", async () => {
    const tokenId = await mint(seller.address);
    await approveForListing(publicClient, sellerWallet, addresses.mockerc721full, "ERC721", { seaportAddress: addresses.seaport });
    const { messageId } = await createListing(
      publicClient,
      sellerWallet,
      { collection: addresses.mockerc721full, tokenId, standard: "ERC721", priceWei: PRICE, durationSeconds: -1 },
      opts(),
    );

    const active = await getActiveListings(publicClient, opts());
    expect(active.some((l) => l.messageId === messageId)).toBe(false);

    const mine = await getMyListings(publicClient, seller.address, opts());
    const found = mine.find((l) => l.messageId === messageId);
    expect(found?.status).toBe("expired");
  });

  it("excludes a listing whose approval was revoked after listing", async () => {
    const { messageId } = await listOne();

    const { request } = await publicClient.simulateContract({
      address: addresses.mockerc721full,
      abi: MOCK_SET_APPROVAL_ABI,
      functionName: "setApprovalForAll",
      args: [addresses.seaport, false],
      account: seller,
    });
    await sellerWallet.writeContract(request);

    const active = await getActiveListings(publicClient, opts());
    expect(active.some((l) => l.messageId === messageId)).toBe(false);
  });

  it("a listing tampered with after signing fails cleanly with a typed signature error, not a partial trade", async () => {
    // buyListing() always derives msg.value from the listing's own signed price, so there's no
    // way to under-send through the public API by design — the realistic failure mode this
    // guards against is a listing message that's been altered (or forged) after signing, e.g.
    // someone posting doctored order data directly to the topic. Seaport re-derives the order
    // hash from the parameters it's given, so a changed price no longer matches what was
    // actually signed — this is exactly the atomicity guarantee the whole design leans on.
    const { tokenId, messageId } = await listOne();
    const active = await getActiveListings(publicClient, opts());
    const listing = active.find((l) => l.messageId === messageId)!;

    const tampered = { ...listing, envelope: { ...listing.envelope, priceWei: "1" } };
    await expect(
      buyListing(publicClient, buyerWallet, tampered, { seaportAddress: addresses.seaport }),
    ).rejects.toThrow("signature is invalid");

    // No partial/bad trade occurred — the NFT never moved.
    expect((await ownerOf(tokenId)).toLowerCase()).toBe(seller.address.toLowerCase());
  });

  it("cancelListing called by a non-offerer throws NotOrderOffererError before any RPC call", async () => {
    const { messageId } = await listOne();
    const active = await getActiveListings(publicClient, opts());
    const listing = active.find((l) => l.messageId === messageId)!;

    await expect(
      cancelListing(publicClient, buyerWallet, listing, { seaportAddress: addresses.seaport }),
    ).rejects.toThrow("other than the listing's own seller");
  });
});
