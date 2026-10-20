import type { AgentInfo } from "../types.js"
import type { Mutable } from "../mutable.js"

import type { Hooks } from "./registration.js"

export interface AgentDraft {
  list(): readonly Mutable<AgentInfo>[]
  get(id: string): Mutable<AgentInfo> | undefined
  default(id: string | undefined): void
  update(id: string, update: (agent: Mutable<AgentInfo>) => void): void
  remove(id: string): void
}

export type AgentHooks = Hooks<{
  transform: AgentDraft
}>