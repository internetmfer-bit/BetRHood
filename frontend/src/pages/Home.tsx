import { getMessage, getMessageCount, type Message } from "@betrhood/sdk";
import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";

type Tab = "trending" | "popular" | "recent";

const RECENT_LIMIT = 15;

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function bodyPreview(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
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

export function Home() {
  const [tab, setTab] = useState<Tab>("recent");
  const publicClient = usePublicClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            setLoading(false);
          }
          return;
        }

        const start = Math.max(0, total - RECENT_LIMIT);
        const ids = Array.from({ length: total - start }, (_, i) => BigInt(total - 1 - i));
        const results = await Promise.all(ids.map((id) => getMessage(publicClient, id)));
        if (!cancelled) {
          setMessages(results);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  return (
    <div className="panel">
      <div className="tabs">
        <button className="tab tab-disabled" disabled title="Needs an upvote contract — not live yet">
          Trending
        </button>
        <button className="tab tab-disabled" disabled title="Needs an upvote contract — not live yet">
          Popular
        </button>
        <button className={tab === "recent" ? "tab tab-active" : "tab"} onClick={() => setTab("recent")}>
          Recent
        </button>
      </div>

      {loading && <p className="hint">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && messages.length === 0 && <p className="hint">Nothing posted yet.</p>}

      <div className="thread-list">
        {messages.map((m, i) => (
          <div className="thread" key={i}>
            <div className="thread-topic">{hexTopicToText(m.topic)}</div>
            <div className="thread-body">{bodyPreview(m.body)}</div>
            <div className="thread-meta">
              {truncate(m.sender)} · {new Date(Number(m.timestamp) * 1000).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
