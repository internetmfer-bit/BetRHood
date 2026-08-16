import { getMessagesByTopic, getTopicMessageCount, postMessage, type Message } from "@betrhood/sdk";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { canonicalId, commentTopic, parseSocialBody, repost as repostToChain, type FeedItem } from "../social";
import { UpvoteButton } from "./UpvoteButton";

const EXPLORER_TX_URL = "https://robinhoodchain.blockscout.com/tx/";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function nameFor(names: Record<string, string>, address: Address): string {
  return names[address] || truncate(address);
}

function timeLabel(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function bodyText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return `${bytes.length} bytes (binary)`;
  }
}

/** One feed post — a plain post or a repost wrapper — with like/comment/repost actions. Likes
 * and comments always key off the canonical original id (see `canonicalId` in social.ts), so a
 * repost never fragments engagement away from the post it's reposting. */
export function PostCard({ item, names }: { item: FeedItem; names: Record<string, string> }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { isConnected } = useAccount();

  const id = canonicalId(item);
  const displayed = item.original ?? item.post;
  // A repost's original is itself a `social`-topic message, so its body is JSON too — parse it
  // the same way as the top-level post rather than decoding the raw bytes as plain text.
  const originalBody = item.original ? parseSocialBody(item.original.body) : null;
  const displayedText = item.original
    ? originalBody?.type === "post"
      ? originalBody.text
      : "(original post unavailable)"
    : item.body.type === "post"
      ? item.body.text
      : "";

  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Message[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [reposting, setReposting] = useState(false);
  const [repostTx, setRepostTx] = useState<string | null>(null);
  const [repostError, setRepostError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    getTopicMessageCount(publicClient, commentTopic(id))
      .then((c) => {
        if (!cancelled) setCommentCount(Number(c));
      })
      .catch(() => {
        // Non-fatal — the comment toggle just shows without a count.
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient, id]);

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && comments === null && publicClient) {
      setCommentsLoading(true);
      try {
        setComments(await getMessagesByTopic(publicClient, commentTopic(id)));
      } catch {
        setComments([]);
      } finally {
        setCommentsLoading(false);
      }
    }
  }

  async function handleComment() {
    if (!publicClient || !walletClient || commentText.trim().length === 0) return;
    setCommenting(true);
    setCommentError(null);
    try {
      await postMessage(publicClient, walletClient, commentTopic(id), commentText.trim());
      setCommentText("");
      const results = await getMessagesByTopic(publicClient, commentTopic(id));
      setComments(results);
      setCommentCount(results.length);
    } catch (err) {
      setCommentError((err as Error).message);
    } finally {
      setCommenting(false);
    }
  }

  async function handleRepost() {
    if (!publicClient || !walletClient || reposting) return;
    setReposting(true);
    setRepostError(null);
    try {
      const { txHash } = await repostToChain(publicClient, walletClient, id);
      setRepostTx(txHash);
    } catch (err) {
      setRepostError((err as Error).message);
    } finally {
      setReposting(false);
    }
  }

  return (
    <div className="post-card">
      {item.original && (
        <div className="repost-banner">
          ↻ Reposted by <Link to={`/u/${item.post.sender}`}>{nameFor(names, item.post.sender)}</Link>
        </div>
      )}
      <div className="post-meta">
        <Link to={`/u/${displayed.sender}`}>{nameFor(names, displayed.sender)}</Link>
        <span> · {timeLabel(displayed.timestamp)}</span>
      </div>
      <div className="post-body">{displayedText}</div>
      <div className="post-footer post-card-actions">
        <UpvoteButton messageId={id} />
        <button type="button" className="btn-copy" onClick={toggleExpanded}>
          {expanded ? "Hide comments" : `Comments${commentCount !== null ? ` (${commentCount})` : ""}`}
        </button>
        <button type="button" className="btn-copy" onClick={handleRepost} disabled={!isConnected || reposting}>
          {reposting ? "Reposting…" : "Repost"}
        </button>
      </div>
      {repostTx && (
        <a className="upvote-hint upvote-tx" href={`${EXPLORER_TX_URL}${repostTx}`} target="_blank" rel="noreferrer">
          reposted — view tx ↗
        </a>
      )}
      {repostError && <p className="error">{repostError}</p>}

      {expanded && (
        <div className="comment-thread">
          {commentsLoading && <p className="hint">Loading comments…</p>}
          {!commentsLoading && comments?.length === 0 && <p className="hint">No comments yet.</p>}
          {comments?.map((c) => (
            <div className="comment" key={c.id.toString()}>
              <div className="post-meta">
                <Link to={`/u/${c.sender}`}>{nameFor(names, c.sender)}</Link>
                <span> · {timeLabel(c.timestamp)}</span>
              </div>
              <div className="post-body">{bodyText(c.body)}</div>
            </div>
          ))}
          {isConnected ? (
            <div className="reply-box">
              <textarea
                className="field field-textarea"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment"
                rows={2}
              />
              <button
                className="btn"
                onClick={handleComment}
                disabled={commenting || commentText.trim().length === 0}
              >
                {commenting ? "Posting…" : "Comment"}
              </button>
              {commentError && <p className="error">{commentError}</p>}
            </div>
          ) : (
            <p className="hint">Connect a wallet to comment.</p>
          )}
        </div>
      )}
    </div>
  );
}
