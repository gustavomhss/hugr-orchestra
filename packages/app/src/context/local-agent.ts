export function hasCustomAgent(items: Array<{ native?: boolean }>) {
  return items.some((item) => item.native === false)
}

export function resolveAgent<T extends { name: string }>(items: T[], name?: string) {
  return items.find((item) => item.name === name) ?? items.find((item) => item.name === "build") ?? items[0]
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
