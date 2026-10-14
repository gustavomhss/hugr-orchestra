import { createComputed, createMemo, onCleanup } from "solid-js"
import { pendingSnapshot } from "../draft-subagent-models"
import { sameModelPolicy, type ModelRule, type SubagentModelPolicy } from "../subagent-model-rules"
import type { SessionManagement } from "@/utils/session-management"
import { SessionManagementUnsupported } from "@/utils/session-management-errors"
import type { ServerProtocol } from "@/utils/server-protocol"

/** Departure permanently invalidates an attempt, even when its owner later returns. */
export function createSubmissionOwner<T extends Record<string, unknown>>(read: () => T) {
  const identity = createMemo(read, undefined, {
    equals: (left, right) => !!left && Object.keys(right).every((key) => left[key] === right[key]),
  })
  const state = { generation: 0, disposed: false, handoff: undefined as ((next: T) => boolean) | undefined }
  createComputed(() => {
    const next = identity()
    if (!state.handoff?.(next)) state.generation++
    state.handoff = undefined
  })
  onCleanup(() => { state.disposed = true; state.generation++; state.handoff = undefined })
  return {
    capture() {
      const generation = state.generation
      return {
        current: () => !state.disposed && state.generation === generation,
        handoff: (accept?: (next: T) => boolean) => { state.handoff = accept },
      }
    },
    disposed: () => state.disposed,
  }
}

/** Each revision, including same-policy and inheritance ABA, needs its own receipt. */
export async function acknowledgeDraftPolicy(input: {
  key: string
  current: () => boolean
  write: (policy: SubagentModelPolicy) => Promise<SubagentModelPolicy>
  wait: () => Promise<unknown>
  written: () => boolean
  markWritten: () => void
  failedMessage: string
}) {
  while (input.current()) {
    const snapshot = pendingSnapshot(input.key)
    await input.wait()
    if (!input.current()) return
    if (pendingSnapshot(input.key).revision !== snapshot.revision) continue
    if (snapshot.revision > 0 || input.written()) {
      input.markWritten()
      const acknowledged = await input.write(snapshot.policy)
      if (!sameModelPolicy(acknowledged, snapshot.policy)) throw new Error(input.failedMessage)
    }
    await input.wait()
    if (!input.current()) return
    if (pendingSnapshot(input.key).revision !== snapshot.revision) continue
    return snapshot
  }
}

/** The actual SDK barrier retains failed writes and follows writes queued behind them. */
export function createSubmissionPolicy(input: {
  key: string
  sessionID: string
  protocol: Promise<ServerProtocol>
  management: Pick<SessionManagement, "setSubagentModels" | "readSubagentModels"> & {
    waitSubagentModels?: (id: string) => Promise<void>
  }
  legacyWrite: (permission: ModelRule[]) => Promise<unknown>
  admission: { policyWritten?: boolean; legacyOverrideAcknowledged?: boolean }
  current: () => boolean
  initialPolicy?: SubagentModelPolicy
  failedMessage: string
}) {
  const expected = { policy: input.initialPolicy }
  const wait = async (signal: AbortSignal) => {
    if (!input.current() || signal.aborted) return false
    if ((await waitForSubmission(input.protocol, signal)) === "v2") {
      if (!input.management.waitSubagentModels) throw new SessionManagementUnsupported()
      await waitForSubmission(input.management.waitSubagentModels(input.sessionID), signal)
      if (expected.policy) {
        const canonical = await waitForSubmission(input.management.readSubagentModels(input.sessionID), signal)
        if (!sameModelPolicy(canonical.policy, expected.policy)) throw new Error(input.failedMessage)
      }
    }
    return input.current() && !signal.aborted
  }
  return {
    wait,
    acknowledge: (signal: AbortSignal) => acknowledgeDraftPolicy({
      key: input.key,
      current: () => input.current() && !signal.aborted,
      written: () => input.admission.policyWritten === true,
      markWritten: () => { input.admission.policyWritten = true },
      failedMessage: input.failedMessage,
      wait: () => wait(signal),
      write: async (policy) => {
        if ((await waitForSubmission(input.protocol, signal)) === "v2") {
          const acknowledged = await input.management.setSubagentModels(input.sessionID, policy)
          expected.policy = acknowledged
          return acknowledged
        }
        if (policy.mode === "inherit") {
          if (input.admission.legacyOverrideAcknowledged) throw new SessionManagementUnsupported()
          return policy
        }
        await input.legacyWrite([
          { permission: "task", pattern: "*/*", action: "deny" },
          ...policy.models.map((model): ModelRule => ({ permission: "task", pattern: `${model.providerID}/${model.id}`, action: "allow" })),
        ])
        input.admission.legacyOverrideAcknowledged = true
        return policy
      },
    }),
  }
}

export async function waitForSubmission<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  const cancelled = Promise.withResolvers<never>()
  const abort = () => cancelled.reject(signal.reason)
  signal.addEventListener("abort", abort, { once: true })
  return Promise.race([operation, cancelled.promise]).finally(() => signal.removeEventListener("abort", abort))
}
