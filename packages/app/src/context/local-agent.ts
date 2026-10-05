export function hasCustomAgent(items: Array<{ native?: boolean }>) {
  return items.some((item) => item.native === false)
}

// An agent's stable id selects, persists and routes it; `name` is only its display label (F1.11). Servers that
// predate agent ids send only `name`, which is then also the key.
export function agentKey(item: { id?: string; name: string }) {
  return item.id ?? item.name
}

// A mention routes by id and shows the label: the server reads `name` as the subagent to call.
export function agentMention(agent: { id?: string; name: string }) {
  return { type: "agent" as const, name: agentKey(agent), content: `@${agent.name}`, start: 0, end: 0 }
}

export function resolveAgent<T extends { id?: string; name: string }>(items: T[], key?: string) {
  return items.find((item) => agentKey(item) === key) ?? items.find((item) => agentKey(item) === "build") ?? items[0]
}

// An agent picked for one draft (Agents page "Open Chat") shows only in that draft, never in sessions.
export function agentChoiceVisible(input: {
  custom: boolean
  sessionID?: string
  explicitDraft?: string
  draftID?: string
}) {
  if (input.custom) return true
  if (input.sessionID || !input.explicitDraft) return false
  return input.draftID === input.explicitDraft
}
