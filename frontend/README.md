# BetRHood Protocol — Frontend

The web app: connect a wallet, upload files, post to threads, edit your profile. Talks
directly to the deployed contracts via `@betrhood/sdk` — no backend of its own.

Built functional-first on purpose — a visual redesign is expected later, so this isn't
trying to be the final look, just a working one.

## Pages

- **`/`** — homepage. "Recent" is a real global activity feed (every message ever posted,
  newest first). "Trending"/"Popular" are visibly disabled — they need an upvote contract
  that doesn't exist yet.
- **`/upload`** — upload a file, get a link back.
- **`/view/:address/:key`** — a richer page than the raw gateway link: shows owner, size,
  version count, and an inline preview for images/text.
- **`/profile`** — set a display name and picture.

## Local development

```bash
npm install   # from the repo root — this is an npm workspace
npm run dev --workspace=frontend
```

Wallet connection works immediately via any browser extension (MetaMask, etc.) with zero
config. WalletConnect (QR code / mobile deep link) is optional — see `.env.example`.

## Deploying

Meant to be deployed to Cloudflare Pages via its GitHub integration (same "connect a
repo, no CLI" flow used for the gateway) — set the root directory to `frontend`, build
command `npm run build --prefix ../sdk && npm run build`, output directory `dist`.
