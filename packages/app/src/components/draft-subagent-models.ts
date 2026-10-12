import { parseModelKey, type ModelRule, type SubagentModelPolicy } from "./subagent-model-rules"

import { createSignal } from "solid-js"

/** Pending selections before a session exists. Callers supply an opaque scope key
    (legacy callers may still use a directory), and own the flush/clear lifecycle. */
const pending = new Map<string, Set<string>>()

const [version, bumpVersion] = createSignal(0)
/** Reactive clock: read inside memos/render so plain-Set mutations propagate. */
export const draftVersion = version

export const modelKey = (providerID: string, modelID: string) => `${providerID}/${modelID}`

export function pendingSelection(directory: string): Set<string> {
  return pending.get(directory) ?? new Set()
}

export function togglePending(directory: string, providerID: string, modelID: string, allow?: boolean): boolean {
  const set = pendingSelection(directory)
  pending.set(directory, set)
  const key = modelKey(providerID, modelID)
  const next = allow ?? !set.has(key)
  if (next) set.add(key)
  if (!next) set.delete(key)
  bumpVersion((v) => v + 1)
  return next
}

export function clearPending(directory: string) {
  if (pending.delete(directory)) bumpVersion((v) => v + 1)
}

export function pendingPolicy(key: string): SubagentModelPolicy {
  const selected = pending.get(key)
  if (!selected) return { mode: "inherit" }
  return {
    mode: "allowlist",
    models: [...selected].flatMap((key) => {
      const model = parseModelKey(key)
      return model ? [{ providerID: model.providerID, id: model.modelID }] : []
    }),
  }
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
