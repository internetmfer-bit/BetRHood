import { robinhoodChain } from "@betrhood/sdk";
import { useAccount, useSwitchChain } from "wagmi";

/**
 * Every write on this site (upload, post, upvote, profile save) reads via a client bound to
 * Robinhood Chain but signs through whatever chain the wallet is actually active on. If those
 * don't match, some wallets reject the write with no visible prompt at all — this banner is the
 * only thing standing between that silent failure and a clear fix.
 */
export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === robinhoodChain.id) return null;

  return (
    <div className="network-banner">
      <span>
        Your wallet is connected to the wrong network — switch to <strong>Robinhood Chain</strong>{" "}
        to read and write here.
      </span>
      <button
        className="btn btn-primary"
        onClick={() => switchChain({ chainId: robinhoodChain.id })}
        disabled={isPending}
      >
        {isPending ? "Switching…" : "Switch Network"}
      </button>
    </div>
  );
}
