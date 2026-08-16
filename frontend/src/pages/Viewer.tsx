import { getVersionCount, resolve } from "@betrhood/sdk";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const TEXT_EXTENSIONS = new Set(["txt", "json", "md", "html", "css", "js"]);

function extensionOf(key: string): string {
  const i = key.lastIndexOf(".");
  return i === -1 ? "" : key.slice(i + 1).toLowerCase();
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
  return map[ext] ?? "application/octet-stream";
}

type State =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; bytes: Uint8Array; versions: bigint };

export function Viewer() {
  const { address, key } = useParams<{ address: string; key: string }>();
  const publicClient = usePublicClient();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!publicClient || !address || !key) return;
    if (!isAddress(address)) {
      setState({ status: "error", message: `"${address}" is not a valid address` });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const owner = address as Address;
        const [bytes, versions] = await Promise.all([
          resolve(publicClient, owner, key),
          getVersionCount(publicClient, owner, key),
        ]);
        if (cancelled) return;
        if (bytes.length === 0) {
          setState({ status: "not-found" });
        } else {
          setState({ status: "ready", bytes, versions });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, address, key]);

  if (!address || !key) {
    return (
      <div className="panel">
        <p className="error">Missing address or key.</p>
      </div>
    );
  }

  const gatewayLink = `gateway.betrhood.com/${address}/${key}`;

  return (
    <div className="panel">
      <h1>{key}</h1>
      <div className="kv-list">
        <div className="kv">
          <span>owner</span>
          <b>{address}</b>
        </div>
        <div className="kv">
          <span>link</span>
          <b>
            <a href={`https://${gatewayLink}`} target="_blank" rel="noreferrer">
              {gatewayLink}
            </a>
          </b>
        </div>
      </div>

      {state.status === "loading" && <p className="hint">Loading…</p>}
      {state.status === "not-found" && <p className="hint">Nothing found at this address/key.</p>}
      {state.status === "error" && <p className="error">{state.message}</p>}

      {state.status === "ready" && (
        <>
          <div className="kv-list">
            <div className="kv">
              <span>size</span>
              <b>{state.bytes.length.toLocaleString()} bytes</b>
            </div>
            <div className="kv">
              <span>versions</span>
              <b>{state.versions.toString()}</b>
            </div>
          </div>
          <Preview bytes={state.bytes} keyName={key} />
        </>
      )}
    </div>
  );
}

function Preview({ bytes, keyName }: { bytes: Uint8Array; keyName: string }) {
  const ext = extensionOf(keyName);
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeFor(ext) }));
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes, ext, isImage]);

  if (isImage) {
    return imageUrl ? <img src={imageUrl} alt={keyName} className="preview-image" /> : null;
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    const text = new TextDecoder().decode(bytes);
    return <pre className="preview-text">{text}</pre>;
  }

  return <p className="hint">No inline preview for this file type — use the link above.</p>;
}
