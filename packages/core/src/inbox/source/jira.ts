import type { Pulled } from "../types"

const allowed = new Set(["issue", "mention", "comment"])

export function fromJira(raw: { kind: string; id: string; actor: string; text: string; threadId: string }): Pulled | undefined {
  if (!allowed.has(raw.kind)) return undefined
  return { source: "jira", externalId: raw.id, actor: raw.actor, snippet: raw.text, threadId: raw.threadId, reply: true }
}
