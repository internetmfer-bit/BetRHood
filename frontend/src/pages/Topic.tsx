import { getMessagesByTopic, postMessage, type Message } from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function bodyText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return `${bytes.length} bytes (binary)`;
  }
}

export function Topic() {
  const { topic } = useParams<{ topic: string }>();
  const { isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!publicClient || !topic) return;
    setLoading(true);
    setError(null);
    try {
      const results = await getMessagesByTopic(publicClient, topic);
      setMessages(results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [publicClient, topic]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost() {
    if (!publicClient || !walletClient || !topic || reply.trim().length === 0) return;
    setPosting(true);
    setError(null);
    try {
      await postMessage(publicClient, walletClient, topic, reply);
      setReply("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  if (!topic) return null;

  return (
    <div className="panel">
      <h1>{topic}</h1>

      {loading && <p className="hint">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && messages.length === 0 && <p className="hint">Nothing here yet — be the first to post.</p>}

      <div className="thread-list">
        {messages.map((m, i) => (
          <div className="post" key={i}>
            <div className="post-meta">
              <Link to={`/u/${m.sender}`}>{truncate(m.sender)}</Link>
              <span> · {new Date(Number(m.timestamp) * 1000).toLocaleString()}</span>
            </div>
            <div className="post-body">{bodyText(m.body)}</div>
          </div>
        ))}
      </div>

      {isConnected ? (
        <div className="reply-box">
          <textarea
            className="field field-textarea"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={`Post in ${topic}`}
            rows={3}
          />
          <button className="btn btn-primary" onClick={handlePost} disabled={posting || reply.trim().length === 0}>
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      ) : (
        <p className="hint">Connect a wallet to post.</p>
      )}
    </div>
  );
}
