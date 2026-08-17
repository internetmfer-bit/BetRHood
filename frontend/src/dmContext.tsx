import {
  deriveMessagingKeyPair,
  getMessagingPublicKey,
  publishMessagingPublicKey,
  type MessagingKeyPair,
} from "@betrhood/sdk";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

type Status = "locked" | "unlocking" | "unlocked" | "unsupported" | "error";

interface DmContextValue {
  keyPair: MessagingKeyPair | null;
  status: Status;
  error: string | null;
  /** Whether this address has ever published a messaging public key on chain — known before
   * unlock() is ever called, via a plain read, so the UI can tell the user upfront whether
   * clicking "enable" costs gas (first time) or is just a free signature (every time after). */
  published: boolean | null;
  unlock: () => Promise<void>;
}

const DmContext = createContext<DmContextValue | null>(null);

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Holds the session's derived DM encryption keypair — memory only, never localStorage,
 * sessionStorage, or IndexedDB. Re-derived fresh via one wallet signature per session through
 * an explicit unlock() call, never auto-triggered. Resets on wallet disconnect or account
 * change so switching accounts can never leak the previous account's key into a new session.
 *
 * Deriving a key is just a signature — free, no gas, every time. Publishing it on chain (so
 * other people can find it to message you) is a real transaction and should only ever happen
 * once: unlock() checks what's already published before deciding whether to publish again.
 */
export function DmProvider({ children }: { children: ReactNode }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const [keyPair, setKeyPair] = useState<MessagingKeyPair | null>(null);
  const [status, setStatus] = useState<Status>("locked");
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<boolean | null>(null);
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

  // Read-only check, no signature involved — lets the UI say "enable" (first time, costs gas)
  // vs. something lighter (already enabled) before the user ever clicks anything.
  useEffect(() => {
    if (!publicClient || !address) {
      setPublished(null);
      return;
    }
    let cancelled = false;
    getMessagingPublicKey(publicClient, address)
      .then((key) => {
        if (!cancelled) setPublished(key !== null);
      })
      .catch(() => {
        if (!cancelled) setPublished(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

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

      const existing = await getMessagingPublicKey(publicClient, address);
      if (!existing || !bytesEqual(existing, derived.publicKey)) {
        await publishMessagingPublicKey(publicClient, walletClient, derived.publicKey);
      }

      setKeyPair(derived);
      setPublished(true);
      unlockedForAddress.current = address.toLowerCase();
      setStatus("unlocked");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }, [publicClient, walletClient, address, status]);

  return <DmContext.Provider value={{ keyPair, status, error, published, unlock }}>{children}</DmContext.Provider>;
}

export function useDm(): DmContextValue {
  const ctx = useContext(DmContext);
  if (!ctx) throw new Error("useDm() must be called inside a <DmProvider>.");
  return ctx;
}
