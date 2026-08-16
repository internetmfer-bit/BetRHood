# @betrhood/sdk

TypeScript client for BetRHood Protocol — onchain storage and messaging on Robinhood Chain.
Wraps the three deployed contracts (`Storage`, `Messaging`, `Profile`) with a small,
[viem](https://viem.sh)-based API. Handles gzip compression and chunking for you; you never
touch raw contract calls unless you want to.

No backend, no API key, no account to create — a viem `PublicClient` for reads and a
`WalletClient` for writes is all this needs. If you're in a browser app, [wagmi](https://wagmi.sh)
gives you both directly (`usePublicClient()` / `useWalletClient()`).

## Install

```bash
npm install @betrhood/sdk viem
```

## Quickstart

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { robinhoodChain, upload, resolve } from "@betrhood/sdk";

const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
const walletClient = createWalletClient({
  chain: robinhoodChain,
  transport: custom(window.ethereum), // or any EIP-1193 provider
});
const [account] = await walletClient.requestAddresses();

// Upload a file, get a permanent link back
const data = new TextEncoder().encode("hello, chain");
await upload(publicClient, walletClient, "hello.txt", data);

// Anyone can read it back — no wallet needed for this half
const bytes = await resolve(publicClient, account, "hello.txt");
console.log(new TextDecoder().decode(bytes)); // "hello, chain"
```

See [`examples/`](../examples) for more, including messaging and profiles.

## Core concepts

- **Your wallet is your account.** There's no signup. `upload()`/`postMessage()`/`setName()`
  etc. write to `Storage`/`Messaging`/`Profile` keyed to whatever address signs the
  transaction — that's the whole identity model.
- **Two primitives.** `Storage` holds files (versioned, chunked automatically for anything
  over 20KB). `Messaging` holds short posts, indexed by topic and by sender. Profiles are
  built entirely out of these two — a display name is a small write, a bio and a picture are
  both just files stored under well-known keys (see below).
- **Keys are strings, chunking is automatic.** Every `Storage` key is a string you choose
  (`"avatar.png"`, `"my-post"`, whatever) — the SDK hashes it to the `bytes32` the contract
  actually uses, and gzips + splits the data into ≤20KB chunks if it needs to. You never see
  any of that.
- **Reserved keys for profiles.** `setPicture()` writes to `Storage` under the fixed key
  `betrhood:profile-picture` (address-scoped, so it's really `(you, "betrhood:profile-picture")`);
  `setBio()` uses `betrhood:profile-bio`. These are conventions, not contract rules — anyone
  using this SDK finds anyone else's picture/bio the same way.

## API reference

### Chain & addresses

```ts
import { robinhoodChain, addresses } from "@betrhood/sdk";
```

- **`robinhoodChain`** — a viem `Chain` object for Robinhood Chain mainnet (chain ID `4663`),
  ready to pass to `createPublicClient`/`createWalletClient`.
- **`addresses`** — `{ storage, messaging, profile }`, the three deployed contract addresses.
  Every function below defaults to these; pass an `...Address` option to override (e.g. for
  testing against a local deployment).

### Storage — files

```ts
upload(publicClient, walletClient, key: string, data: Uint8Array, options?: { storageAddress?: Address })
  => Promise<{ version: bigint; txHash: Hex }>
```
Gzips and chunks `data` automatically, writes it under `key` owned by the connected wallet.
Throws `EmptyDataError` if `data` is empty.

```ts
resolve(publicClient, owner: Address, key: string, options?: { storageAddress?: Address })
  => Promise<Uint8Array>
```
Reads the latest version back and decompresses it. Returns an empty `Uint8Array` if nothing
was ever written to this `(owner, key)` — not an error.

```ts
getVersionCount(publicClient, owner: Address, key: string, options?: { storageAddress?: Address })
  => Promise<bigint>
```
How many times `key` has been written by `owner`. `0n` if never.

### Messaging — topics and posts

```ts
interface Message { sender: Address; topic: Hex; body: Uint8Array; timestamp: bigint }
```

```ts
postMessage(publicClient, walletClient, topic: string, body: Uint8Array | string, options?: { messagingAddress?: Address })
  => Promise<{ messageId: bigint; txHash: Hex }>
```
Posts `body` under `topic`. Unlike `upload()`, this is **not** compressed — messages are meant
to be short. `sender` on the resulting `Message` is always `msg.sender`; there's no way to post
"on behalf of" another address, by design. Throws `EmptyBodyError` if `body` is empty.
Topics longer than 32 bytes get silently truncated by the underlying encoding — keep them
short and human-readable (`"chess:game-2481"`, not a paragraph).

```ts
getMessage(publicClient, messageId: bigint, options?: { messagingAddress?: Address }) => Promise<Message>
getMessageCount(publicClient, options?: { messagingAddress?: Address }) => Promise<bigint>
```
`getMessageCount()` is the total across every topic and sender — useful for building a global
"recent activity" feed by walking backwards from the latest ID.

```ts
getMessagesByTopic(publicClient, topic: string, options?: { messagingAddress?: Address }) => Promise<Message[]>
getMessagesBySender(publicClient, sender: Address, options?: { messagingAddress?: Address }) => Promise<Message[]>
```
Everything under a topic, or everything one address has posted — oldest first, via the
contract's own indexes (not a scan).

### Profile — name, bio, picture

```ts
interface Profile { name: string; pictureKey: Hex; hasPicture: boolean }
```

```ts
setName(publicClient, walletClient, name: string, options?: { profileAddress?: Address }) => Promise<Hex>
```
Throws `NameTooLongError` if `name` is over the contract's `MAX_NAME_LENGTH` (32 bytes) —
checked before ever sending a transaction.

```ts
setBio(publicClient, walletClient, bio: string, options?: { storageAddress?: Address }) => Promise<Hex>
getBio(publicClient, who: Address, options?: { storageAddress?: Address }) => Promise<string>
```
Bio lives entirely in `Storage` (see "reserved keys" above) — there's no bio field on the
`Profile` contract itself. Max 280 bytes; throws `BioTooLongError` past that. `getBio()`
returns `""` if never set.

```ts
setPicture(publicClient, walletClient, picture: Uint8Array, options?: { profileAddress?: Address; storageAddress?: Address })
  => Promise<{ uploadTxHash: Hex; profileTxHash: Hex }>
```
Uploads `picture` through the normal `Storage` path, then points the `Profile` contract at
it — two transactions.

```ts
getProfile(publicClient, who: Address, options?: { profileAddress?: Address }) => Promise<Profile>
getProfilePicture(publicClient, who: Address, options?: { profileAddress?: Address; storageAddress?: Address })
  => Promise<Uint8Array | null>
```
`getProfilePicture()` returns `null` (not empty bytes) if no picture is set — it checks
`hasPicture` first rather than just trying to resolve and getting back nothing, so a `null`
here is unambiguous.

### Upvote — voting, open or NFT-gated

```ts
interface AllowedCollection { collection: Address; standard: "ERC721" | "ERC1155"; tokenId: bigint }
```

One vote per address per message, via either (or both, independently) of two paths the owner
controls: **open voting** — no NFT required, when enabled — and **NFT-gated voting** — anyone
holding a token from an owner-allowlisted collection can vote. There's no fixed cap on how many
collections can be allowlisted, and the check is a single `balanceOf` call — the voter names
which allowlisted collection they're using, rather than the contract scanning the whole list.

```ts
upvote(publicClient, walletClient, messageId: bigint, collection?: Address, options?: { upvoteAddress?: Address })
  => Promise<Hex>
```
Casts one vote for `messageId`. Omit `collection` to vote via open voting (throws
`OpenVotingDisabledError` if the owner hasn't turned it on). Pass a collection address to
instead prove eligibility by holding a qualifying token from it — it must be currently
allowlisted, and the caller must hold a token from it, or this throws `CollectionNotAllowedError`
/ `NoBalanceError`. Either path throws `AlreadyVotedError` on a repeat vote — one vote per
address per message, not per NFT held, and not per path (can't open-vote and NFT-vote the same
message).

```ts
isOpenVotingEnabled(publicClient, options?: { upvoteAddress?: Address }) => Promise<boolean>
setOpenVoting(publicClient, walletClient, enabled: boolean, options?: { upvoteAddress?: Address }) => Promise<Hex>
```
`setOpenVoting()` is owner-only. Independent of the collection allowlist — turning it off
doesn't affect NFT-gated voting, and vice versa.

```ts
getUpvoteCount(publicClient, messageId: bigint, options?: { upvoteAddress?: Address }) => Promise<bigint>
hasVoted(publicClient, messageId: bigint, voter: Address, options?: { upvoteAddress?: Address }) => Promise<boolean>
```

```ts
getAllowedCollections(publicClient, options?: { upvoteAddress?: Address })
  => Promise<(AllowedCollection & { allowed: boolean })[]>
```
Every collection ever allowlisted, including ones since removed (`allowed: false`) — filter on
`allowed` for the active set.

```ts
allowCollection721(publicClient, walletClient, collection: Address, options?: { upvoteAddress?: Address }) => Promise<Hex>
allowCollection1155(publicClient, walletClient, collection: Address, tokenId: bigint, options?: { upvoteAddress?: Address }) => Promise<Hex>
removeCollection(publicClient, walletClient, collection: Address, options?: { upvoteAddress?: Address }) => Promise<Hex>
```
Owner-only (the wallet that deployed `Upvote`) — reverts otherwise. ERC-1155 collections gate on
one specific `tokenId` (e.g. a particular badge), since ERC-1155 has no "any token in this
collection" concept the way ERC-721's `balanceOf` does.

### Utilities

- **`toKey(key: string): Hex`** — the exact keccak256 hashing `upload()`/`resolve()` use
  internally. You don't need this for normal use; it's exposed for anyone building lower-level
  tooling that talks to `Storage` directly.
- **`gzip(data)` / `gunzip(data)`** — the compression `upload()`/`resolve()` use, built on the
  native `CompressionStream`/`DecompressionStream` Web APIs (no dependency, works in Node 18+,
  browsers, and Cloudflare Workers alike).
- **`splitIntoChunks(data, chunkSize?)` / `joinChunks(chunks)`** — the chunking `upload()` uses.
  `CHUNK_SIZE` (20,000 bytes) is the default and matches what the deployed `Storage` contract
  expects.

## License

MIT.
