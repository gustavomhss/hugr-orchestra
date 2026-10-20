import type { Command } from "@orchestra/schema/command"
import type { Mutable } from "../mutable.js"

type CommandV2Info = typeof Command.Info.Encoded
import type { Hooks } from "./registration.js"

export interface CommandDraft {
  list(): readonly CommandV2Info[]
  get(name: string): CommandV2Info | undefined
  update(name: string, update: (command: Mutable<CommandV2Info>) => void): void
  remove(name: string): void
}

export type CommandHooks = Hooks<{
  transform: CommandDraft
}>
