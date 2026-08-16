import { getUpvoteCount, hasVoted, upvote } from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

const EXPLORER_TX_URL = "https://robinhoodchain.blockscout.com/tx/";

/**
 * One upvote per connected address per message — a real signed transaction against Upvote.sol,
 * not a locally-faked counter. Count and vote status are always read live from the chain, and a
 * successful vote links straight to its transaction on Blockscout so it's independently
 * verifiable, not just a claim this UI makes.
 */
export function UpvoteButton({ messageId }: { messageId: bigint }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address, isConnected } = useAccount();

  const [count, setCount] = useState<number | null>(null);
  const [voted, setVoted] = useState(false);
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicClient) return;
    const [c, v] = await Promise.all([
      getUpvoteCount(publicClient, messageId),
      address ? hasVoted(publicClient, messageId, address) : Promise.resolve(false),
    ]);
    setCount(Number(c));
    setVoted(v);
  }, [publicClient, messageId, address]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClick() {
    if (!publicClient || !walletClient || voted || pending) return;
    setPending(true);
    setError(null);
    try {
      const hash = await upvote(publicClient, walletClient, messageId);
      setTxHash(hash);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="upvote">
      <button
        type="button"
        className={`upvote-btn${voted ? " upvote-btn-voted" : ""}${!isConnected ? " upvote-btn-disconnected" : ""}`}
        onClick={handleClick}
        disabled={!isConnected || voted || pending}
        title={!isConnected ? "Connect a wallet to upvote" : voted ? "You already upvoted this" : "Upvote (signs a transaction)"}
      >
        <span className="upvote-arrow">▲</span>
        <span className="upvote-count">{count === null ? "…" : count}</span>
      </button>
      {pending && <span className="upvote-hint">confirming…</span>}
      {txHash && (
        <a className="upvote-hint upvote-tx" href={`${EXPLORER_TX_URL}${txHash}`} target="_blank" rel="noreferrer">
          view tx ↗
        </a>
      )}
      {error && <span className="upvote-error">{error}</span>}
    </span>
  );
}
