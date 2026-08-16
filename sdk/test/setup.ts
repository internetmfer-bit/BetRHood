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

export interface TestAddresses {
  storage: `0x${string}`;
  messaging: `0x${string}`;
  profile: `0x${string}`;
  upvote: `0x${string}`;
  mockerc721: `0x${string}`;
  mockerc1155: `0x${string}`;
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

  // Each script reads PRIVATE_KEY via vm.envUint(), so it must be a real env var here — a
  // --private-key CLI flag alone wouldn't satisfy that call.
  const env = { ...process.env, PRIVATE_KEY: TEST_PRIVATE_KEY };
  for (const script of ["Deploy.s.sol", "DeployUpvote.s.sol", "DeployTestFixtures.s.sol"]) {
    execSync(`forge script script/${script} --rpc-url ${ANVIL_RPC} --broadcast`, {
      cwd: CONTRACTS_DIR,
      stdio: "pipe",
      env,
    });
  }

  const addresses: Record<string, `0x${string}`> = {};
  for (const script of ["Deploy.s.sol", "DeployUpvote.s.sol", "DeployTestFixtures.s.sol"]) {
    const broadcastPath = path.join(CONTRACTS_DIR, `broadcast/${script}/31337/run-latest.json`);
    const broadcast = JSON.parse(readFileSync(broadcastPath, "utf-8"));
    for (const tx of broadcast.transactions) {
      if (tx.transactionType === "CREATE") addresses[tx.contractName.toLowerCase()] = tx.contractAddress;
    }
  }

  return addresses as unknown as TestAddresses;
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
