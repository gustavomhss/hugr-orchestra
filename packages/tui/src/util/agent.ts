import { Locale } from "./locale"

// An agent's stable id selects, persists and routes it; `name` is only its display label (F1.11). Servers that predate
// agent ids send only `name`, which is then also the key.
export function agentKey(agent: { id?: string; name: string }) {
  return agent.id ?? agent.name
}

export function findAgent<T extends { id?: string; name: string }>(agents: readonly T[], key: string | undefined) {
  return agents.find((agent) => agentKey(agent) === key)
}

// Messages and Task inputs carry the stable id; render the agent's label when it is known, else the id itself.
export function agentTitle(agents: readonly { id?: string; name: string }[], key: string) {
  return Locale.titlecase(findAgent(agents, key)?.name ?? key)
}

// A mention shows the label in the prompt text and sends the id, which the server reads as the subagent to call.
export function agentMention(agent: { id?: string; name: string }) {
  return {
    text: agent.name,
    part: { type: "agent" as const, name: agentKey(agent), source: { start: 0, end: 0, value: "" } },
  }
}

// An agent as the agent picker lists it: the label is the title, the stable id is the value the selection stores.
export function agentOption(agent: { id?: string; name: string; native?: boolean; description?: string }) {
  return { value: agentKey(agent), title: agent.name, description: agent.native ? "native" : agent.description }
}
