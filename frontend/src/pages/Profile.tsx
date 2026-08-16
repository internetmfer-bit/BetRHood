import {
  CHUNK_SIZE,
  getBio,
  getFollowerCount,
  getFollowingCount,
  getProfile,
  getProfilePicture,
  setBio as setBioOnChain,
  setName as setNameOnChain,
  setPicture,
} from "@betrhood/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { PostCard } from "../components/PostCard";
import { getOwnSocialPosts, postToFeed, type FeedItem } from "../social";

export function Profile() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [followerCount, setFollowerCount] = useState<bigint | null>(null);
  const [followingCount, setFollowingCount] = useState<bigint | null>(null);
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [postNames, setPostNames] = useState<Record<string, string>>({});
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const loadedPictureUrl = useRef<string | null>(null);
  // What's actually on chain right now, so Save can skip fields that haven't changed instead
  // of paying gas to write the exact same value back.
  const savedName = useRef("");
  const savedBio = useRef("");

  useEffect(() => {
    if (!publicClient || !address) return;
    let cancelled = false;

    (async () => {
      const [profile, bioText] = await Promise.all([getProfile(publicClient, address), getBio(publicClient, address)]);
      if (cancelled) return;
      setName(profile.name);
      setBio(bioText);
      savedName.current = profile.name;
      savedBio.current = bioText;

      // Separate from the main load — a Follow.sol hiccup shouldn't block name/bio/picture
      // from loading, it should just mean the counts line doesn't show.
      try {
        const [followers, following] = await Promise.all([
          getFollowerCount(publicClient, address),
          getFollowingCount(publicClient, address),
        ]);
        if (!cancelled) {
          setFollowerCount(followers);
          setFollowingCount(following);
        }
      } catch {
        // leave both null
      }

      if (profile.hasPicture) {
        const bytes = await getProfilePicture(publicClient, address);
        if (cancelled || !bytes) return;
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
        loadedPictureUrl.current = url;
        setPictureUrl(url);
      }
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
      if (loadedPictureUrl.current) {
        URL.revokeObjectURL(loadedPictureUrl.current);
        loadedPictureUrl.current = null;
      }
    };
  }, [publicClient, address]);

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const loadPosts = useCallback(async () => {
    if (!publicClient || !address) return;
    setPostsLoading(true);
    setPostsError(null);
    try {
      const items = await getOwnSocialPosts(publicClient, address);
      setPosts(items);

      // Non-fatal — reposted originals just show a truncated address instead of a name.
      try {
        const originalSenders = [...new Set(items.filter((i) => i.original).map((i) => i.original!.sender))];
        const entries = await Promise.all(
          originalSenders.map(async (sender): Promise<[Address, string]> => {
            const profile = await getProfile(publicClient, sender);
            return [sender, profile.name];
          }),
        );
        const resolved = Object.fromEntries(entries.filter(([, n]) => n.length > 0));
        // Your own posts/reposts always show `address` as a sender too (the reposter, for a
        // repost) — include your own on-chain-confirmed name so it resolves the same way.
        if (savedName.current) resolved[address] = savedName.current;
        setPostNames(resolved);
      } catch {
        // ignore
      }
    } catch (err) {
      setPostsError((err as Error).message);
    } finally {
      setPostsLoading(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  async function handlePost() {
    if (!publicClient || !walletClient || postText.trim().length === 0) return;
    setPosting(true);
    setPostsError(null);
    try {
      await postToFeed(publicClient, walletClient, postText.trim());
      setPostText("");
      await loadPosts();
    } catch (err) {
      setPostsError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function handleSave() {
    if (!publicClient || !walletClient) {
      setError("Wallet isn't ready yet — wait a moment and try again, or reconnect it.");
      return;
    }

    const trimmedName = name.trim();
    const trimmedBio = bio.trim();
    const nameChanged = trimmedName !== savedName.current;
    const bioChanged = trimmedBio.length > 0 && trimmedBio !== savedBio.current;

    if (!nameChanged && !bioChanged && !pendingFile) {
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
      return;
    }

    setSaving(true);
    setError(null);
    setSavedNotice(false);

    try {
      if (nameChanged) {
        await setNameOnChain(publicClient, walletClient, trimmedName);
        savedName.current = trimmedName;
      }
      if (bioChanged) {
        await setBioOnChain(publicClient, walletClient, trimmedBio);
        savedBio.current = trimmedBio;
      }
      if (pendingFile) {
        const buffer = new Uint8Array(await pendingFile.arrayBuffer());
        await setPicture(publicClient, walletClient, buffer);
        // A fresh, independent URL — reusing pendingPreviewUrl would get revoked out from
        // under us the instant pendingFile is cleared below (that's what its own effect does).
        setPictureUrl(URL.createObjectURL(new Blob([buffer])));
        setPendingFile(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="panel">
        <p className="hint">Connect a wallet to edit your profile.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>Profile</h1>
      {loaded && followerCount !== null && followingCount !== null && (
        <p className="follow-counts">
          <Link to={`/u/${address}`}>
            <b>{followerCount.toString()}</b> followers · <b>{followingCount.toString()}</b> following
          </Link>
        </p>
      )}

      <label className="avatar-picker">
        {pendingPreviewUrl ? (
          <img src={pendingPreviewUrl} alt="" className="avatar" />
        ) : pictureUrl ? (
          <img src={pictureUrl} alt="" className="avatar" />
        ) : (
          <span className="avatar avatar-empty" />
        )}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <p className="hint">Picture uploads through Storage, same as any other file.</p>
      {pendingFile && (
        <p className="hint">
          {(pendingFile.size / 1024).toFixed(1)} KB →{" "}
          {Math.max(1, Math.ceil(pendingFile.size / CHUNK_SIZE))} chunk(s). Bigger pictures cost more
          gas to store — a typical small avatar (under ~200 KB) keeps that cost trivial.
        </p>
      )}

      <input
        className="field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        maxLength={32}
        disabled={!loaded}
      />

      <textarea
        className="field field-textarea"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Bio — a couple sentences about you or what you're building"
        maxLength={280}
        rows={3}
        disabled={!loaded}
      />
      <p className="hint">{bio.length}/280</p>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving || !loaded}>
        {saving ? "Saving…" : "Save Profile"}
      </button>

      {error && <p className="error">{error}</p>}
      {savedNotice && <p className="hint">Nothing changed — nothing to save.</p>}

      <div className="upload-history">
        <h2 className="upload-history-title">Your Posts</h2>

        <div className="reply-box">
          <textarea
            className="field field-textarea"
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="Share something"
            rows={3}
          />
          <button className="btn btn-primary" onClick={handlePost} disabled={posting || postText.trim().length === 0}>
            {posting ? "Posting…" : "Post"}
          </button>
        </div>

        {postsLoading && <p className="hint">Loading…</p>}
        {!postsLoading && postsError && (
          <p className="error">
            Couldn't load your posts: {postsError}{" "}
            <button className="btn-copy" onClick={loadPosts}>
              retry
            </button>
          </p>
        )}
        {!postsLoading && !postsError && posts.length === 0 && <p className="hint">Nothing posted yet.</p>}
        {posts.length > 0 && (
          <div className="post-card-list">
            {posts.map((item) => (
              <PostCard key={item.post.id.toString()} item={item} names={postNames} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
