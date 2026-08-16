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
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareToShowcase, setShareToShowcase] = useState(false);
  const [caption, setCaption] = useState("");

  const chunkEstimate = file ? Math.max(1, Math.ceil(file.size / CHUNK_SIZE)) : 0;

  async function handleUpload() {
    if (!file || !publicClient || !walletClient || !address) return;
    setStage("uploading");
    setError(null);

    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      await upload(publicClient, walletClient, file.name, buffer);

      if (shareToShowcase) {
        const body = JSON.stringify({ key: file.name, caption });
        await postMessage(publicClient, walletClient, SHOWCASE_TOPIC, body);
      }

      setLink(`betrhood.com/${address}/${file.name}`);
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
            setFile(e.target.files?.[0] ?? null);
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
          <div className="kv">
            <span>key</span>
            <b>{file.name}</b>
          </div>
        </div>
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

          <button className="btn btn-primary" onClick={handleUpload} disabled={stage === "uploading"}>
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
