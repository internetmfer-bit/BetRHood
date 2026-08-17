import type { NftListing } from "@betrhood/sdk";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { getNftMetadata, type NftMetadata } from "../nftMetadata";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function NftListingRow({
  listing,
  names,
  showSeller,
  action,
}: {
  listing: NftListing;
  names?: Record<string, string>;
  showSeller?: boolean;
  action: React.ReactNode;
}) {
  const publicClient = usePublicClient();
  const [metadata, setMetadata] = useState<NftMetadata | null>(null);
  const { collection, tokenId, standard } = listing.envelope;

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    getNftMetadata(publicClient, collection, BigInt(tokenId), standard).then((m) => {
      if (!cancelled) setMetadata(m);
    });
    return () => {
      cancelled = true;
    };
  }, [publicClient, collection, tokenId, standard]);

  return (
    <div className="store-listing">
      {metadata?.image ? (
        <img
          className="store-listing-thumb"
          src={metadata.image}
          alt=""
          onError={() => setMetadata((m) => (m ? { ...m, image: null } : m))}
        />
      ) : (
        <span className="store-listing-thumb store-listing-thumb-empty" />
      )}
      <div className="store-listing-info">
        {showSeller && names && (
          <Link to={`/u/${listing.envelope.offerer}`} className="store-listing-seller">
            {names[listing.envelope.offerer] || truncate(listing.envelope.offerer)}
          </Link>
        )}
        <span className="store-listing-item">
          {/* An NFT's own metadata name commonly already embeds its number (e.g. "Punk #413") —
              only append #tokenId ourselves when falling back to the standard/collection text,
              which doesn't. */}
          {metadata?.name ?? `${standard} · ${truncate(collection)} #${tokenId}`}
        </span>
        {!showSeller && <span className={`store-status store-status-${listing.status}`}>{listing.status}</span>}
      </div>
      <div className="store-listing-actions">
        <span className="store-listing-price">{formatEther(BigInt(listing.envelope.priceWei))} ETH</span>
        {action}
      </div>
    </div>
  );
}
