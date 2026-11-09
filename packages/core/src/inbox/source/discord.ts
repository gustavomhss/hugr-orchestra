import type { Pulled } from "../types"

const banned = new Set(["voice", "stage"])

export function fromDiscord(raw: { kind: string; id: string; actor: string; text: string; threadId: string }): Pulled | undefined {
  if (banned.has(raw.kind)) return undefined
  return { source: "discord", externalId: raw.id, actor: raw.actor, snippet: raw.text, threadId: raw.threadId, reply: true }
}
