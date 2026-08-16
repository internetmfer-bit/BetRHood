import {
  getConversation,
  getMessagingPublicKey,
  getProfile,
  isFollowing,
  sendDm,
  type DmThreadItem,
} from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useDm } from "../dmContext";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function fingerprint(publicKey: Uint8Array): string {
  return Array.from(publicKey.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: DmThreadItem[] };

export function Conversation() {
  const { address: themParam } = useParams<{ address: string }>();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address: me, isConnected } = useAccount();
  const { keyPair, status: dmStatus, unlock } = useDm();

  const [theirName, setTheirName] = useState<string | null>(null);
  const [mutual, setMutual] = useState<boolean | null>(null);
  const [recipientEnabled, setRecipientEnabled] = useState<boolean | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [names, setNames] = useState<Record<string, string>>({});

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const them = themParam && isAddress(themParam) ? (themParam as Address) : null;

  const load = useCallback(async () => {
    if (!publicClient || !me || !them || !keyPair) return;
    setState({ status: "loading" });
    try {
      const items = await getConversation(publicClient, me, them, keyPair);
      setState({ status: "ready", items });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, [publicClient, me, them, keyPair]);

  useEffect(() => {
    if (!publicClient || !me || !them) return;
    let cancelled = false;
    (async () => {
      try {
        const [profile, iFollowThem, theyFollowMe, theirKey] = await Promise.all([
          getProfile(publicClient, them),
          isFollowing(publicClient, me, them),
          isFollowing(publicClient, them, me),
          getMessagingPublicKey(publicClient, them),
        ]);
        if (cancelled) return;
        if (profile.name) setTheirName(profile.name);
        setMutual(iFollowThem && theyFollowMe);
        setRecipientEnabled(theirKey !== null);
      } catch {
        // Non-fatal — mutual/recipientEnabled just stay null, compose stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, me, them]);

  useEffect(() => {
    if (dmStatus === "unlocked") load();
  }, [dmStatus, load]);

  useEffect(() => {
    if (state.status !== "ready" || !publicClient) return;
    let cancelled = false;
    (async () => {
      const senders = new Set<Address>();
      for (const item of state.items) {
        senders.add(item.from);
      }
      try {
        const entries = await Promise.all(
          [...senders].map(async (a): Promise<[Address, string]> => {
            const p = await getProfile(publicClient, a);
            return [a, p.name];
          }),
        );
        if (!cancelled) setNames(Object.fromEntries(entries.filter(([, n]) => n.length > 0)));
      } catch {
        // Non-fatal — falls back to truncated addresses.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, publicClient]);

  async function handleSend() {
    if (!publicClient || !walletClient || !them || !keyPair || text.trim().length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      await sendDm(publicClient, walletClient, them, text.trim(), keyPair);
      setText("");
      await load();
    } catch (err) {
      setSendError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!them) return <p className="error">Not a valid address.</p>;

  if (!isConnected) {
    return (
      <div className="panel">
        <p className="hint">Connect a wallet to see this conversation.</p>
      </div>
    );
  }

  const canCompose = mutual === true && recipientEnabled === true && dmStatus === "unlocked";

  return (
    <div className="panel">
      <h1>{theirName || truncate(them)}</h1>
      <p className="hint">
        <Link to={`/u/${them}`}>view profile</Link>
        {keyPair && <> · your key: {fingerprint(keyPair.publicKey)}</>}
      </p>

      {dmStatus !== "unlocked" && (
        <div className="dm-unlock">
          {dmStatus === "locked" && (
            <button className="btn btn-primary" onClick={unlock}>
              Enable messaging
            </button>
          )}
          {dmStatus === "unlocking" && <p className="hint">Confirm the signature in your wallet…</p>}
          {dmStatus === "unsupported" && (
            <p className="error">Encrypted messaging isn't supported for smart contract wallets yet.</p>
          )}
        </div>
      )}

      {dmStatus === "unlocked" && (
        <>
          {state.status === "loading" && <p className="hint">Loading…</p>}
          {state.status === "error" && (
            <p className="error">
              Couldn't load this conversation: {state.message}{" "}
              <button className="btn-copy" onClick={load}>
                retry
              </button>
            </p>
          )}
          {state.status === "ready" && state.items.length === 0 && (
            <p className="hint">No messages yet — say hi.</p>
          )}
          {state.status === "ready" && state.items.length > 0 && (
            <div className="thread-list">
              {state.items.map((item) => (
                <div className="post" key={item.id.toString()}>
                  <div className="post-meta">
                    <span>{names[item.from] || truncate(item.from)}</span>
                    <span> · {new Date(Number(item.timestamp) * 1000).toLocaleString()}</span>
                  </div>
                  <div className="post-body">
                    {item.status === "ok" ? item.text : <em>[unable to decrypt]</em>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {mutual === false && <p className="hint">You can only message people who follow you back.</p>}
          {mutual === true && recipientEnabled === false && (
            <p className="hint">{theirName || truncate(them)} hasn't enabled encrypted messaging yet.</p>
          )}

          {canCompose && (
            <div className="reply-box">
              <textarea
                className="field field-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message"
                rows={3}
              />
              <button className="btn btn-primary" onClick={handleSend} disabled={sending || text.trim().length === 0}>
                {sending ? "Sending…" : "Send"}
              </button>
              {sendError && <p className="error">{sendError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
