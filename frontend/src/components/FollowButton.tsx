import { follow, isFollowing as checkIsFollowing, unfollow } from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

const EXPLORER_TX_URL = "https://robinhoodchain.blockscout.com/tx/";

/**
 * Follow/unfollow `target` — a real signed transaction against Follow.sol either way, same as
 * every other action in this app. `onChange` lets the parent (a profile page showing follower
 * counts) refresh after a successful toggle instead of polling.
 */
export function FollowButton({ target, onChange }: { target: Address; onChange?: () => void }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address, isConnected } = useAccount();

  const isSelf = isConnected && address?.toLowerCase() === target.toLowerCase();

  const [following, setFollowing] = useState<boolean | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicClient || !address) {
      setFollowing(null);
      return;
    }
    try {
      setFollowing(await checkIsFollowing(publicClient, address, target));
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, [publicClient, address, target]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClick() {
    if (!publicClient || !walletClient || pending || following === null || unavailable) return;
    setPending(true);
    setError(null);
    try {
      const hash = following
        ? await unfollow(publicClient, walletClient, target)
        : await follow(publicClient, walletClient, target);
      setTxHash(hash);
      await load();
      onChange?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  if (isSelf) return null;

  return (
    <span className="follow">
      <button
        type="button"
        className={`btn follow-btn${following ? " follow-btn-following" : ""}`}
        onClick={handleClick}
        disabled={!isConnected || pending || following === null || unavailable}
        title={
          unavailable
            ? "Following isn't available yet"
            : !isConnected
              ? "Connect a wallet to follow"
              : following
                ? "Unfollow"
                : "Follow (signs a transaction)"
        }
      >
        {pending ? "…" : following ? "Following" : "Follow"}
      </button>
      {txHash && (
        <a className="upvote-hint upvote-tx" href={`${EXPLORER_TX_URL}${txHash}`} target="_blank" rel="noreferrer">
          view tx ↗
        </a>
      )}
      {error && <span className="upvote-error">{error}</span>}
    </span>
  );
}
