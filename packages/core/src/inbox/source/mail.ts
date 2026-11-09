import type { Pulled } from "../types"

export function fromMail(raw: { account: "gmail" | "outlook"; id: string; actor: string; text: string; threadId: string }): Pulled {
  return { source: "mail", externalId: raw.id, actor: raw.actor, snippet: raw.text, threadId: raw.threadId, reply: true }
}
