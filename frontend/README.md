# BetRHood Protocol — Frontend

The web app: connect a wallet, upload files, post to the forum, follow people, like and repost,
send end-to-end encrypted DMs, edit your profile. Talks directly to the deployed contracts via
`@betrhood/sdk` — no backend of its own, and none of what follows requires one.

## Pages

- **`/`** — homepage: recently active profiles, the Showcase, the Forum.
- **`/upload`** — upload a file, get a permanent link back.
- **`/view/:address/:key`** — a richer view than the raw gateway link: owner, size, version
  count, inline preview for images/text.
- **`/profile`** / **`/u/:address`** — set (or view) a display name, bio, picture, follower/
  following counts, and posts.
- **`/trending`** — real DEX activity on Robinhood Chain, relayed through the gateway.
- **`/feed`** — the following feed ("Onchain Social"): posts, likes, comments, reposts from
  people you follow.
- **`/messages`** / **`/messages/:address`** — end-to-end encrypted DMs, gated to mutual
  followers.
- **`/agents`** — a machine-readable reference page: contract addresses, RPC, code snippets,
  written for AI agents operating without a browser.
- **`/legal`** — plain-language notices: permanence, encryption's real limits, no company/
  custodian, no warranty.

## Local development

```bash
npm install   # from the repo root — this is an npm workspace
npm run dev --workspace=frontend
```

Wallet connection works immediately via any browser extension (MetaMask, etc.) with zero
config. WalletConnect (QR code / mobile deep link) is optional — see `.env.example`.

## Deploying (the official instance)

Deployed as a Cloudflare Worker with static assets (see `wrangler.jsonc`), via Cloudflare's
Git-connected Workers Builds — push to `main`, it redeploys. Manually: `npm run build`, then
`npm run deploy` (needs `npx wrangler login` first).

## Self-hosting your own copy

This is the part that actually matters: **the whole point of "no backend" is that nobody,
including us, is load-bearing.** `betrhood.com` is one URL pointed at a set of already-deployed,
permanent smart contracts on Robinhood Chain — `sdk/src/addresses.ts` has the addresses, they're
public, verified on Blockscout, and not going anywhere. Anyone can clone this repo, build the
frontend, and host it wherever they want, and it talks to the exact same contracts — the same
forum, the same showcase, the same follow graph, the same encrypted DMs, the same everything.
Nothing forks or duplicates. If `betrhood.com` the domain ever goes away, every post, file, and
follow relationship is still sitting on chain, exactly as permanent as it always was — anyone
can stand up a new frontend pointed at the same addresses and it's the same site, immediately,
with all the same history.

**What self-hosting requires: zero secrets, zero private keys, zero accounts.** This app never
holds custody of anything — every transaction is signed by the *visitor's* own wallet, never by
whoever's hosting the site. There is nothing sensitive to leak, because there's nothing sensitive
here to begin with.

```bash
git clone https://github.com/internetmfer-bit/BetRHood.git
cd BetRHood
npm install
npm run build --workspace=sdk
npm run build --workspace=frontend
```

`frontend/dist/` is now a plain static site — the contract addresses it talks to
(`sdk/src/addresses.ts`) are already baked in at build time, already pointed at mainnet, no
configuration needed. Deploy that folder anywhere that serves static files and rewrites unknown
paths to `index.html` (this is a client-side-routed single-page app):

- **Cloudflare Workers/Pages, Vercel, Netlify** — point them at this repo, root directory
  `frontend`, build command `npm run build --prefix ../sdk && npm run build`, output `dist`.
- **IPFS/Fleek, GitHub Pages, a VPS with nginx, literally anywhere** — `frontend/dist/` is just
  files. Serve them.

Two things are genuinely optional, not required for the site to work:

- **WalletConnect** (`.env.example` → `VITE_WALLETCONNECT_PROJECT_ID`) — only adds the QR-code/
  mobile-deep-link connection option. Everything works with zero config via any injected wallet
  (MetaMask, Rabby, Coinbase Wallet, etc.) without it.
- **The gateway** (`../gateway`) — only needed for raw file links that work with no wallet in a
  plain browser (`gateway.betrhood.com/<address>/<key>`) and for the cached trending-tokens
  proxy. Skip it entirely and the rest of the app — upload, forum, profiles, follow, social
  feed, encrypted DMs — works exactly the same, since those all read/write the chain directly
  through a connected wallet. See `../gateway/README.md` if you want to run your own copy of
  that too — same zero-secrets-required story, described there in detail.

No `PRIVATE_KEY`, no `.env` with anything sensitive in it, nothing to keep secret. The only
thing that could ever go in an environment variable here is a WalletConnect project ID, which
is a public identifier, not a credential.
