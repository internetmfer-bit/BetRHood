import { getFollowers, getFollowing, getProfile } from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useDm } from "../dmContext";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function Messages() {
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();
  const { keyPair, status, error, published, unlock } = useDm();

  const [candidates, setCandidates] = useState<Address[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicClient || !address) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [following, followers] = await Promise.all([
        getFollowing(publicClient, address),
        getFollowers(publicClient, address),
      ]);
      const followerSet = new Set(followers.map((a) => a.toLowerCase()));
      const mutual = following.filter((a) => followerSet.has(a.toLowerCase()));
      setCandidates(mutual);

      try {
        const entries = await Promise.all(
          mutual.map(async (a): Promise<[Address, string]> => {
            const profile = await getProfile(publicClient, a);
            return [a, profile.name];
          }),
        );
        setNames(Object.fromEntries(entries.filter(([, n]) => n.length > 0)));
      } catch {
        // Non-fatal — falls back to truncated addresses.
      }
    } catch (err) {
      setLoadError((err as Error).message);
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
        <h1>Messages</h1>
        <p className="hint">Connect a wallet to see your messages.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>Messages</h1>
      <p className="hint">
        End-to-end encrypted — only you and the other person can read these. You can only message
        people who follow you back.
      </p>

      {status !== "unlocked" && (
        <div className="dm-unlock">
          {status === "locked" && (
            <>
              <button className="btn btn-primary" onClick={unlock}>
                {published ? "Unlock messages" : "Enable messaging"}
              </button>
              <p className="hint">
                {published
                  ? "You've already enabled messaging on this address — this just re-signs to unlock your key for this session, no cost."
                  : "One-time setup: a free signature, then a small one-time transaction to publish your public key so others can message you."}
              </p>
            </>
          )}
          {status === "unlocking" && <p className="hint">Confirm the signature in your wallet…</p>}
          {status === "unsupported" && (
            <p className="error">
              Encrypted messaging isn't supported for smart contract wallets yet — it needs a
              signature your wallet can reproduce deterministically, which contract wallets don't
              guarantee.
            </p>
          )}
          {status === "error" && (
            <p className="error">
              Couldn't enable messaging: {error}{" "}
              <button className="btn-copy" onClick={unlock}>
                retry
              </button>
            </p>
          )}
        </div>
      )}

      {status === "unlocked" && keyPair && (
        <>
          {loading && <p className="hint">Loading…</p>}
          {!loading && loadError && (
            <p className="error">
              Couldn't load your conversations: {loadError}{" "}
              <button className="btn-copy" onClick={load}>
                retry
              </button>
            </p>
          )}
          {!loading && !loadError && candidates.length === 0 && (
            <p className="hint">
              Nobody to message yet — you can only message people who follow you back. Follow
              someone and have them follow you to start a conversation.
            </p>
          )}
          {candidates.length > 0 && (
            <div className="thread-list">
              {candidates.map((a) => (
                <Link to={`/messages/${a}`} className="dm-candidate" key={a}>
                  {names[a] || truncate(a)}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
