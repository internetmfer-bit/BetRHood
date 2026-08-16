import type { DirectoryEntry } from "@betrhood/sdk";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { loadDirectory, matchesQuery } from "../directory";

const MAX_RESULTS = 8;

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Nav-bar search by display name or wallet address. The directory (every named profile) is
 * fetched lazily on first focus, not eagerly on every page load — see loadDirectory(). Any
 * syntactically valid address is always offered as a direct result even if it's never set a
 * name, since /u/<address> renders fine for an unnamed profile too. */
export function UserSearch() {
  const publicClient = usePublicClient();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState<DirectoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  function ensureLoaded() {
    if (directory !== null || loading || !publicClient) return;
    setLoading(true);
    loadDirectory(publicClient)
      .then(setDirectory)
      .catch(() => setDirectory([]))
      .finally(() => setLoading(false));
  }

  const trimmed = query.trim();
  const nameMatches = trimmed && directory ? directory.filter((e) => matchesQuery(e, trimmed)).slice(0, MAX_RESULTS) : [];
  const queryIsAddress = isAddress(trimmed);
  const addressAlreadyListed = nameMatches.some((e) => e.address.toLowerCase() === trimmed.toLowerCase());
  const results: { address: Address; name: string }[] = queryIsAddress && !addressAlreadyListed
    ? [{ address: trimmed as Address, name: "" }, ...nameMatches]
    : nameMatches;

  function goTo(address: string) {
    setQuery("");
    setOpen(false);
    navigate(`/u/${address}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && results.length > 0) {
      goTo(results[0].address);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="search-wrap">
      <input
        className="field search-field"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onBlur={() => {
          // Delay so a click on a result registers before the dropdown unmounts.
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Find by name or address…"
      />
      {open && trimmed.length > 0 && (
        <div className="menu search-results">
          {loading && <div className="menu-item search-hint">Loading…</div>}
          {!loading && results.length === 0 && <div className="menu-item search-hint">No matches.</div>}
          {results.map((r) => (
            <button key={r.address} className="menu-item search-result" onClick={() => goTo(r.address)}>
              <span className="search-result-name">{r.name || truncate(r.address)}</span>
              {r.name && <span className="search-result-address">{truncate(r.address)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
