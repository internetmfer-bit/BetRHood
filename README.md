# BetRHood Protocol

Onchain storage and messaging on Robinhood Chain. Upload a file, get a permanent link back.
Post a message, get it back by topic. No IPFS, no pinning, no accounts — your wallet is the
account, the chain is the only persistence layer there is. A public follow graph, upvotes, and
a following feed with likes/comments/reposts are all built as conventions on top of the same
two primitives — no separate "social" contract.

Live on Robinhood Chain mainnet (chain ID `4663`):

| Contract | Address |
|---|---|
| Storage | `0xf89fb2197682f0679ABeDE1D61bbc978f2667210` |
| Messaging | `0x5056a342b87CB4e6fCa5A096A3A3b903032EC661` |
| Profile | `0x8dCFBE7BBBe929328129420dA140e0DCC2446C18` |
| Upvote | `0x861F6738B14af796421109FA6De227ab11367FBa` |
| Follow | `0xC1b85b733b6484a4d82c5C2d821085eE08038453` |

`betrhood.com` — the website. `gateway.betrhood.com/<address>/<key>` — raw file links (what
the gateway serves; not something you'd normally type by hand, just what upload/viewer links
point at).

## Layout

- **`contracts/`** — Foundry project: `Storage.sol`, `Messaging.sol`, `Profile.sol`,
  `Upvote.sol`, `Follow.sol`. See its own README for design notes and deploy instructions.
- **`sdk/`** — `@betrhood/sdk`, the TypeScript client. `upload()`/`resolve()` for files,
  `postMessage()`/`getMessagesByTopic()` for messages, `setName()`/`setBio()`/`setPicture()`
  for profiles, `upvote()` for voting, `follow()`/`getFollowing()` for the follow graph. Handles
  gzip compression and chunking internally. See its own README for the full API, including the
  social feed's topic/JSON conventions (built on Messaging + Upvote, no separate contract).
- **`gateway/`** — Cloudflare Worker (lives at `gateway.betrhood.com`) that turns a link like
  `gateway.betrhood.com/<address>/<key>` into an HTTP response, so anyone can open a link in
  a plain browser with no wallet required, plus a cached proxy for trending token data. See its
  own README for local dev and deploy instructions.
- **`frontend/`** — the web app (lives at the bare `betrhood.com`): homepage/forum, upload,
  profile with a follow graph and posts feed, showcase, trending tokens, and a following-feed
  "Onchain Social" tab, plus a link viewer and an agent-readable reference page.
