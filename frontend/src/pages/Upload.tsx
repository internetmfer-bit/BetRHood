import { CHUNK_SIZE, postMessage, upload } from "@betrhood/sdk";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

type Stage = "idle" | "uploading" | "done" | "error";

const SHOWCASE_TOPIC = "showcase";

export function Upload() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareToShowcase, setShareToShowcase] = useState(false);
  const [caption, setCaption] = useState("");

  const chunkEstimate = file ? Math.max(1, Math.ceil(file.size / CHUNK_SIZE)) : 0;
  const previewLink = address && key.trim() ? `gateway.betrhood.com/${address}/${encodeURIComponent(key.trim())}` : null;

  async function handleUpload() {
    const trimmedKey = key.trim();
    if (!file || !trimmedKey || !publicClient || !walletClient || !address) return;
    setStage("uploading");
    setError(null);

    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      await upload(publicClient, walletClient, trimmedKey, buffer);

      if (shareToShowcase) {
        const body = JSON.stringify({ key: trimmedKey, caption });
        await postMessage(publicClient, walletClient, SHOWCASE_TOPIC, body);
      }

      setLink(`gateway.betrhood.com/${address}/${encodeURIComponent(trimmedKey)}`);
      setStage("done");
    } catch (err) {
      setError((err as Error).message);
      setStage("error");
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!isConnected) {
    return (
      <div className="panel">
        <p className="hint">Connect a wallet to upload.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>Upload</h1>

      <label className="drop">
        {file ? file.name : "Drop a file, or click to choose"}
        <input
          type="file"
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            setKey(chosen?.name ?? "");
            setStage("idle");
            setLink(null);
          }}
          hidden
        />
      </label>

      {file && (
        <div className="kv-list">
          <div className="kv">
            <span>size</span>
            <b>
              {(file.size / 1024).toFixed(1)} KB → {chunkEstimate === 1 ? "direct" : `${chunkEstimate} chunks`}
            </b>
          </div>
        </div>
      )}

      {file && (
        <>
          <input
            className="field"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Key (this becomes part of the link)"
          />
          <p className="hint link-preview">
            {previewLink ? (
              <>Link will be: <b>{previewLink}</b></>
            ) : (
              "Pick a key to see the link."
            )}
          </p>
        </>
      )}

      {file && stage !== "done" && (
        <>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={shareToShowcase}
              onChange={(e) => setShareToShowcase(e.target.checked)}
            />
            Share this in the homepage Showcase
          </label>

          {shareToShowcase && (
            <input
              className="field"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Say something about it (optional)"
              maxLength={200}
            />
          )}

          <button className="btn btn-primary" onClick={handleUpload} disabled={stage === "uploading" || !key.trim()}>
            {stage === "uploading" ? "Uploading…" : "Upload"}
          </button>
        </>
      )}

      {stage === "error" && <p className="error">{error}</p>}

      {stage === "done" && link && (
        <div className="link-row">
          <span>{link}</span>
          <button className="btn-copy" onClick={copyLink}>
            {copied ? "copied" : "copy"}
          </button>
        </div>
      )}
    </div>
  );
}
