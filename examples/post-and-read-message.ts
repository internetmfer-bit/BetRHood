/**
 * Post a message under a topic, then read the whole topic back.
 *
 * Run:
 *   PRIVATE_KEY=0x... node post-and-read-message.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, getMessagesByTopic, postMessage, robinhoodChain } from "@betrhood/sdk";

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Set PRIVATE_KEY (a 0x-prefixed private key) before running this.");

const chain = { ...robinhoodChain, rpcUrls: { default: { http: [process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0]] } } };
const messagingAddress = (process.env.MESSAGING_ADDRESS as `0x${string}` | undefined) ?? addresses.messaging;

const account = privateKeyToAccount(privateKey as `0x${string}`);
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ account, chain, transport: http() });

async function main() {
  const topic = "sdk-examples";

  console.log(`Posting to topic "${topic}"...`);
  const { messageId, txHash } = await postMessage(publicClient, walletClient, topic, "hello from the examples", {
    messagingAddress,
  });
  console.log(`Posted — message #${messageId}, tx ${txHash}`);

  const thread = await getMessagesByTopic(publicClient, topic, { messagingAddress });
  console.log(`\n"${topic}" now has ${thread.length} message(s):`);
  for (const m of thread) {
    console.log(`  [${new Date(Number(m.timestamp) * 1000).toISOString()}] ${m.sender}: ${new TextDecoder().decode(m.body)}`);
  }
}

main();
