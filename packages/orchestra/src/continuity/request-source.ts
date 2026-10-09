export * as RequestSource from "./request-source"

import type { SessionV1 } from "@orchestra/core/v1/session"
import { marker } from "./alias"

/** Actual human requests, never scheduler continuation, delegation returns or compaction control. */
export function actual(message: SessionV1.WithParts) {
  return message.info.role === "user" && !message.parts.some((part) => part.type === "compaction") && message.parts.some((part) => part.type === "file" || part.type === "text" &&
    (marker(part)?.type === "command" || !part.ignored && !part.synthetic && !marker(part) && part.text.trim().length > 0))
}

export function latest(messages: SessionV1.WithParts[], original?: SessionV1.WithParts, sessionID = messages[0]?.info.sessionID) {
  const found = messages.findLast((message) => message.info.sessionID === sessionID && actual(message))
  return original && original.info.sessionID === sessionID && original.parts.every((part) =>
    part.sessionID === sessionID && part.messageID === original.info.id) && actual(original) &&
    (!found || original.info.id === found.info.id || original.info.time.created > found.info.time.created) ? original : found
}

/** Confirmed response to the final member acknowledges preceding real users in the delivered batch. */
export function answered(messages: SessionV1.WithParts[], delivered: readonly string[] = []) {
  return Math.max(-1, ...messages.flatMap((message) => {
    const info = message.info
    return info.role === "assistant" && info.time.completed !== undefined && !info.error
      ? [messages.findIndex((user) => actual(user) && user.info.id === info.parentID)] : []
  }),
    ...delivered.map((id) => messages.findIndex((message) => actual(message) && message.info.id === id)))
}
