import { slackSystem } from "../../capability/providers/slack"
import type { Pulled } from "../types"

export { slackSystem }

const banned = new Set(["huddle", "canvas", "call"])

export function fromSlack(raw: { kind: string; id: string; actor: string; text: string; threadId: string }): Pulled | undefined {
  if (banned.has(raw.kind)) return undefined
  return { source: "slack", externalId: raw.id, actor: raw.actor, snippet: raw.text, threadId: raw.threadId, reply: true }
}
