import { getProfile } from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { PostCard } from "../components/PostCard";
import { getFollowingFeed, type FeedItem } from "../social";

export function Feed() {
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();

  const [items, setItems] = useState<FeedItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <p className="hint">
            Nothing here yet — follow people to see their posts, or{" "}
            <Link to="/profile">post something yourself</Link>.
          </p>
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
