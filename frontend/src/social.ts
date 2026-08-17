import {
  getFollowing,
  getMessage,
  getRecentMessagesBySender,
  getTopicMessageCount,
  getUpvoteCount,
  postMessage,
  type Message,
} from "@betrhood/sdk";
import type { Address, PublicClient, WalletClient } from "viem";
import { stringToHex } from "viem";
import { SOCIAL_TOPIC, SOCIAL_TOPIC_HEX } from "./topics";

/** How many of a followee's most-recent messages (across every topic they've ever posted to,
 * not just `social`) to scan for feed posts — bounds the cost of a prolific forum/showcase
 * poster who happens to also post to their feed. */
export const POSTS_WINDOW_PER_ADDRESS = 30;
/** How many followees the following feed fans out to, most-recently-followed first, if
 * `getFollowing` returns more than this. */
export const FOLLOWEE_CAP = 100;
/** Candidate posts are capped here before the (more expensive, two-reads-per-post) ranking
 * step runs. */
export const FEED_CANDIDATE_CAP = 150;
/** Final rendered feed length, matching Home.tsx's RECENT_LIMIT precedent. */
export const FEED_DISPLAY_LIMIT = 30;

export type SocialPostBody = { type: "post"; text: string } | { type: "repost"; originalMessageId: string };

/** Same try/catch-returns-null codec shape as Home.tsx's parseShowcaseBody. Post bodies are
 * JSON so a plain post and a repost record can share one topic and still be told apart. */
export function parseSocialBody(bytes: Uint8Array): SocialPostBody | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (parsed?.type === "post" && typeof parsed.text === "string") {
      return { type: "post", text: parsed.text };
    }
    if (parsed?.type === "repost" && typeof parsed.originalMessageId === "string") {
      return { type: "repost", originalMessageId: parsed.originalMessageId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Single source of truth for the per-post comment topic convention. Message ids are small
 * decimal numbers for the practical lifetime of the protocol, so this stays safely under
 * Messaging.sol's 32-byte topic cap (unlike a per-address topic, which an address alone would
 * already overflow). */
export function commentTopic(messageId: bigint): string {
  return `comment:${messageId}`;
}

const COMMENT_TOPIC_PREFIX = "comment:";
// Comment topics are per-message-id, so unlike SOCIAL_TOPIC they can't be excluded from the
// public Forum topic list by exact match — this checks the prefix instead, in both the plain
// string and hex-encoded forms (Message.topic comes back as hex on reads). Right-padding with
// zero bytes means the hex encoding of any "comment:<id>" string always starts with the same
// prefix bytes, regardless of which id follows.
const COMMENT_TOPIC_PREFIX_HEX = stringToHex(COMMENT_TOPIC_PREFIX, { size: COMMENT_TOPIC_PREFIX.length }).toLowerCase();

/** True for any per-post comment topic (`comment:0`, `comment:1`, ...) — these are internal,
 * like the reserved topics in topics.ts, and must never show up as a browsable/postable public
 * Forum thread. */
export function isCommentTopic(topic: string): boolean {
  return topic.startsWith(COMMENT_TOPIC_PREFIX) || topic.toLowerCase().startsWith(COMMENT_TOPIC_PREFIX_HEX);
}

export interface FeedItem {
  /** The message actually posted to `social` — for a repost, this is the repost record itself,
   * not the original. */
  post: Message;
  body: SocialPostBody;
  /** The original message being reposted, resolved once here. Undefined for a plain post. */
  original?: Message;
}

/** The message id likes/comments should aggregate on — the original for a repost, the post
 * itself otherwise. A repost of a repost always resolves through to the same original (see
 * `repost()` below), so engagement never fragments across a repost chain. */
export function canonicalId(item: FeedItem): bigint {
  return item.original?.id ?? item.post.id;
}

async function toFeedItem(publicClient: PublicClient, message: Message): Promise<FeedItem | null> {
  const body = parseSocialBody(message.body);
  if (!body) return null;
  if (body.type === "post") return { post: message, body };

  try {
    const original = await getMessage(publicClient, BigInt(body.originalMessageId));
    return { post: message, body, original };
  } catch {
    // Messages are permanent, so this shouldn't happen — but don't let one bad id sink an
    // otherwise-fine feed.
    return null;
  }
}

/** One address's own feed posts and reposts, most recent first, bounded to their last
 * `POSTS_WINDOW_PER_ADDRESS` messages overall (see the constant's doc comment). Used both for
 * a profile's own "Posts" section and as the building block for the following feed. */
export async function getOwnSocialPosts(publicClient: PublicClient, address: Address): Promise<FeedItem[]> {
  const recent = await getRecentMessagesBySender(publicClient, address, POSTS_WINDOW_PER_ADDRESS);
  const social = recent.filter((m) => m.topic === SOCIAL_TOPIC_HEX);
  const items = await Promise.all(social.map((m) => toFeedItem(publicClient, m)));
  return items.filter((item): item is FeedItem => item !== null);
}

function score(item: FeedItem, likes: number, comments: number, now: number): number {
  const ageHours = Math.max(0, (now - Number(item.post.timestamp) * 1000) / 3_600_000);
  return (1 + likes + 2 * comments) / (ageHours + 2) ** 1.5;
}

/**
 * Posts from everyone `currentUser` follows, ranked by a blend of recency and engagement —
 * `(1 + likes + 2*comments) / (ageHours + 2)^1.5`, comments weighted 2x likes as the deeper
 * signal, with a +1 floor so a brand-new zero-engagement post still ranks by pure recency.
 * Reposts aren't counted in the score — Messaging.sol has no reverse index of "who reposted
 * message X", so a true repost count would need an unbounded scan. A widely-reposted post still
 * surfaces more often organically instead, since each repost is its own feed entry for that
 * reposter's followers.
 */
export async function getFollowingFeed(publicClient: PublicClient, currentUser: Address): Promise<FeedItem[]> {
  const following = await getFollowing(publicClient, currentUser);
  const followees = following.slice(-FOLLOWEE_CAP).reverse();
  // Your own feed always includes your own posts too, not just people you follow — same as
  // any other social app's home timeline. Doesn't count against FOLLOWEE_CAP, since it isn't one.
  const addresses = [currentUser, ...followees];

  const perAddress = await Promise.all(addresses.map((addr) => getOwnSocialPosts(publicClient, addr)));
  const candidates = perAddress.flat().slice(0, FEED_CANDIDATE_CAP);
  const ids = candidates.map(canonicalId);

  const [likeCounts, commentCounts] = await Promise.all([
    Promise.all(ids.map((id) => getUpvoteCount(publicClient, id))),
    Promise.all(ids.map((id) => getTopicMessageCount(publicClient, commentTopic(id)))),
  ]);

  const now = Date.now();
  return candidates
    .map((item, i) => ({ item, likes: Number(likeCounts[i]), comments: Number(commentCounts[i]) }))
    .sort((a, b) => {
      const scoreA = score(a.item, a.likes, a.comments, now);
      const scoreB = score(b.item, b.likes, b.comments, now);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return Number(b.item.post.timestamp - a.item.post.timestamp);
    })
    .slice(0, FEED_DISPLAY_LIMIT)
    .map(({ item }) => item);
}

export async function postToFeed(publicClient: PublicClient, walletClient: WalletClient, text: string) {
  const body: SocialPostBody = { type: "post", text };
  return postMessage(publicClient, walletClient, SOCIAL_TOPIC, JSON.stringify(body));
}

/** Reposts always point at the canonical original id, not an intermediate repost's own id —
 * see `canonicalId`'s doc comment. No idempotency guard exists (no contract-level check, unlike
 * Upvote's one-per-address limit) — reposting the same thing twice is an accepted v1 tradeoff. */
export async function repost(publicClient: PublicClient, walletClient: WalletClient, originalMessageId: bigint) {
  const body: SocialPostBody = { type: "repost", originalMessageId: originalMessageId.toString() };
  return postMessage(publicClient, walletClient, SOCIAL_TOPIC, JSON.stringify(body));
}
