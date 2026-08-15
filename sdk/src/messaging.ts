import {
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  hexToBytes,
  stringToHex,
  toHex,
} from "viem";
import { addresses } from "./addresses.js";
import MessagingAbiJson from "./abi/Messaging.json" with { type: "json" };

const MessagingAbi = MessagingAbiJson as Abi;

export interface Message {
  sender: Address;
  topic: Hex;
  body: Uint8Array;
  timestamp: bigint;
}

export class EmptyBodyError extends Error {
  constructor() {
    super("postMessage() was called with an empty body — there's nothing to post.");
  }
}

/** Topic strings longer than 32 bytes are truncated by stringToHex — keep topics short and
 * human-readable (e.g. "chess:game-2481"), not arbitrary-length free text. */
function topicToHex(topic: string): Hex {
  return stringToHex(topic, { size: 32 });
}

/**
 * Posts `body` under `topic`. Unlike file storage, messages are not gzipped — they're meant
 * to be short (moves, comments, short posts), where compression overhead isn't worth it.
 */
export async function postMessage(
  publicClient: PublicClient,
  walletClient: WalletClient,
  topic: string,
  body: Uint8Array | string,
  options?: { messagingAddress?: Address },
): Promise<{ messageId: bigint; txHash: Hex }> {
  const bodyBytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  if (bodyBytes.length === 0) throw new EmptyBodyError();
  if (!walletClient.account) throw new Error("walletClient must have an account attached.");

  const address = options?.messagingAddress ?? addresses.messaging;

  const { request, result: messageId } = await publicClient.simulateContract({
    address,
    abi: MessagingAbi,
    functionName: "post",
    args: [topicToHex(topic), toHex(bodyBytes)],
    account: walletClient.account,
  });

  const txHash = await walletClient.writeContract(request);

  return { messageId: messageId as bigint, txHash };
}

export async function getMessage(
  publicClient: PublicClient,
  messageId: bigint,
  options?: { messagingAddress?: Address },
): Promise<Message> {
  const [sender, topic, body, timestamp] = (await publicClient.readContract({
    address: options?.messagingAddress ?? addresses.messaging,
    abi: MessagingAbi,
    functionName: "getMessage",
    args: [messageId],
  })) as [Address, Hex, Hex, bigint];

  return { sender, topic, body: hexToBytes(body), timestamp };
}

/** Returns every message posted under `topic`, oldest first. */
export async function getMessagesByTopic(
  publicClient: PublicClient,
  topic: string,
  options?: { messagingAddress?: Address },
): Promise<Message[]> {
  const address = options?.messagingAddress ?? addresses.messaging;
  const topicHex = topicToHex(topic);

  const count = (await publicClient.readContract({
    address,
    abi: MessagingAbi,
    functionName: "topicCount",
    args: [topicHex],
  })) as bigint;

  const ids = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      publicClient.readContract({
        address,
        abi: MessagingAbi,
        functionName: "topicMessageId",
        args: [topicHex, BigInt(i)],
      }) as Promise<bigint>,
    ),
  );

  return Promise.all(ids.map((id) => getMessage(publicClient, id, options)));
}

/** Returns every message posted by `sender`, oldest first. */
export async function getMessagesBySender(
  publicClient: PublicClient,
  sender: Address,
  options?: { messagingAddress?: Address },
): Promise<Message[]> {
  const address = options?.messagingAddress ?? addresses.messaging;

  const count = (await publicClient.readContract({
    address,
    abi: MessagingAbi,
    functionName: "senderCount",
    args: [sender],
  })) as bigint;

  const ids = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      publicClient.readContract({
        address,
        abi: MessagingAbi,
        functionName: "senderMessageId",
        args: [sender, BigInt(i)],
      }) as Promise<bigint>,
    ),
  );

  return Promise.all(ids.map((id) => getMessage(publicClient, id, options)));
}

