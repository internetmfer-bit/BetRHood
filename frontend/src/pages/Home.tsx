import {
  getMessage,
  getMessageCount,
  getMessagesByTopic,
  getProfile,
  getProfilePicture,
  getUpvoteCount,
  postMessage,
  resolve,
  type Message,
} from "@betrhood/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { UpvoteButton } from "../components/UpvoteButton";
import { isImageKey, mimeForExtension, extensionOf } from "../fileType";
import { isCommentTopic } from "../social";
import { isReservedTopic, SHOWCASE_TOPIC } from "../topics";

const RECENT_LIMIT = 30;
const ACTIVE_PROFILES_LIMIT = 6;
const SHOWCASE_LIMIT = 16;

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function bodyPreview(bytes: Uint8Array, max = 100): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return `${bytes.length} bytes (binary)`;
  }
}

function hexTopicToText(hex: string): string {
  const pairs = hex.slice(2).match(/.{1,2}/g) ?? [];
  const chars = pairs.map((b) => Number.parseInt(b, 16)).filter((n) => n !== 0);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(chars)) || hex;
  } catch {
    return hex;
  }
}

interface ActiveProfile {
  address: Address;
  name: string;
  pictureUrl: string | null;
}

interface TopicGroup {
  topic: string;
  count: number;
  latest: Message;
}

interface ShowcaseItem {
  id: bigint;
  sender: Address;
  key: string;
  caption: string;
  timestamp: bigint;
}

function parseShowcaseBody(bytes: Uint8Array): { key: string; caption: string } | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed.key === "string") return { key: parsed.key, caption: String(parsed.caption ?? "") };
    return null;
  } catch {
    return null;
  }
}

export function Home() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { isConnected } = useAccount();
  const navigate = useNavigate();

  const [topics, setTopics] = useState<TopicGroup[]>([]);
  const [profiles, setProfiles] = useState<ActiveProfile[]>([]);
  const [showcase, setShowcase] = useState<ShowcaseItem[]>([]);
  const [showcaseSenderNames, setShowcaseSenderNames] = useState<Record<string, string>>({});
  const [showcaseThumbs, setShowcaseThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pictureUrls = useRef<string[]>([]);
  const showcaseThumbUrls = useRef<string[]>([]);

  const [newTopic, setNewTopic] = useState("");
  const [newBody, setNewBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const total = Number(await getMessageCount(publicClient));
        const recentMessages: Message[] = [];
        if (total > 0) {
          const start = Math.max(0, total - RECENT_LIMIT);
          const ids = Array.from({ length: total - start }, (_, i) => BigInt(total - 1 - i));
          recentMessages.push(...(await Promise.all(ids.map((id) => getMessage(publicClient, id)))));
        }
        if (cancelled) return;

        // Group into topics — a real forum board list, derived from real recent activity.
        // Reserved topics (uploads, showcase) are internal bookkeeping, not public discussion —
        // excluded here so they never show up as a browsable/postable "topic".
        const groups = new Map<string, TopicGroup>();
        for (const m of recentMessages) {
          if (isReservedTopic(m.topic) || isCommentTopic(m.topic)) continue;
          const key = m.topic;
          const existing = groups.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            groups.set(key, { topic: key, count: 1, latest: m });
          }
        }
        setTopics([...groups.values()]);

        const uniqueSenders = [...new Set(recentMessages.map((m) => m.sender))].slice(0, ACTIVE_PROFILES_LIMIT);
        const profileResults = await Promise.all(
          uniqueSenders.map(async (address): Promise<ActiveProfile> => {
            const profile = await getProfile(publicClient, address);
            let pictureUrl: string | null = null;
            if (profile.hasPicture) {
              const bytes = await getProfilePicture(publicClient, address);
              if (bytes) {
                pictureUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
                pictureUrls.current.push(pictureUrl);
              }
            }
            return { address, name: profile.name, pictureUrl };
          }),
        );
        if (!cancelled) setProfiles(profileResults);

        const showcaseMessages = await getMessagesByTopic(publicClient, SHOWCASE_TOPIC);
        const rawItems = showcaseMessages
          .slice(-SHOWCASE_LIMIT)
          .reverse()
          .map((m): ShowcaseItem | null => {
            const parsed = parseShowcaseBody(m.body);
            return parsed
              ? { id: m.id, sender: m.sender, key: parsed.key, caption: parsed.caption, timestamp: m.timestamp }
              : null;
          })
          .filter((x): x is ShowcaseItem => x !== null);

        // Sort by upvotes (most-voted first), ties broken by most recent — the reason this
        // section fetches counts upfront instead of leaving it to each item's own UpvoteButton.
        const voteCounts = await Promise.all(rawItems.map((item) => getUpvoteCount(publicClient, item.id)));
        const items = rawItems
          .map((item, i) => ({ item, votes: voteCounts[i] }))
          .sort((a, b) => {
            if (a.votes !== b.votes) return a.votes > b.votes ? -1 : 1;
            return Number(b.item.timestamp - a.item.timestamp);
          })
          .map(({ item }) => item);
        if (!cancelled) setShowcase(items);

        // Non-fatal — a failure here just means showcase bubbles fall back to addresses.
        try {
          const uniqueShowcaseSenders = [...new Set(items.map((item) => item.sender))];
          const nameEntries = await Promise.all(
            uniqueShowcaseSenders.map(async (sender): Promise<[Address, string]> => {
              const profile = await getProfile(publicClient, sender);
              return [sender, profile.name];
            }),
          );
          if (!cancelled) {
            setShowcaseSenderNames(Object.fromEntries(nameEntries.filter(([, name]) => name.length > 0)));
          }
        } catch {
          // ignore
        }

        // Non-fatal, per-item — a thumbnail failing just means that one bubble shows no image
        // instead of breaking the whole section. Only fetched for keys that look like images.
        try {
          const imageItems = items.filter((item) => isImageKey(item.key));
          const thumbEntries = await Promise.all(
            imageItems.map(async (item): Promise<[string, string] | null> => {
              try {
                const bytes = await resolve(publicClient, item.sender, item.key);
                if (bytes.length === 0) return null;
                const url = URL.createObjectURL(
                  new Blob([new Uint8Array(bytes)], { type: mimeForExtension(extensionOf(item.key)) }),
                );
                showcaseThumbUrls.current.push(url);
                return [item.id.toString(), url];
              } catch {
                return null;
              }
            }),
          );
          if (!cancelled) {
            setShowcaseThumbs(
              Object.fromEntries(thumbEntries.filter((e): e is [string, string] => e !== null)),
            );
          }
        } catch {
          // ignore
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const url of pictureUrls.current) URL.revokeObjectURL(url);
      pictureUrls.current = [];
      for (const url of showcaseThumbUrls.current) URL.revokeObjectURL(url);
      showcaseThumbUrls.current = [];
    };
  }, [publicClient]);

  const handleStartTopic = useCallback(async () => {
    if (!publicClient || !walletClient || !newTopic.trim() || !newBody.trim()) return;
    setPosting(true);
    setError(null);
    try {
      await postMessage(publicClient, walletClient, newTopic.trim(), newBody.trim());
      navigate(`/topic/${encodeURIComponent(newTopic.trim())}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }, [publicClient, walletClient, newTopic, newBody, navigate]);

  return (
    <div className="main-wide">
      <div className="hero">
        <h1 className="hero-word">
          BET<span>RH</span>OOD
        </h1>
        <p className="hero-tagline">
          A decentralized data storage protocol at its core — including personalized profiles,
          in-network social feeds, follower graphs, onchain upvoting, global forums, end-to-end
          encrypted private messaging, and permissionless builder tools and showcasing for your
          work — all built on top. No accounts — your wallet is the account, the chain is the
          only server there is, and everything on it lives forever. A fully decentralized
          protocol which anyone can host a window into. Built on Robinhood Chain, inspired by{" "}
          <a href="https://www.netprotocol.app/" target="_blank" rel="noreferrer">
            Net Protocol
          </a>
          , built as its own thing. Agentic users, see <Link to="/agents">Agents</Link>.
        </p>
        <Link to="/upload" className="btn btn-primary">
          Get Started
        </Link>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Build on BetRHood</h2>
        </div>
        <div className="apps-grid">
          <Link to="/profile" className="app-card">
            <p className="app-card-title">Profile</p>
            <p className="app-card-desc">Set a display name, bio, and picture for your address.</p>
          </Link>
          <Link to="/upload" className="app-card">
            <p className="app-card-title">Upload</p>
            <p className="app-card-desc">Store a file onchain, get a permanent link back.</p>
          </Link>
          <a href="https://github.com/internetmfer-bit/BetRHood" className="app-card" target="_blank" rel="noreferrer">
            <p className="app-card-title">SDK &amp; Docs</p>
            <p className="app-card-desc">Build your own integration on the same contracts.</p>
          </a>
          <Link to="/agents" className="app-card">
            <p className="app-card-title">Agents</p>
            <p className="app-card-desc">Contract addresses, RPC, and code — everything an AI agent needs, no browser required.</p>
          </Link>
        </div>
      </div>

      {profiles.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Recently Active</h2>
          </div>
          <div className="profile-row">
            {profiles.map((p) => (
              <Link to={`/u/${p.address}`} className="profile-card" key={p.address}>
                {p.pictureUrl ? (
                  <img src={p.pictureUrl} alt="" className="profile-avatar" />
                ) : (
                  <span className="profile-avatar profile-avatar-empty" />
                )}
                <div className="profile-name">{p.name || truncate(p.address)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Showcase</h2>
        </div>
        {showcase.length === 0 ? (
          <p className="hint">Nothing shared yet — upload something and share it.</p>
        ) : (
          <div className="showcase-grid">
            {showcase.map((item) => {
              const thumb = showcaseThumbs[item.id.toString()];
              const senderLabel = showcaseSenderNames[item.sender] || truncate(item.sender);
              return (
                <div className="showcase-bubble" key={item.id.toString()}>
                  <Link
                    to={`/view/${item.sender}/${encodeURIComponent(item.key)}`}
                    className="showcase-bubble-link"
                    title={`${item.key}${item.caption ? ` — ${item.caption}` : ""} — by ${senderLabel}`}
                  >
                    <span className="showcase-bubble-thumb">
                      {thumb ? (
                        <img src={thumb} alt="" />
                      ) : (
                        <span className="showcase-bubble-thumb-fallback">{extensionOf(item.key) || "file"}</span>
                      )}
                    </span>
                    <span className="showcase-bubble-key">{item.key}</span>
                  </Link>
                  <UpvoteButton messageId={item.id} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Forum</h2>
        </div>

        {loading && <p className="hint">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && topics.length === 0 && <p className="hint">No topics yet — start one below.</p>}

        <div className="thread-list">
          {topics.map((t) => (
            <Link to={`/topic/${encodeURIComponent(hexTopicToText(t.topic))}`} className="thread" key={t.topic}>
              <div className="thread-topic">{hexTopicToText(t.topic)}</div>
              <div className="thread-meta">
                {t.count} recent · {new Date(Number(t.latest.timestamp) * 1000).toLocaleDateString()}
              </div>
              <div className="thread-body">{bodyPreview(t.latest.body)}</div>
            </Link>
          ))}
        </div>

        {isConnected ? (
          <div className="reply-box">
            <input
              className="field"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="New topic name"
              maxLength={32}
            />
            <textarea
              className="field field-textarea"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="First post"
              rows={3}
            />
            <button
              className="btn btn-primary"
              onClick={handleStartTopic}
              disabled={posting || !newTopic.trim() || !newBody.trim()}
            >
              {posting ? "Posting…" : "Start Topic"}
            </button>
          </div>
        ) : (
          <p className="hint">Connect a wallet to start a topic.</p>
        )}
      </div>
    </div>
  );
}
