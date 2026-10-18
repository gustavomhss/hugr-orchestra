// Agents route by their stable id; the display name is presentation only and may be renamed.
export function agentKey(item: { id?: string; name: string }) {
  return item.id ?? item.name
}

// A mention routes by id and shows the label: the server reads `name` as the subagent to call.
export function agentMention(agent: { id?: string; name: string }) {
  return { type: "agent" as const, name: agentKey(agent), content: `@${agent.name}`, start: 0, end: 0 }
}
