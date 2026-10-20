import type { CommandInfo } from "../types.js"
import type { Mutable } from "../mutable.js"

import type { Hooks } from "./registration.js"

export interface CommandDraft {
  list(): readonly CommandInfo[]
  get(name: string): CommandInfo | undefined
  update(name: string, update: (command: Mutable<CommandInfo>) => void): void
  remove(name: string): void
}

export type CommandHooks = Hooks<{
  transform: CommandDraft
}>