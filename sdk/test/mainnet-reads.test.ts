import { createPublicClient, getAddress, http } from "viem";
import { describe, expect, it } from "vitest";
import { addresses } from "../src/addresses.js";
import { robinhoodChain } from "../src/chain.js";
import { getVersionCount, resolve } from "../src/storage.js";
import { getProfile } from "../src/profile.js";

// Reads only — no gas, no risk — run directly against the real deployed mainnet contracts to
// confirm the SDK actually talks to what's live, not just a local simulation.
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });

describe("live mainnet reads", () => {
  it("resolve() on a never-written key returns empty bytes", async () => {
    const random = getAddress("0x00000000000000000000000000000000000000f1");
    const result = await resolve(publicClient, random, `sdk-smoke-test-${Date.now()}`);
    expect(result.length).toBe(0);
  });

  it("getVersionCount for an untouched key is 0", async () => {
    const random = getAddress("0x00000000000000000000000000000000000000f2");
    const count = await getVersionCount(publicClient, random, `sdk-smoke-test-${Date.now()}`);
    expect(count).toBe(0n);
  });

  it("getProfile for an address that never set one comes back empty", async () => {
    const random = getAddress("0x00000000000000000000000000000000000000f3");
    const profile = await getProfile(publicClient, random);
    expect(profile.name).toBe("");
    expect(profile.hasPicture).toBe(false);
  });

  it("addresses module points at the real deployed contracts", () => {
    expect(addresses.storage).toBe("0xf89fb2197682f0679ABeDE1D61bbc978f2667210");
    expect(addresses.messaging).toBe("0x5056a342b87CB4e6fCa5A096A3A3b903032EC661");
    expect(addresses.profile).toBe("0x8dCFBE7BBBe929328129420dA140e0DCC2446C18");
  });
});
