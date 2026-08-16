import { getMessage, getMessageCount, getMessagesByTopic, getProfile, getProfilePicture, postMessage, type Message } from "@betrhood/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { UpvoteButton } from "../components/UpvoteButton";

const RECENT_LIMIT = 30;
const ACTIVE_PROFILES_LIMIT = 6;
const SHOWCASE_TOPIC = "showcase";
const SHOWCASE_LIMIT = 6;

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pictureUrls = useRef<string[]>([]);

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
        const groups = new Map<string, TopicGroup>();
        for (const m of recentMessages) {
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
        const items = showcaseMessages
          .slice(-SHOWCASE_LIMIT)
          .reverse()
          .map((m): ShowcaseItem | null => {
            const parsed = parseShowcaseBody(m.body);
            return parsed
              ? { id: m.id, sender: m.sender, key: parsed.key, caption: parsed.caption, timestamp: m.timestamp }
              : null;
          })
          .filter((x): x is ShowcaseItem => x !== null);
        if (!cancelled) setShowcase(items);

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
          Upload a file, get a permanent link. Post to a topic, get an onchain forum. No accounts —
          your wallet is the account, the chain is the only server there is.
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
          <Link to="/upload" className="app-card">
            <p className="app-card-title">Upload</p>
            <p className="app-card-desc">Store a file onchain, get a permanent link back.</p>
          </Link>
          <Link to="/profile" className="app-card">
            <p className="app-card-title">Profile</p>
            <p className="app-card-desc">Set a display name, bio, and picture for your address.</p>
          </Link>
          <a href="https://github.com/internetmfer-bit/BetRHood" className="app-card" target="_blank" rel="noreferrer">
            <p className="app-card-title">SDK &amp; Docs</p>
            <p className="app-card-desc">Build your own integration on the same contracts.</p>
          </a>
          <Link to="/agents" className="app-card">
            <p className="app-card-title">For Agents</p>
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
          <span className="section-note">things people have made</span>
        </div>
        {showcase.length === 0 ? (
          <p className="hint">Nothing shared yet — upload something and share it.</p>
        ) : (
          <div className="apps-grid">
            {showcase.map((item) => (
              <div className="app-card" key={item.id.toString()}>
                <Link to={`/view/${item.sender}/${encodeURIComponent(item.key)}`} className="app-card-link">
                  <p className="app-card-title">{item.key}</p>
                  <p className="app-card-desc">{item.caption || "—"}</p>
                  <p className="section-note">by {truncate(item.sender)}</p>
                </Link>
                <div className="app-card-footer">
                  <UpvoteButton messageId={item.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Forum</h2>
          <span className="section-note">Trending / Popular sorting coming soon</span>
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
