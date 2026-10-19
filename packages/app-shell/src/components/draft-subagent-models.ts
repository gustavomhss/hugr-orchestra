import { toggleModelPolicy, type ModelRule, type SubagentModelPolicy } from "./subagent-model-rules"
import { createStore } from "solid-js/store"

/** Pending selections before a session exists. Callers supply an opaque scope key
    (legacy callers may still use a directory), and own the flush/clear lifecycle. */
const pending = new Map<string, { revision: number; policy: SubagentModelPolicy }>()

const [state, setState] = createStore({ version: 0 })
/** Reactive clock: read inside memos/render so plain-Set mutations propagate. */
export const draftVersion = () => state.version

export const modelKey = (providerID: string, modelID: string) => `${providerID}/${modelID}`

export function pendingSelection(directory: string): Set<string> {
  const policy = pendingPolicy(directory)
  return new Set(policy.mode === "allowlist" ? policy.models.map((model) => modelKey(model.providerID, model.id)) : [])
}

export function togglePending(directory: string, providerID: string, modelID: string, allow?: boolean): boolean {
  const key = modelKey(providerID, modelID)
  const next = allow ?? !pendingSelection(directory).has(key)
  pending.set(directory, {
    revision: state.version + 1,
    policy: toggleModelPolicy(pendingPolicy(directory), providerID, modelID, next),
  })
  setState("version", (version) => version + 1)
  return next
}

export function clearPending(directory: string, revision?: number) {
  if (revision === undefined) {
    pending.set(directory, { revision: state.version + 1, policy: { mode: "inherit" } })
    setState("version", (version) => version + 1)
    return true
  }
  if (pendingSnapshot(directory).revision !== revision) return false
  if (pending.delete(directory)) setState("version", (version) => version + 1)
  return true
}

/** Puts back an allowlist saved with the draft after a reload. It counts as a fresh edit, so the first send writes it
    to the new Session, and a selection made since the composer mounted wins over the saved one. */
export function restorePending(key: string, saved: SubagentModelPolicy) {
  if (saved.mode !== "allowlist" || !Array.isArray(saved.models) || pending.has(key)) return false
  // Saved data is plain JSON from storage: keep only well-formed entries, as fresh objects.
  const models = saved.models.flatMap((model) =>
    typeof model?.providerID === "string" && typeof model.id === "string" ? [{ providerID: model.providerID, id: model.id }] : [],
  )
  pending.set(key, { revision: state.version + 1, policy: { mode: "allowlist", models } })
  setState("version", (version) => version + 1)
  return true
}

export function pendingPolicy(key: string): SubagentModelPolicy {
  draftVersion()
  return structuredClone(pending.get(key)?.policy ?? { mode: "inherit" })
}

export function pendingSnapshot(key: string) {
  return { revision: pending.get(key)?.revision ?? 0, policy: pendingPolicy(key) }
}

/** Builds the rule batch for a fresh selection: deny-all baseline plus one
    allow per selected model (server merges, last match wins). */
export function pendingRules(directory: string): ModelRule[] {
  const policy = pendingPolicy(directory)
  if (policy.mode === "inherit") return []
  return [
    { permission: "task", pattern: "*/*", action: "deny" as const },
    ...policy.models.map((model): ModelRule => ({ permission: "task", pattern: modelKey(model.providerID, model.id), action: "allow" })),
  ]
}
