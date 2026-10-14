import { createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { SessionManagement } from "@/utils/session-management"
import { sameModelPolicy, type ModelPolicySnapshot, type SubagentModelPolicy } from "./subagent-model-rules"

type PolicyState = {
  snapshot?: ModelPolicySnapshot
  observation?: string
  refreshing: boolean
  error?: unknown
}
type PolicyLifetime = { active: boolean; read: number; pending?: Promise<ModelPolicySnapshot> }

/** HTTP snapshots carry local read receipts, never guessed durable ACK sequences. */
export function createSessionModelPolicy(input: {
  sessionID: string
  management: Pick<SessionManagement, "getSubagentModels" | "readSubagentModels" | "setSubagentModels">
  readEvent: () => ModelPolicySnapshot | undefined
}) {
  const [state, setState] = createStore<PolicyState>({ refreshing: false })
  const life: PolicyLifetime = { active: true, read: 0 }
  onCleanup(() => { life.active = false })
  const observation = () => {
    const event = input.readEvent()
    return JSON.stringify(event && [event.timestamp, event.revision, event.policy])
  }
  const refresh = () => {
    if (!life.active) return Promise.reject(new DOMException("", "AbortError"))
    if (life.pending) return life.pending
    setState({ refreshing: true, error: undefined })
    const pending = (async () => {
      while (life.active) {
        const before = observation()
        const current = await input.management.readSubagentModels(input.sessionID)
        if (!life.active) throw new DOMException("", "AbortError")
        if (before !== observation()) continue
        const snapshot = { policy: current.policy, timestamp: current.timestamp, readVersion: ++life.read }
        setState({ snapshot, observation: before })
        return snapshot
      }
      throw new DOMException("", "AbortError")
    })()
      .catch((error: unknown) => {
        if (life.active) setState("error", error)
        throw error
      })
      .finally(() => {
        life.pending = undefined
        if (life.active) setState("refreshing", false)
      })
    life.pending = pending
    return pending
  }
  createEffect(() => {
    const current = input.readEvent()
    const snapshot = state.snapshot
    if (!current || !snapshot || current.timestamp !== snapshot.timestamp) return
    if (sameModelPolicy(current.policy, snapshot.policy) || observation() === state.observation) return
    // Equal timestamps cannot order an event against a revisionless HTTP ACK.
    void refresh().catch(() => {})
  })
  return {
    state,
    read: (): ModelPolicySnapshot => {
      const current = input.readEvent()
      if (!state.snapshot) return current ?? { policy: { mode: "inherit" } }
      if (current?.timestamp !== undefined && current.timestamp > (state.snapshot.timestamp ?? 0)) return current
      return state.snapshot
    },
    async load() {
      if (!life.active) throw new DOMException("", "AbortError")
      await input.management.getSubagentModels(input.sessionID)
      return refresh()
    },
    async write(policy: SubagentModelPolicy) {
      if (!life.active) throw new DOMException("", "AbortError")
      await input.management.setSubagentModels(input.sessionID, policy)
      // A pre-write read is not the ACK fence. Always read again after it settles.
      if (life.pending) await life.pending.catch(() => {})
      return refresh()
    },
  }
}
