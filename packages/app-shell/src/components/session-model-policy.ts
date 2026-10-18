import { createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { SessionManagement } from "@/utils/session-management"
import { sameModelPolicy, type ModelPolicySnapshot, type SubagentModelPolicy } from "./subagent-model-rules"

/** An HTTP snapshot has a local read receipt, never a guessed durable event sequence. */
export function createSessionModelPolicy(input: {
  sessionID: string
  management: Pick<SessionManagement, "getSubagentModels" | "readSubagentModels" | "setSubagentModels">
  readEvent: () => ModelPolicySnapshot | undefined
  owns?: () => boolean
}) {
  const [state, setState] = createStore({
    snapshot: undefined as ModelPolicySnapshot | undefined,
    observation: undefined as string | undefined,
    refreshing: false,
    error: undefined as unknown,
  })
  const life = { active: true, read: 0, pending: undefined as Promise<ModelPolicySnapshot> | undefined }
  onCleanup(() => {
    life.active = false
  })
  const owns = () => life.active && (input.owns?.() ?? true)
  const observation = () => {
    const event = input.readEvent()
    return JSON.stringify(event && [event.timestamp, event.revision, event.policy])
  }
  const refresh = () => {
    if (!owns()) return Promise.reject(new DOMException("", "AbortError"))
    if (life.pending) return life.pending
    setState({ refreshing: true, error: undefined })
    const pending = (async () => {
      while (owns()) {
        const before = observation()
        const current = await input.management.readSubagentModels(input.sessionID)
        if (!owns()) throw new DOMException("", "AbortError")
        // If an event arrived during the read, get again after that observation; neither source carries an ACK sequence.
        if (before !== observation()) continue
        const snapshot = { policy: current.policy, timestamp: current.timestamp, readVersion: ++life.read }
        setState({ snapshot, observation: before })
        return snapshot
      }
      throw new DOMException("", "AbortError")
    })()
      .catch((error: unknown) => {
        if (owns()) setState("error", error)
        throw error
      })
      .finally(() => {
        life.pending = undefined
        if (owns()) setState("refreshing", false)
      })
    life.pending = pending
    return pending
  }
  createEffect(() => {
    const current = input.readEvent()
    const snapshot = state.snapshot
    if (!current || !snapshot || current.timestamp !== snapshot.timestamp) return
    if (sameModelPolicy(current.policy, snapshot.policy) || observation() === state.observation) return
    // Equal timestamps cannot order an event against a revisionless HTTP ACK. Keep the ACK until this read resolves.
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
      if (!owns()) throw new DOMException("", "AbortError")
      await input.management.getSubagentModels(input.sessionID)
      return refresh()
    },
    async write(policy: SubagentModelPolicy) {
      if (!owns()) throw new DOMException("", "AbortError")
      await input.management.setSubagentModels(input.sessionID, policy)
      // A previous read may predate the write. Finish it, then read after the ACK.
      if (life.pending) await life.pending.catch(() => {})
      return refresh()
    },
  }
}
