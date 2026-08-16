import { getProfile } from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { PostCard } from "../components/PostCard";
import { getFollowingFeed, postToFeed, type FeedItem } from "../social";

export function Feed() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address, isConnected } = useAccount();

  const [items, setItems] = useState<FeedItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!publicClient || !address) return;
    setLoading(true);
    setError(null);
    try {
      const feed = await getFollowingFeed(publicClient, address);
      setItems(feed);

      // Non-fatal — a failure here just means posts fall back to truncated addresses.
      try {
        const senders = new Set<Address>();
        for (const item of feed) {
          senders.add(item.post.sender);
          if (item.original) senders.add(item.original.sender);
        }
        const entries = await Promise.all(
          [...senders].map(async (sender): Promise<[Address, string]> => {
            const profile = await getProfile(publicClient, sender);
            return [sender, profile.name];
          }),
        );
        setNames(Object.fromEntries(entries.filter(([, name]) => name.length > 0)));
      } catch {
        // ignore
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost() {
    if (!publicClient || !walletClient || postText.trim().length === 0) return;
    setPosting(true);
    setError(null);
    try {
      await postToFeed(publicClient, walletClient, postText.trim());
      setPostText("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="panel">
        <h1>Onchain Social</h1>
        <p className="hint">Connect a wallet to see your following feed.</p>
      </div>
    );
  }

  return (
    <div className="main-wide">
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Onchain Social</h2>
          <span className="section-note">posts from people you follow</span>
        </div>

        <div className="reply-box">
          <textarea
            className="field field-textarea"
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="Share something"
            rows={3}
          />
          <button className="btn btn-primary" onClick={handlePost} disabled={posting || postText.trim().length === 0}>
            {posting ? "Posting…" : "Post"}
          </button>
        </div>

        {loading && <p className="hint">Loading…</p>}
        {!loading && error && (
          <p className="error">
            Couldn't load your feed: {error}{" "}
            <button className="btn-copy" onClick={load}>
              retry
            </button>
          </p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="hint">Nothing here yet — follow people to see their posts, or post something yourself.</p>
        )}

        {items.length > 0 && (
          <div className="post-card-list">
            {items.map((item) => (
              <PostCard key={item.post.id.toString()} item={item} names={names} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
