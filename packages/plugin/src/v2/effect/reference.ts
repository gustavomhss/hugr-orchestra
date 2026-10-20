import type { Reference } from "@orchestra/schema/reference"

type ReferenceGitSource = typeof Reference.GitSource.Encoded
type ReferenceLocalSource = typeof Reference.LocalSource.Encoded
import type { Hooks } from "./registration.js"

export interface ReferenceDraft {
  add(name: string, source: ReferenceLocalSource | ReferenceGitSource): void
  remove(name: string): void
  list(): readonly (readonly [string, ReferenceLocalSource | ReferenceGitSource])[]
}

export type ReferenceHooks = Hooks<{
  transform: ReferenceDraft
}>
