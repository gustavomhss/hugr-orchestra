import type { Pulled } from "../types"

const allowed = new Set(["chat", "channel", "mention"])

export function fromTeams(raw: { kind: string; id: string; actor: string; text: string; threadId: string }): Pulled | undefined {
  if (!allowed.has(raw.kind)) return undefined
  return { source: "teams", externalId: raw.id, actor: raw.actor, snippet: raw.text, threadId: raw.threadId, reply: true }
}
