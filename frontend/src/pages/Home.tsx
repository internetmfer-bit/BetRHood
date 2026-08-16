import { getMessage, getMessageCount, getProfile, getProfilePicture, type Message } from "@betrhood/sdk";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type Address } from "viem";
import { usePublicClient } from "wagmi";

const RECENT_LIMIT = 12;
const ACTIVE_PROFILES_LIMIT = 6;

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function bodyPreview(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.length > 100 ? `${text.slice(0, 100)}…` : text;
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

export function Home() {
  const publicClient = usePublicClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<ActiveProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pictureUrls = useRef<string[]>([]);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const total = Number(await getMessageCount(publicClient));
        if (total === 0) {
          if (!cancelled) {
            setMessages([]);
            setProfiles([]);
            setLoading(false);
          }
          return;
        }

        const start = Math.max(0, total - RECENT_LIMIT);
        const ids = Array.from({ length: total - start }, (_, i) => BigInt(total - 1 - i));
        const results = await Promise.all(ids.map((id) => getMessage(publicClient, id)));
        if (cancelled) return;
        setMessages(results);
        setLoading(false);

        // "Recently active" — real senders from real recent activity, not a fake list.
        const uniqueSenders = [...new Set(results.map((m) => m.sender))].slice(0, ACTIVE_PROFILES_LIMIT);
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

  return (
    <div className="main-wide">
      <div className="hero">
        <h1 className="hero-word">
          BET<span>RH</span>OOD
        </h1>
        <p className="hero-tagline">
          Upload a file, get a permanent link. Post a message, get it back by topic. No accounts —
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
            <p className="app-card-desc">Set a display name and picture for your address.</p>
          </Link>
          <a href="https://github.com/internetmfer-bit/BetRHood" className="app-card" target="_blank" rel="noreferrer">
            <p className="app-card-title">SDK &amp; Docs</p>
            <p className="app-card-desc">Build your own integration on the same contracts.</p>
          </a>
        </div>
      </div>

      {profiles.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Recently Active</h2>
          </div>
          <div className="profile-row">
            {profiles.map((p) => (
              <div className="profile-card" key={p.address}>
                {p.pictureUrl ? (
                  <img src={p.pictureUrl} alt="" className="profile-avatar" />
                ) : (
                  <span className="profile-avatar profile-avatar-empty" />
                )}
                <div className="profile-name">{p.name || truncate(p.address)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Recent Activity</h2>
          <span className="section-note">Trending / Popular sorting coming soon</span>
        </div>

        {loading && <p className="hint">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && messages.length === 0 && <p className="hint">Nothing posted yet — be the first.</p>}

        <div className="thread-list">
          {messages.map((m, i) => (
            <div className="thread" key={i}>
              <div className="thread-topic">{hexTopicToText(m.topic)}</div>
              <div className="thread-meta">{new Date(Number(m.timestamp) * 1000).toLocaleDateString()}</div>
              <div className="thread-body">
                {truncate(m.sender)} — {bodyPreview(m.body)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
