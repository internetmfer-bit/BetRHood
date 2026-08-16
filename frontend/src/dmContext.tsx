import { deriveMessagingKeyPair, type MessagingKeyPair } from "@betrhood/sdk";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

type Status = "locked" | "unlocking" | "unlocked" | "unsupported" | "error";

interface DmContextValue {
  keyPair: MessagingKeyPair | null;
  status: Status;
  error: string | null;
  unlock: () => Promise<void>;
}

const DmContext = createContext<DmContextValue | null>(null);

/**
 * Holds the session's derived DM encryption keypair — memory only, never localStorage,
 * sessionStorage, or IndexedDB. Re-derived fresh via one wallet signature per session through
 * an explicit unlock() call, never auto-triggered. Resets on wallet disconnect or account
 * change so switching accounts can never leak the previous account's key into a new session.
 */
export function DmProvider({ children }: { children: ReactNode }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const [keyPair, setKeyPair] = useState<MessagingKeyPair | null>(null);
  const [status, setStatus] = useState<Status>("locked");
  const [error, setError] = useState<string | null>(null);
  const unlockedForAddress = useRef<string | null>(null);

  // A different account connecting must never see the previous account's derived key.
  useEffect(() => {
    if (address?.toLowerCase() !== unlockedForAddress.current) {
      setKeyPair(null);
      setStatus("locked");
      setError(null);
      unlockedForAddress.current = null;
    }
  }, [address]);

  const unlock = useCallback(async () => {
    if (!publicClient || !walletClient || !address || status === "unlocking") return;
    setStatus("unlocking");
    setError(null);
    try {
      // Smart-contract wallets (Safe, embedded/AA wallets) don't satisfy the deterministic-
      // signature assumption this whole scheme relies on — detect and refuse cleanly rather
      // than deriving an inconsistent, unusable key.
      const bytecode = await publicClient.getBytecode({ address });
      if (bytecode && bytecode !== "0x") {
        setStatus("unsupported");
        return;
      }

      const derived = await deriveMessagingKeyPair(walletClient);
      setKeyPair(derived);
      unlockedForAddress.current = address.toLowerCase();
      setStatus("unlocked");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }, [publicClient, walletClient, address, status]);

  return <DmContext.Provider value={{ keyPair, status, error, unlock }}>{children}</DmContext.Provider>;
}

export function useDm(): DmContextValue {
  const ctx = useContext(DmContext);
  if (!ctx) throw new Error("useDm() must be called inside a <DmProvider>.");
  return ctx;
}
