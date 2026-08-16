import { CHUNK_SIZE, getMessagesBySender, postMessage, upload } from "@betrhood/sdk";
import { useCallback, useEffect, useState } from "react";
import { stringToHex } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

type Stage = "idle" | "uploading" | "done" | "error";

const SHOWCASE_TOPIC = "showcase";
const UPLOADS_TOPIC = "uploads";
// Message.topic comes back as the same bytes32 encoding postMessage() sends — compare against
// this, not the raw string, to actually filter by topic.
const UPLOADS_TOPIC_HEX = stringToHex(UPLOADS_TOPIC, { size: 32 });

interface UploadRecord {
  key: string;
  size: number;
  timestamp: bigint;
}

function parseUploadRecord(bytes: Uint8Array): { key: string; size: number } | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed.key === "string" && typeof parsed.size === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

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
  const [history, setHistory] = useState<UploadRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const chunkEstimate = file ? Math.max(1, Math.ceil(file.size / CHUNK_SIZE)) : 0;
  const previewLink = address && key.trim() ? `gateway.betrhood.com/${address}/${encodeURIComponent(key.trim())}` : null;

  const loadHistory = useCallback(async () => {
    if (!publicClient || !address) return;
    setHistoryLoading(true);
    const messages = await getMessagesBySender(publicClient, address);
    const records = messages
      .filter((m) => m.topic === UPLOADS_TOPIC_HEX)
      .map((m): UploadRecord | null => {
        const parsed = parseUploadRecord(m.body);
        return parsed ? { ...parsed, timestamp: m.timestamp } : null;
      })
      .filter((r): r is UploadRecord => r !== null)
      .sort((a, b) => Number(b.timestamp - a.timestamp));
    setHistory(records);
    setHistoryLoading(false);
  }, [publicClient, address]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleUpload() {
    const trimmedKey = key.trim();
    if (!file || !trimmedKey || !publicClient || !walletClient || !address) return;
    setStage("uploading");
    setError(null);

    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      await upload(publicClient, walletClient, trimmedKey, buffer);

      // Storage only ever sees a hashed key, never the plaintext — so this record message is
      // what makes "your uploads" listable at all. Its own failure shouldn't undo the upload
      // that already succeeded, so it's a separate try/catch.
      try {
        const record = JSON.stringify({ key: trimmedKey, size: buffer.length });
        await postMessage(publicClient, walletClient, UPLOADS_TOPIC, record);
        await loadHistory();
      } catch {
        // The file is safely stored either way; the history list just won't show it yet.
      }

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

      <div className="upload-history">
        <h2 className="upload-history-title">Your Uploads</h2>
        {historyLoading && <p className="hint">Loading…</p>}
        {!historyLoading && history.length === 0 && (
          <p className="hint">Nothing uploaded yet from this address.</p>
        )}
        {!historyLoading && history.length > 0 && (
          <div className="thread-list">
            {history.map((record, i) => (
              <a
                key={i}
                className="upload-history-item"
                href={`https://gateway.betrhood.com/${address}/${encodeURIComponent(record.key)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="upload-history-key">{record.key}</span>
                <span className="upload-history-meta">
                  {(record.size / 1024).toFixed(1)} KB · {new Date(Number(record.timestamp) * 1000).toLocaleString()}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
