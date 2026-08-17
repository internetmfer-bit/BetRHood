import {
  approveForListing,
  buyListing,
  cancelListing,
  createListing,
  getActiveListings,
  getMyListings,
  getProfile,
  isApprovedForListing,
  type NftListing,
  type NftStandard,
} from "@betrhood/sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isAddress, parseEther, type Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { NftListingRow } from "../components/NftListingRow";
import { getCollectionName } from "../nftMetadata";
import { SCAN_CHUNK_SIZE, scanOwnedTokens } from "../nftOwnership";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type Tab = "browse" | "sell";

export function Store() {
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [tab, setTab] = useState<Tab>("browse");

  const [listings, setListings] = useState<NftListing[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [collectionNames, setCollectionNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<bigint | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    setLoadError(null);
    try {
      const active = await getActiveListings(publicClient);
      setListings(active);

      // Non-fatal — a failure here just means sellers/collections fall back to truncated
      // addresses.
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

      try {
        const collections = [...new Set(active.map((l) => l.envelope.collection.toLowerCase()))];
        const entries = await Promise.all(
          collections.map(async (c): Promise<[string, string]> => [c, (await getCollectionName(publicClient, c as Address)) ?? ""]),
        );
        setCollectionNames(Object.fromEntries(entries.filter(([, n]) => n.length > 0)));
      } catch {
        // ignore
      }
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    if (tab === "browse") loadListings();
  }, [tab, loadListings]);

  // Grouped by collection, most-populous group first, so Browse reads as "here's what's for
  // sale in each collection" rather than an arbitrary chronological jumble.
  const listingsByCollection = useMemo(() => {
    const groups = new Map<string, NftListing[]>();
    for (const l of listings) {
      const key = l.envelope.collection.toLowerCase();
      const group = groups.get(key);
      if (group) group.push(l);
      else groups.set(key, [l]);
    }
    return [...groups.entries()].sort(([, a], [, b]) => b.length - a.length);
  }, [listings]);

  async function handleBuy(listing: NftListing) {
    if (!publicClient || !walletClient) return;
    setBuyingId(listing.messageId);
    setBuyError(null);
    try {
      await buyListing(publicClient, walletClient, listing);
      await loadListings();
    } catch (err) {
      setBuyError((err as Error).message);
    } finally {
      setBuyingId(null);
    }
  }

  const [collection, setCollection] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [standard, setStandard] = useState<NftStandard>("ERC721");
  const [priceEth, setPriceEth] = useState("");
  const [approved, setApproved] = useState<boolean | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  const [sellDone, setSellDone] = useState(false);

  const [scanStart, setScanStart] = useState("0");
  const [scanEnd, setScanEnd] = useState(String(SCAN_CHUNK_SIZE - 1));
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<bigint[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanFilter, setScanFilter] = useState("");

  // Collection/standard changed — any previous scan no longer applies.
  useEffect(() => {
    setScanResults(null);
    setScanError(null);
    setScanFilter("");
  }, [collection, standard]);

  async function handleScan() {
    if (!publicClient || !address || !isAddress(collection.trim())) return;
    const start = BigInt(scanStart.trim() || "0");
    const end = BigInt(scanEnd.trim() || "0");
    if (end < start) {
      setScanError("The range's end must be at or after its start.");
      return;
    }
    if (end - start + 1n > BigInt(SCAN_CHUNK_SIZE)) {
      setScanError(`Scan up to ${SCAN_CHUNK_SIZE} token ids at a time — narrow the range and scan again.`);
      return;
    }
    setScanning(true);
    setScanError(null);
    setScanResults(null);
    try {
      setScanResults(await scanOwnedTokens(publicClient, collection.trim() as Address, address, standard, start, end));
    } catch (err) {
      setScanError((err as Error).message);
    } finally {
      setScanning(false);
    }
  }

  const [myListings, setMyListings] = useState<NftListing[]>([]);
  const [myListingsLoading, setMyListingsLoading] = useState(true);
  const [myListingsError, setMyListingsError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);

  const loadMyListings = useCallback(async () => {
    if (!publicClient || !address) return;
    setMyListingsLoading(true);
    setMyListingsError(null);
    try {
      setMyListings(await getMyListings(publicClient, address));
    } catch (err) {
      setMyListingsError((err as Error).message);
    } finally {
      setMyListingsLoading(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    if (tab === "sell") loadMyListings();
  }, [tab, loadMyListings]);

  // Auto-checks approval (a free read, no signature) whenever the collection/standard/address
  // combination changes, rather than making the user click a button for something that costs
  // nothing — approving/listing themselves stay explicit, separate button presses.
  useEffect(() => {
    setApproved(null);
    if (!publicClient || !address || !isAddress(collection.trim())) return;
    let cancelled = false;
    setCheckingApproval(true);
    isApprovedForListing(publicClient, address, collection.trim() as Address, standard)
      .then((result) => {
        if (!cancelled) setApproved(result);
      })
      .catch(() => {
        if (!cancelled) setApproved(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingApproval(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient, address, collection, standard]);

  async function handleApprove() {
    if (!publicClient || !walletClient || !isAddress(collection.trim())) return;
    setApproving(true);
    setSellError(null);
    try {
      await approveForListing(publicClient, walletClient, collection.trim() as Address, standard);
      setApproved(true);
    } catch (err) {
      setSellError((err as Error).message);
    } finally {
      setApproving(false);
    }
  }

  async function handleList() {
    if (!publicClient || !walletClient || !isAddress(collection.trim()) || !tokenId.trim() || !priceEth.trim()) return;
    setSubmitting(true);
    setSellError(null);
    setSellDone(false);
    try {
      await createListing(publicClient, walletClient, {
        collection: collection.trim() as Address,
        tokenId: BigInt(tokenId.trim()),
        standard,
        priceWei: parseEther(priceEth.trim()),
      });
      setSellDone(true);
      setCollection("");
      setTokenId("");
      setPriceEth("");
      await loadMyListings();
    } catch (err) {
      setSellError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(listing: NftListing) {
    if (!publicClient || !walletClient) return;
    setCancellingId(listing.messageId);
    try {
      await cancelListing(publicClient, walletClient, listing);
      await loadMyListings();
    } catch (err) {
      setMyListingsError((err as Error).message);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="panel">
      <h1>NFTs</h1>
      <p className="hint">
        Buy and sell NFTs from any collection, priced in ETH. Settlement runs through Seaport —
        OpenSea's audited, ownerless marketplace protocol — so this app never holds your NFT or
        your ETH at any point.
      </p>

      <div className="tabs">
        <button className={`tab ${tab === "browse" ? "tab-active" : ""}`} onClick={() => setTab("browse")}>
          Browse
        </button>
        <button className={`tab ${tab === "sell" ? "tab-active" : ""}`} onClick={() => setTab("sell")}>
          Sell
        </button>
      </div>

      {tab === "browse" && (
        <div className="store-tab">
          {loading && <p className="hint">Loading…</p>}
          {!loading && loadError && (
            <p className="error">
              Couldn't load listings: {loadError}{" "}
              <button className="btn-copy" onClick={loadListings}>
                retry
              </button>
            </p>
          )}
          {!loading && !loadError && listings.length === 0 && <p className="hint">No active listings yet.</p>}
          {listingsByCollection.map(([collectionAddr, group]) => (
            <div className="store-collection-group" key={collectionAddr}>
              <h3 className="store-collection-heading">
                <Link to={`/store/collection/${collectionAddr}`}>{collectionNames[collectionAddr] || truncate(collectionAddr)}</Link>
              </h3>
              <div className="store-listing-list">
                {group.map((l) => (
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
            </div>
          ))}
          {buyError && <p className="error">{buyError}</p>}
        </div>
      )}

      {tab === "sell" &&
        (!isConnected ? (
          <p className="hint">Connect a wallet to list an NFT.</p>
        ) : (
          <div className="store-tab">
            <input
              className="field"
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              placeholder="Collection address (0x...)"
            />
            <div className="store-standard-picker">
              <label>
                <input type="radio" checked={standard === "ERC721"} onChange={() => setStandard("ERC721")} /> ERC-721
              </label>
              <label>
                <input type="radio" checked={standard === "ERC1155"} onChange={() => setStandard("ERC1155")} />{" "}
                ERC-1155
              </label>
            </div>

            {isAddress(collection.trim()) && (
              <div className="store-scan">
                <div className="store-scan-range">
                  <input
                    className="field store-scan-range-input"
                    value={scanStart}
                    onChange={(e) => setScanStart(e.target.value)}
                    placeholder="From token id"
                  />
                  <input
                    className="field store-scan-range-input"
                    value={scanEnd}
                    onChange={(e) => setScanEnd(e.target.value)}
                    placeholder="To token id"
                  />
                  <button className="btn" onClick={handleScan} disabled={scanning}>
                    {scanning ? "Scanning…" : "Find my tokens"}
                  </button>
                </div>
                {scanError && <p className="error">{scanError}</p>}
                {scanResults !== null && scanResults.length === 0 && (
                  <p className="hint">Nothing owned by you in that range — try a different one.</p>
                )}
                {scanResults !== null && scanResults.length > 0 && (
                  <>
                    <input
                      className="field"
                      value={scanFilter}
                      onChange={(e) => setScanFilter(e.target.value)}
                      placeholder="Filter by token id"
                    />
                    <div className="store-scan-results">
                      {scanResults
                        .filter((id) => id.toString().includes(scanFilter.trim()))
                        .map((id) => (
                          <button
                            key={id.toString()}
                            className={`store-scan-chip ${tokenId === id.toString() ? "store-scan-chip-selected" : ""}`}
                            onClick={() => setTokenId(id.toString())}
                          >
                            #{id.toString()}
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <input
              className="field"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              placeholder="Token ID (pick one above, or type it directly)"
            />
            <input
              className="field"
              value={priceEth}
              onChange={(e) => setPriceEth(e.target.value)}
              placeholder="Price in ETH"
            />

            {checkingApproval && <p className="hint">Checking approval…</p>}
            {!checkingApproval && approved === false && (
              <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
                {approving ? "Approving…" : "Approve Seaport for this collection"}
              </button>
            )}
            {!checkingApproval && approved === true && (
              <button
                className="btn btn-primary"
                onClick={handleList}
                disabled={submitting || !tokenId.trim() || !priceEth.trim()}
              >
                {submitting ? "Listing…" : "List for sale"}
              </button>
            )}

            {sellError && <p className="error">{sellError}</p>}
            {sellDone && <p className="hint">Listed — it'll show up under Browse and in Your Listings below.</p>}

            <div className="upload-history">
              <h2 className="upload-history-title">Your Listings</h2>
              {myListingsLoading && <p className="hint">Loading…</p>}
              {!myListingsLoading && myListingsError && (
                <p className="error">
                  Couldn't load your listings: {myListingsError}{" "}
                  <button className="btn-copy" onClick={loadMyListings}>
                    retry
                  </button>
                </p>
              )}
              {!myListingsLoading && !myListingsError && myListings.length === 0 && (
                <p className="hint">You haven't listed anything yet.</p>
              )}
              {myListings.length > 0 && (
                <div className="store-listing-list">
                  {myListings.map((l) => (
                    <NftListingRow
                      key={l.messageId.toString()}
                      listing={l}
                      action={
                        l.status === "active" && (
                          <button
                            className="btn-copy"
                            onClick={() => handleCancel(l)}
                            disabled={cancellingId === l.messageId}
                          >
                            {cancellingId === l.messageId ? "Cancelling…" : "Cancel"}
                          </button>
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}
