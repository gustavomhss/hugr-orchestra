import type { Pulled } from "../types"

const banned = new Set(["huddle", "canvas", "call"])
const systemSubtype = new Set([
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "channel_archive",
  "channel_unarchive",
  "group_join",
  "group_leave",
  "group_topic",
  "group_purpose",
  "group_name",
  "group_archive",
  "group_unarchive",
  "pinned_item",
  "unpinned_item",
  "bot_add",
  "bot_remove",
])

export function slackSystem(subtype: string | undefined) {
  return subtype ? systemSubtype.has(subtype) : false
}

export function fromSlack(raw: { kind: string; id: string; actor: string; text: string; threadId: string }): Pulled | undefined {
  if (banned.has(raw.kind)) return undefined
  return { source: "slack", externalId: raw.id, actor: raw.actor, snippet: raw.text, threadId: raw.threadId, reply: true }
}
