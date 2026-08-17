import { createPublicClient, getAddress, http, type Abi } from "viem";
import { describe, expect, it } from "vitest";
import { addresses } from "../src/addresses.js";
import { robinhoodChain } from "../src/chain.js";
import { getVersionCount, resolve } from "../src/storage.js";
import { getProfile } from "../src/profile.js";
import { SEAPORT_ADDRESS } from "../src/nft.js";
import SeaportAbiJson from "../src/abi/Seaport.json" with { type: "json" };

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

  // Ongoing confidence the NFT Store's hardcoded Seaport address/domain assumptions stay
  // correct — SEAPORT_ADDRESS is a canonical, third-party contract this repo doesn't deploy or
  // control, so this is the one place drift would ever be caught.
  it("Seaport 1.6 is live at its canonical address with the expected version and a real ConduitController", async () => {
    const [version, domainSeparator, conduitController] = (await publicClient.readContract({
      address: SEAPORT_ADDRESS,
      abi: SeaportAbiJson as Abi,
      functionName: "information",
    })) as [string, `0x${string}`, `0x${string}`];

    expect(version).toBe("1.6");
    expect(domainSeparator).not.toBe(`0x${"0".repeat(64)}`);
    expect(conduitController.toLowerCase()).toBe("0x00000000f9490004c11cef243f5400493c00ad63");
  });
});
