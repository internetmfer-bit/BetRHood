import { execSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const CONTRACTS_DIR = path.resolve(import.meta.dirname, "../../contracts");
const ANVIL_PORT = 8646;
export const ANVIL_RPC = `http://127.0.0.1:${ANVIL_PORT}`;

// Foundry's well-known default Anvil test key — public, zero value, used in every Foundry
// tutorial. Never the real deployer key.
export const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const TEST_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

// Seaport 1.6's canonical address, same on every chain it's deployed to — including Robinhood
// Chain mainnet (see sdk/src/nft.ts's SEAPORT_ADDRESS, the single source of truth for this value
// at runtime; duplicated here as a literal since this file can't import from the SDK it's testing).
const SEAPORT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395";
// Exact runtime bytecode fetched live from Robinhood Chain mainnet (eth_getCode) — seeded via
// anvil_setCode rather than replayed through Seaport's original create2 bootstrap sequence. That
// sequence relies on cheatcodes (vm.etch) that only mutate Foundry's in-process simulation state
// and don't persist against a real external Anvil node driven over RPC, which is how this test
// harness runs anvil — verified empirically. Copying the real runtime bytecode also preserves
// Seaport's compiled-in immutables (domain separator, chain id) exactly as deployed for real.
const SEAPORT_BYTECODE_PATH = path.resolve(import.meta.dirname, "fixtures/seaport-1.6-runtime-bytecode.txt");

export interface TestAddresses {
  storage: `0x${string}`;
  messaging: `0x${string}`;
  profile: `0x${string}`;
  upvote: `0x${string}`;
  follow: `0x${string}`;
  mockerc721: `0x${string}`;
  mockerc1155: `0x${string}`;
  seaport: `0x${string}`;
  mockerc721full: `0x${string}`;
  mockerc1155full: `0x${string}`;
}

let anvil: ChildProcess | undefined;
let started: Promise<TestAddresses> | undefined;

/**
 * Starts one shared Anvil instance + deploys fresh contracts to it, the first time any test
 * file calls this. Subsequent calls (from other test files, same process) reuse the same
 * instance — vitest.config.ts disables file parallelism specifically so this singleton is
 * safe without a port conflict.
 */
export function startChain(): Promise<TestAddresses> {
  if (!started) started = doStart();
  return started;
}

async function doStart(): Promise<TestAddresses> {
  anvil = spawn("anvil", ["--port", String(ANVIL_PORT), "--silent"], { stdio: "ignore" });
  await waitForAnvil();
  await seedSeaportBytecode();

  // Each script reads PRIVATE_KEY via vm.envUint(), so it must be a real env var here — a
  // --private-key CLI flag alone wouldn't satisfy that call.
  const env = { ...process.env, PRIVATE_KEY: TEST_PRIVATE_KEY };
  const scripts = [
    "Deploy.s.sol",
    "DeployUpvote.s.sol",
    "DeployFollow.s.sol",
    "DeployTestFixtures.s.sol",
    "DeploySeaportFixture.s.sol",
  ];
  for (const script of scripts) {
    execSync(`forge script script/${script} --rpc-url ${ANVIL_RPC} --broadcast`, {
      cwd: CONTRACTS_DIR,
      stdio: "pipe",
      env,
    });
  }

  const addresses: Record<string, `0x${string}`> = { seaport: SEAPORT_ADDRESS };
  for (const script of scripts) {
    const broadcastPath = path.join(CONTRACTS_DIR, `broadcast/${script}/31337/run-latest.json`);
    const broadcast = JSON.parse(readFileSync(broadcastPath, "utf-8"));
    for (const tx of broadcast.transactions) {
      if (tx.transactionType === "CREATE") addresses[tx.contractName.toLowerCase()] = tx.contractAddress;
    }
  }

  return addresses as unknown as TestAddresses;
}

async function seedSeaportBytecode(): Promise<void> {
  const code = readFileSync(SEAPORT_BYTECODE_PATH, "utf-8").trim();
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "anvil_setCode", params: [SEAPORT_ADDRESS, code], id: 1 }),
  });
  const body = (await res.json()) as { error?: { message: string } };
  if (body.error) throw new Error(`anvil_setCode failed: ${body.error.message}`);
}

export function stopChain() {
  anvil?.kill();
}

async function waitForAnvil(retries = 50): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(ANVIL_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("anvil did not start in time");
}
