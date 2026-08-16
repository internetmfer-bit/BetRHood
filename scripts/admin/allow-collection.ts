/**
 * Owner-only: allowlists an NFT collection so its holders can upvote. Standard is
 * auto-detected on-chain via ERC-165 (falls back to ERC-721 if a contract doesn't answer
 * supportsInterface at all — some older/minimal contracts don't implement ERC-165 cleanly).
 *
 * Run:
 *   PRIVATE_KEY=0x... node scripts/admin/allow-collection.ts <collection address> [tokenId]
 *
 * [tokenId] is only used if the collection turns out to be ERC-1155 (required in that case —
 * 1155 gates on one specific token id, since 1155 has no "any token in this collection"
 * concept). Ignored for ERC-721.
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, allowCollection1155, allowCollection721, robinhoodChain } from "@betrhood/sdk";

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Set PRIVATE_KEY (the Upvote contract owner's key) before running this.");

const collection = process.argv[2] as `0x${string}` | undefined;
if (!collection) throw new Error("Usage: node allow-collection.ts <collection address> [tokenId]");

const tokenIdArg = process.argv[3];

const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";

// RPC_URL / UPVOTE_ADDRESS overrides exist so this can be dry-run against a local Anvil chain
// before ever touching mainnet — same pattern as the SDK examples.
const chain = { ...robinhoodChain, rpcUrls: { default: { http: [process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0]] } } };
const upvoteAddress = (process.env.UPVOTE_ADDRESS as `0x${string}` | undefined) ?? addresses.upvote;

const account = privateKeyToAccount(privateKey as `0x${string}`);
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ account, chain, transport: http() });

async function supportsInterface(interfaceId: `0x${string}`): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: collection as `0x${string}`,
      abi: [
        {
          type: "function",
          name: "supportsInterface",
          inputs: [{ name: "interfaceId", type: "bytes4" }],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "view",
        },
      ],
      functionName: "supportsInterface",
      args: [interfaceId],
    });
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Checking ${collection} on Robinhood Chain mainnet...`);

  const is1155 = await supportsInterface(ERC1155_INTERFACE_ID);
  const is721 = !is1155 && (await supportsInterface(ERC721_INTERFACE_ID));

  if (is1155) {
    if (!tokenIdArg) {
      throw new Error(`${collection} is ERC-1155 — a tokenId argument is required to allowlist it.`);
    }
    const tokenId = BigInt(tokenIdArg);
    console.log(`Detected ERC-1155. Allowlisting token id ${tokenId}...`);
    const txHash = await allowCollection1155(publicClient, walletClient, collection, tokenId, { upvoteAddress });
    console.log(`Done — tx ${txHash}`);
    return;
  }

  if (!is721) {
    console.warn(`Warning: ${collection} didn't confirm ERC-721 or ERC-1155 via ERC-165. Assuming ERC-721.`);
  } else {
    console.log("Detected ERC-721.");
  }

  const txHash = await allowCollection721(publicClient, walletClient, collection, { upvoteAddress });
  console.log(`Done — tx ${txHash}`);
}

main();
