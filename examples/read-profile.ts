/**
 * Read-only — no wallet, no transaction, just look up someone's profile.
 *
 * Run:
 *   node read-profile.ts 0xSomeAddress
 *
 * With no argument, looks up the address that deployed the contracts (guaranteed to exist
 * on mainnet, though it likely has no name/bio/picture set — that's a fine result too).
 */
import { createPublicClient, http } from "viem";
import { addresses, getBio, getProfile, getProfilePicture, robinhoodChain } from "@betrhood/sdk";

const chain = { ...robinhoodChain, rpcUrls: { default: { http: [process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0]] } } };
const profileAddress = (process.env.PROFILE_ADDRESS as `0x${string}` | undefined) ?? addresses.profile;
const storageAddress = (process.env.STORAGE_ADDRESS as `0x${string}` | undefined) ?? addresses.storage;

const who = (process.argv[2] as `0x${string}` | undefined) ?? "0x3353de8E4877aC8f0612af5C050Db0f62a5a7e63";

const publicClient = createPublicClient({ chain, transport: http() });

async function main() {
  console.log(`Looking up ${who}...`);

  const [profile, bio] = await Promise.all([
    getProfile(publicClient, who, { profileAddress }),
    getBio(publicClient, who, { storageAddress }),
  ]);

  console.log("name:", profile.name || "(not set)");
  console.log("bio:", bio || "(not set)");

  if (profile.hasPicture) {
    const picture = await getProfilePicture(publicClient, who, { profileAddress, storageAddress });
    console.log("picture:", picture ? `${picture.length} bytes` : "(set, but failed to resolve)");
  } else {
    console.log("picture: (not set)");
  }
}

main();
