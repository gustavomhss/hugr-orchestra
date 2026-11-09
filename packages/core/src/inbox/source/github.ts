import type { Pulled } from "../types"

export function fromGithub(raw: {
  kind: string
  id: string
  actor: string
  text: string
  threadId: string
  onUserPr?: boolean
}): Pulled | undefined {
  if (raw.kind === "diff") return undefined
  if (raw.kind === "ci" && !raw.onUserPr) return undefined
  if (raw.kind !== "review" && raw.kind !== "mention" && raw.kind !== "ci") return undefined
  return { source: "github", externalId: raw.id, actor: raw.actor, snippet: raw.text, threadId: raw.threadId, reply: true }
}
