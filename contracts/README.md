# BetRHood Protocol — Contracts

Onchain storage and messaging on Robinhood Chain. Two primitives:

- **`Storage.sol`** — permanent, versioned key-value storage. Small files write directly;
  larger ones are split into chunks by the caller (SDK) before writing. Every write uses
  [SSTORE2](https://github.com/Vectorized/solady/blob/main/src/utils/SSTORE2.sol) (data
  stored as contract bytecode) instead of `SSTORE`, since it's dramatically cheaper for
  anything bigger than a few words.
- **`Messaging.sol`** — permanent, indexed message log. Anyone can post; every message is
  indexed by topic and by sender, so reads are direct index lookups, not scans. This is the
  base primitive — profiles, threads, and anything built later are conventions on top of
  `topic` and `body`, not separate systems.
- **`Profile.sol`** — optional display name + picture per address. The picture's bytes live
  in `Storage` under the same address; this contract just remembers which key to look at.
- **`Upvote.sol`** — one upvote per address per message, gated behind holding a token from an
  owner-allowlisted ERC-721 or ERC-1155 collection. The allowlist is unbounded; the voter names
  which allowlisted collection they're voting with, so eligibility is one `balanceOf` call
  rather than a scan over every allowlisted collection.

No contract here does deletion. Nothing is pinned or garbage-collected — the chain itself is
the persistence layer.

## Setup

```bash
forge install   # pulls forge-std + solady
forge build
forge test
```

## Deploying

Deploying straight to Robinhood Chain **mainnet** — there's no testnet rehearsal in this
project's plan, so `forge test` passing cleanly is the only safety net before a deploy.
Chain ID `4663`, RPC aliases are set in `foundry.toml`.

```bash
cp .env.example .env   # fill in PRIVATE_KEY yourself — never share it, never commit .env

# Dry run first — simulates against real chain state, spends nothing:
forge script script/Deploy.s.sol --rpc-url robinhood_mainnet

# Only once the dry run looks right:
forge script script/Deploy.s.sol --rpc-url robinhood_mainnet --broadcast --verify
```

Record the deployed addresses somewhere durable once live — they're referenced by the SDK,
gateway, and frontend.

## Design notes

- **No spoofable sender field.** `Messaging.post()` always attributes to `msg.sender`. There
  is deliberately no "post on behalf of another address" parameter — that would make every
  index built on `sender` untrustworthy.
- **Chunking is caller-side.** Contracts don't compress or split data; the SDK does that
  before calling `Storage.write()`. Contracts just store what they're given, in order.
- **Vanilla EVM Solidity, no Robinhood-specific precompiles** — redeployable to another
  Arbitrum Orbit / EVM chain without a rewrite if that's ever needed.
