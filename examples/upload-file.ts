/**
 * Upload a file, then resolve it straight back — the smallest possible round trip.
 *
 * Run:
 *   PRIVATE_KEY=0x... node upload-file.ts
 *
 * Point it somewhere other than mainnet (e.g. a local Anvil chain) by also setting
 * RPC_URL / STORAGE_ADDRESS.
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, resolve, robinhoodChain, upload } from "@betrhood/sdk";

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Set PRIVATE_KEY (a 0x-prefixed private key) before running this.");

const chain = { ...robinhoodChain, rpcUrls: { default: { http: [process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0]] } } };
const storageAddress = (process.env.STORAGE_ADDRESS as `0x${string}` | undefined) ?? addresses.storage;

const account = privateKeyToAccount(privateKey as `0x${string}`);
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ account, chain, transport: http() });

async function main() {
  const key = `example-${Date.now()}.txt`;
  const data = new TextEncoder().encode("hello from the BetRHood SDK examples");

  console.log(`Uploading under key "${key}" as ${account.address}...`);
  const { version, txHash } = await upload(publicClient, walletClient, key, data, { storageAddress });
  console.log(`Done — version ${version}, tx ${txHash}`);

  const readBack = await resolve(publicClient, account.address, key, { storageAddress });
  console.log("Read back:", new TextDecoder().decode(readBack));
}

main();
