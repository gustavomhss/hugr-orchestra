import type { SkillSource } from "../types.js"
import type { Hooks } from "./registration.js"

export interface SkillDraft {
  source(source: SkillSource): void
  list(): readonly SkillSource[]
}

export type SkillHooks = Hooks<{
  transform: SkillDraft
}>