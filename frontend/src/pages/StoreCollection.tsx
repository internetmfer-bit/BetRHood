import { buyListing, getListingsByCollection, getProfile, type NftListing } from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Address } from "viem";
import { isAddress } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { NftListingRow } from "../components/NftListingRow";
import { getCollectionName } from "../nftMetadata";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function StoreCollection() {
  const { address: collectionParam } = useParams<{ address: string }>();
  const publicClient = usePublicClient();
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [collectionName, setCollectionName] = useState<string | null>(null);
  const [listings, setListings] = useState<NftListing[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<bigint | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicClient || !collectionParam || !isAddress(collectionParam)) return;
    setLoading(true);
    setLoadError(null);
    try {
      const active = await getListingsByCollection(publicClient, collectionParam);
      setListings(active);

      // Non-fatal — a failure here just means the heading/sellers fall back to truncated
      // addresses.
      getCollectionName(publicClient, collectionParam).then(setCollectionName);
      try {
        const sellers = [...new Set(active.map((l) => l.envelope.offerer))];
        const entries = await Promise.all(
          sellers.map(async (s): Promise<[Address, string]> => {
            const profile = await getProfile(publicClient, s);
            return [s, profile.name];
          }),
        );
        setNames(Object.fromEntries(entries.filter(([, n]) => n.length > 0)));
      } catch {
        // ignore
      }
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [publicClient, collectionParam]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleBuy(listing: NftListing) {
    if (!publicClient || !walletClient) return;
    setBuyingId(listing.messageId);
    setBuyError(null);
    try {
      await buyListing(publicClient, walletClient, listing);
      await load();
    } catch (err) {
      setBuyError((err as Error).message);
    } finally {
      setBuyingId(null);
    }
  }

  if (!collectionParam) return null;
  if (!isAddress(collectionParam)) {
    return (
      <div className="panel">
        <p className="error">"{collectionParam}" isn't a valid collection address.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <Link to="/store" className="hint">
        ← All NFTs
      </Link>
      <h1>{collectionName || truncate(collectionParam)}</h1>
      <p className="hint">{collectionParam}</p>

      {loading && <p className="hint">Loading…</p>}
      {!loading && loadError && (
        <p className="error">
          Couldn't load listings: {loadError}{" "}
          <button className="btn-copy" onClick={load}>
            retry
          </button>
        </p>
      )}
      {!loading && !loadError && listings.length === 0 && (
        <p className="hint">No active listings from this collection right now.</p>
      )}
      {listings.length > 0 && (
        <div className="store-listing-list">
          {listings.map((l) => (
            <NftListingRow
              key={l.messageId.toString()}
              listing={l}
              names={names}
              showSeller
              action={
                <button
                  className="btn btn-primary"
                  onClick={() => handleBuy(l)}
                  disabled={!isConnected || buyingId === l.messageId}
                >
                  {buyingId === l.messageId ? "Buying…" : "Buy"}
                </button>
              }
            />
          ))}
        </div>
      )}
      {buyError && <p className="error">{buyError}</p>}
    </div>
  );
}
