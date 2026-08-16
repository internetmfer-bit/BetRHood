import { DM_TOPIC } from "@betrhood/sdk";
import { stringToHex } from "viem";

/**
 * Internal structured-data channels — the app writes JSON records here for its own bookkeeping
 * (tracking uploads, showcase entries), not for human discussion. They must never appear in the
 * public Forum topic list or be browsable/postable as a real thread; anyone landing on one via a
 * direct link should see an explanation, not raw JSON and an open reply box.
 */
export const SHOWCASE_TOPIC = "showcase";
export const UPLOADS_TOPIC = "uploads";
// Every profile's feed posts and reposts live here, disambiguated by a `type` field in the
// JSON body — see frontend/src/social.ts. One shared topic rather than one-per-address because
// Messaging.sol topics are capped at 32 bytes and a raw address alone (42 chars) blows that
// budget; per-address filtering happens client-side via the message's `sender` field instead.
export const SOCIAL_TOPIC = "social";
// Encrypted DMs — see @betrhood/sdk's dm.ts. Defined SDK-side (not here) since DM topic
// membership has to be known there for sendDm()/getConversation() to work at all, unlike
// SOCIAL_TOPIC which only the frontend needs to know about, for Forum-listing purposes.
export { DM_TOPIC };
export const RESERVED_TOPICS = [SHOWCASE_TOPIC, UPLOADS_TOPIC, SOCIAL_TOPIC, DM_TOPIC] as const;

// Message.topic comes back as this same bytes32 encoding — compare against these, not the raw
// strings, when filtering messages already fetched by topic.
export const SHOWCASE_TOPIC_HEX = stringToHex(SHOWCASE_TOPIC, { size: 32 });
export const UPLOADS_TOPIC_HEX = stringToHex(UPLOADS_TOPIC, { size: 32 });
export const SOCIAL_TOPIC_HEX = stringToHex(SOCIAL_TOPIC, { size: 32 });
export const DM_TOPIC_HEX = stringToHex(DM_TOPIC, { size: 32 });
export const RESERVED_TOPIC_HEXES = [SHOWCASE_TOPIC_HEX, UPLOADS_TOPIC_HEX, SOCIAL_TOPIC_HEX, DM_TOPIC_HEX] as const;

export function isReservedTopic(topic: string): boolean {
  return (RESERVED_TOPICS as readonly string[]).includes(topic) || (RESERVED_TOPIC_HEXES as readonly string[]).includes(topic);
}
