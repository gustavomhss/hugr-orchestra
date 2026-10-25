import { createHash } from "node:crypto"
import type { CapabilityConnections } from "../connection"
import type { Send, Update } from "./schema"

/** Versioned fixed-order payload identity; producer/operation remain the stable admission key. */
export function requestHash(input: Send | Update, resolved: CapabilityConnections.Resolution, threadID?: string) {
  return createHash("sha256").update(JSON.stringify([
    "channel-request-v1", input.provider,
    [resolved.connection.id, resolved.connection.provider, resolved.connection.generation],
    [resolved.target.id, resolved.target.connectionID, resolved.target.generation, resolved.target.environment],
    "action" in input ? input.action : "send",
    "text" in input ? input.text : null,
    threadID ?? null,
    "messageID" in input ? input.messageID : null,
    "replyTo" in input ? input.replyTo ?? null : null,
    "emoji" in input ? input.emoji : null,
  ])).digest("hex")
}
