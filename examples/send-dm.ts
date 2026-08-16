/**
 * Send and read back an end-to-end encrypted DM between two accounts. Both sides must publish
 * a messaging public key and follow each other before a conversation is possible — this script
 * does all of that from scratch, so it also works as a from-nothing local verification seed.
 *
 * Run:
 *   PRIVATE_KEY=0x... RECIPIENT_PRIVATE_KEY=0x... node send-dm.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  addresses,
  deriveMessagingKeyPair,
  follow,
  getConversation,
  publishMessagingPublicKey,
  robinhoodChain,
  sendDm,
} from "@betrhood/sdk";

const privateKey = process.env.PRIVATE_KEY;
const recipientPrivateKey = process.env.RECIPIENT_PRIVATE_KEY;
if (!privateKey || !recipientPrivateKey) {
  throw new Error("Set PRIVATE_KEY and RECIPIENT_PRIVATE_KEY (both 0x-prefixed) before running this.");
}

const chain = {
  ...robinhoodChain,
  id: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : robinhoodChain.id,
  rpcUrls: { default: { http: [process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0]] } },
};
const messagingAddress = (process.env.MESSAGING_ADDRESS as `0x${string}` | undefined) ?? addresses.messaging;
const storageAddress = (process.env.STORAGE_ADDRESS as `0x${string}` | undefined) ?? addresses.storage;
const followAddress = (process.env.FOLLOW_ADDRESS as `0x${string}` | undefined) ?? addresses.follow;

const senderAccount = privateKeyToAccount(privateKey as `0x${string}`);
const recipientAccount = privateKeyToAccount(recipientPrivateKey as `0x${string}`);
const publicClient = createPublicClient({ chain, transport: http() });
const senderWallet = createWalletClient({ account: senderAccount, chain, transport: http() });
const recipientWallet = createWalletClient({ account: recipientAccount, chain, transport: http() });

async function main() {
  console.log(`Sender: ${senderAccount.address}`);
  console.log(`Recipient: ${recipientAccount.address}`);

  console.log("\nFollowing each other (DMs require a mutual follow)...");
  await follow(publicClient, senderWallet, recipientAccount.address, { followAddress });
  await follow(publicClient, recipientWallet, senderAccount.address, { followAddress });

  console.log("Deriving and publishing messaging keys for both accounts...");
  const senderKeyPair = await deriveMessagingKeyPair(senderWallet);
  const recipientKeyPair = await deriveMessagingKeyPair(recipientWallet);
  await publishMessagingPublicKey(publicClient, senderWallet, senderKeyPair.publicKey, { storageAddress });
  await publishMessagingPublicKey(publicClient, recipientWallet, recipientKeyPair.publicKey, { storageAddress });

  console.log("\nSending an encrypted DM...");
  const { messageId, txHash } = await sendDm(
    publicClient,
    senderWallet,
    recipientAccount.address,
    "hey — this message is end-to-end encrypted",
    senderKeyPair,
    { messagingAddress, storageAddress },
  );
  console.log(`Sent — message #${messageId}, tx ${txHash}`);

  console.log("\nReading the conversation back from the recipient's side (decrypted locally)...");
  const conversation = await getConversation(publicClient, recipientAccount.address, senderAccount.address, recipientKeyPair, {
    messagingAddress,
    storageAddress,
  });
  for (const item of conversation) {
    const text = item.status === "ok" ? item.text : "[unable to decrypt]";
    console.log(`  [${new Date(Number(item.timestamp) * 1000).toISOString()}] ${item.from}: ${text}`);
  }
}

main();
