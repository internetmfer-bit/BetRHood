# BetRHood Protocol — Gateway

A Cloudflare Worker that turns `cdn.betrhood.com/<address>/<key>` into a plain HTTP response —
the one piece of this protocol that isn't decentralized by default, and the reason it's kept
this small and this open. Anyone can run their own copy of this exact Worker pointed at their
own RPC endpoint; nothing here is special or privileged.

## What it does

1. Parses the request path into an owner address and a key.
2. Calls `Storage.read(owner, key)` via the SDK's `resolve()` (handles ungzip/unchunk).
3. Guesses `Content-Type` from the key's file extension (`avatar.png` → `image/png`).
4. Returns the bytes, cached at the edge for 60 seconds — short, because content here is
   mutable (a key can be overwritten with a new version), not content-addressed.

No wallet, no account, no auth — reads are free and public by design.

## Local development

```bash
npm run dev
```

Runs the real Workers runtime locally via `wrangler dev`, against Robinhood Chain mainnet
(the RPC URL and Storage address are set in `wrangler.jsonc`). Override either for local
testing against a different chain/deployment:

```bash
npx wrangler dev --var RPC_URL:http://127.0.0.1:8545 --var STORAGE_ADDRESS:0x...
```

## Deploying

```bash
npm run deploy
```

Requires a Cloudflare account logged in via `npx wrangler login` first. After deploying,
point `cdn.betrhood.com`'s DNS at this Worker in the Cloudflare dashboard — the bare
`betrhood.com` root belongs to the frontend, not this gateway.
