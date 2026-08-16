import { getBio, getProfile, getProfilePicture, setBio as setBioOnChain, setName as setNameOnChain, setPicture } from "@betrhood/sdk";
import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

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
  const [loaded, setLoaded] = useState(false);
  const loadedPictureUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!publicClient || !address) return;
    let cancelled = false;

    (async () => {
      const [profile, bioText] = await Promise.all([
        getProfile(publicClient, address),
        getBio(publicClient, address),
      ]);
      if (cancelled) return;
      setName(profile.name);
      setBio(bioText);

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

  async function handleSave() {
    if (!publicClient || !walletClient) return;
    setSaving(true);
    setError(null);

    try {
      await setNameOnChain(publicClient, walletClient, name);
      if (bio.trim().length > 0) {
        await setBioOnChain(publicClient, walletClient, bio);
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
    </div>
  );
}
