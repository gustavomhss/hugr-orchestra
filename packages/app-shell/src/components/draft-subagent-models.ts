import { toggleModelPolicy, type ModelRule, type SubagentModelPolicy } from "./subagent-model-rules"
import { createStore } from "solid-js/store"

/** Source-scoped draft keys survive destination-worktree creation and failed writes. */
const pending = new Map<string, { revision: number; policy: SubagentModelPolicy }>()
const [state, setState] = createStore({ version: 0 })
export const draftVersion = () => state.version

export const modelKey = (providerID: string, modelID: string) => `${providerID}/${modelID}`

export function pendingPolicy(key: string): SubagentModelPolicy {
  draftVersion()
  return pending.get(key)?.policy ?? { mode: "inherit" }
}

export function pendingSnapshot(key: string) {
  return { revision: pending.get(key)?.revision ?? 0, policy: pendingPolicy(key) }
}

/** Reading a draft never turns inherited policy into an explicit deny-all. */
export function pendingSelection(key: string): Set<string> {
  const policy = pendingPolicy(key)
  return new Set(policy.mode === "allowlist" ? policy.models.map((model) => modelKey(model.providerID, model.id)) : [])
}

export function togglePending(key: string, providerID: string, modelID: string, allow?: boolean): boolean {
  const next = allow ?? !pendingSelection(key).has(modelKey(providerID, modelID))
  pending.set(key, {
    revision: state.version + 1,
    policy: toggleModelPolicy(pendingPolicy(key), providerID, modelID, next),
  })
  setState("version", (version) => version + 1)
  return next
}

/** Revision-qualified clear is an ACK fence; unqualified clear explicitly restores inheritance. */
export function clearPending(key: string, revision?: number) {
  if (revision === undefined) {
    pending.set(key, { revision: state.version + 1, policy: { mode: "inherit" } })
    setState("version", (version) => version + 1)
    return true
  }
  if (pendingSnapshot(key).revision !== revision) return false
  if (pending.delete(key)) setState("version", (version) => version + 1)
  return true
}

/** Builds the rule batch for a fresh selection: deny-all baseline plus one
    allow per selected model (server merges, last match wins). */
export function pendingRules(key: string): ModelRule[] {
  const policy = pendingPolicy(key)
  if (policy.mode === "inherit") return []
  return [
    { permission: "task", pattern: "*/*", action: "deny" },
    ...policy.models.map((model): ModelRule => ({ permission: "task", pattern: modelKey(model.providerID, model.id), action: "allow" })),
  ]
}
