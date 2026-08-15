import { type Address, isAddress } from "viem";

export interface ParsedLink {
  owner: Address;
  key: string;
}

export class InvalidLinkError extends Error {}

/** Parses a request path shaped like `/<address>/<key>` — the one route this gateway
 * serves. `key` may be URL-encoded (e.g. spaces as %20); this decodes it back. */
export function parseLink(pathname: string): ParsedLink {
  const parts = pathname.split("/").filter((p) => p.length > 0);

  if (parts.length !== 2) {
    throw new InvalidLinkError(`Expected /<address>/<key>, got "${pathname}"`);
  }

  const [addressPart, keyPart] = parts;
  if (!isAddress(addressPart)) {
    throw new InvalidLinkError(`"${addressPart}" is not a valid address`);
  }

  const key = decodeURIComponent(keyPart);
  if (key.length === 0) {
    throw new InvalidLinkError("Key cannot be empty");
  }

  return { owner: addressPart, key };
}
