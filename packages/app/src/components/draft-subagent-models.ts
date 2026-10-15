import type { ModelRule } from "./subagent-model-rules"

import { createSignal } from "solid-js"

/** Pending subagent-model selections for drafts (no session exists yet).
    Keyed by directory; flushed into session permission rules right after
    the session is created, before the first prompt is sent — so there is
    no race with the first task call. Entries are tiny bounded sets; they
    are cleared on flush. */
const pending = new Map<string, Set<string>>()

const [version, bumpVersion] = createSignal(0)
/** Reactive clock: read inside memos/render so plain-Set mutations propagate. */
export const draftVersion = version

export const modelKey = (providerID: string, modelID: string) => `${providerID}/${modelID}`

export function pendingSelection(directory: string): Set<string> {
  let set = pending.get(directory)
  if (!set) {
    set = new Set()
    pending.set(directory, set)
  }
  return set
}

export function togglePending(directory: string, providerID: string, modelID: string): boolean {
  const set = pendingSelection(directory)
  const key = modelKey(providerID, modelID)
  let next: boolean
  if (set.has(key)) {
    set.delete(key)
    next = false
  } else {
    set.add(key)
    next = true
  }
  bumpVersion((v) => v + 1)
  return next
}

export function clearPending(directory: string) {
  if (pending.delete(directory)) bumpVersion((v) => v + 1)
}

/** Builds the rule batch for a fresh selection: deny-all baseline plus one
    allow per selected model (server merges, last match wins). */
export function pendingRules(directory: string): ModelRule[] {
  const selected = pendingSelection(directory)
  if (selected.size === 0) return []
  return [
    { permission: "task", pattern: "*/*", action: "deny" as const },
    ...[...selected].map((key): ModelRule => ({ permission: "task", pattern: key, action: "allow" as const })),
  ]
}
