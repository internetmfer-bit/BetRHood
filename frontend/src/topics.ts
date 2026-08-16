import { stringToHex } from "viem";

/**
 * Internal structured-data channels — the app writes JSON records here for its own bookkeeping
 * (tracking uploads, showcase entries), not for human discussion. They must never appear in the
 * public Forum topic list or be browsable/postable as a real thread; anyone landing on one via a
 * direct link should see an explanation, not raw JSON and an open reply box.
 */
export const SHOWCASE_TOPIC = "showcase";
export const UPLOADS_TOPIC = "uploads";
export const RESERVED_TOPICS = [SHOWCASE_TOPIC, UPLOADS_TOPIC] as const;

// Message.topic comes back as this same bytes32 encoding — compare against these, not the raw
// strings, when filtering messages already fetched by topic.
export const SHOWCASE_TOPIC_HEX = stringToHex(SHOWCASE_TOPIC, { size: 32 });
export const UPLOADS_TOPIC_HEX = stringToHex(UPLOADS_TOPIC, { size: 32 });
export const RESERVED_TOPIC_HEXES = [SHOWCASE_TOPIC_HEX, UPLOADS_TOPIC_HEX] as const;

export function isReservedTopic(topic: string): boolean {
  return (RESERVED_TOPICS as readonly string[]).includes(topic) || (RESERVED_TOPIC_HEXES as readonly string[]).includes(topic);
}
