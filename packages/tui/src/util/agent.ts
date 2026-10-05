// An agent's stable id selects, persists and routes it; `name` is only its display label (F1.11). Servers that predate
// agent ids send only `name`, which is then also the key.
export function agentKey(agent: { id?: string; name: string }) {
  return agent.id ?? agent.name
}

// A mention shows the label in the prompt text and sends the id, which the server reads as the subagent to call.
export function agentMention(agent: { id?: string; name: string }) {
  return {
    text: agent.name,
    part: { type: "agent" as const, name: agentKey(agent), source: { start: 0, end: 0, value: "" } },
  }
}
