# BetRHood Protocol

Onchain storage and messaging on Robinhood Chain. Upload a file, get a permanent link back.
Post a message, get it back by topic. No IPFS, no pinning, no accounts — your wallet is the
account, the chain is the only persistence layer there is.

Live on Robinhood Chain mainnet (chain ID `4663`):

| Contract | Address |
|---|---|
| Storage | `0xf89fb2197682f0679ABeDE1D61bbc978f2667210` |
| Messaging | `0x5056a342b87CB4e6fCa5A096A3A3b903032EC661` |
| Profile | `0x8dCFBE7BBBe929328129420dA140e0DCC2446C18` |

`betrhood.com` — the website. `cdn.betrhood.com/<address>/<key>` — raw file links (what the
gateway serves; not something you'd normally type by hand, just what upload/viewer links
point at).

## Layout

- **`contracts/`** — Foundry project: `Storage.sol`, `Messaging.sol`, `Profile.sol`. See its
  own README for design notes and deploy instructions.
- **`sdk/`** — `@betrhood/sdk`, the TypeScript client. `upload()`/`resolve()` for files,
  `postMessage()`/`getMessagesByTopic()` for messages, `setName()`/`setBio()`/`setPicture()`
  for profiles. Handles gzip compression and chunking internally.
- **`gateway/`** — Cloudflare Worker (lives at `cdn.betrhood.com`) that turns a link like
  `cdn.betrhood.com/<address>/<key>` into an HTTP response, so anyone can open a link in a
  plain browser with no wallet required. See its own README for local dev and deploy
  instructions.
- **`frontend/`** — the web app (lives at the bare `betrhood.com`): homepage/forum, upload,
  profile, link viewer.
