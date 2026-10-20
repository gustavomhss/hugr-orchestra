import type { Agent } from "@orchestra/schema/agent"
import type { Mutable } from "../mutable.js"

type AgentV2Info = typeof Agent.Info.Encoded
import type { Hooks } from "./registration.js"

export interface AgentDraft {
  list(): readonly Mutable<AgentV2Info>[]
  get(id: string): Mutable<AgentV2Info> | undefined
  default(id: string | undefined): void
  update(id: string, update: (agent: Mutable<AgentV2Info>) => void): void
  remove(id: string): void
}

export type AgentHooks = Hooks<{
  transform: AgentDraft
}>
