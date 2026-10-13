import { createMemo, untrack } from "solid-js"
import type { CommandOption, CommandRegistration } from "./command"

export function createCommandRegistration(key: string | undefined, next: () => CommandOption[]) {
  const lifetime = { active: true }
  // Scheduled transitions can publish a registration before its memo first runs.
  // Seed with real options without subscribing the mounting owner to callback dependencies.
  // Invalid callback results still fail at the consumer.
  const memo = createMemo(() => (lifetime.active ? next() : []), untrack(next))
  const options = () => (lifetime.active ? memo() : [])
  const entry: CommandRegistration = { key, options }
  return {
    entry,
    dispose() {
      lifetime.active = false
    },
  }
}
