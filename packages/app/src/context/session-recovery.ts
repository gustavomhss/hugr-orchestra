import {
  applySessionManagementEvent,
  decodeSessionManagementEvent,
  mergeSessionManagementInfo,
  type AppSession,
  type SessionManagementEvent,
  type SessionManagementInfo,
} from "@/utils/session"
import { SESSION_MANAGEMENT_FENCE_LIMIT } from "./session-management-state"

/** Server-local snapshot recovery shares request and lifetime ownership with the content cache. */
export function createSessionRecovery(input: {
  requests: Map<string, Promise<AppSession>>
  generations: Map<string, object>
  read: (sessionID: string) => AppSession | undefined
  request: (sessionID: string) => Promise<AppSession>
  source: "canonical" | "snapshot"
  retain: (info: AppSession) => AppSession
  busy: (sessionID: string) => boolean
}) {
  const fences = new Map<string, SessionManagementInfo>()
  const reads = new Map<string, { policyGeneration: object; policy?: SessionManagementInfo }>()
  const local = { receipt: 0 }
  const policySnapshot = (info: SessionManagementInfo): SessionManagementInfo => ({
    id: info.id,
    subagentModels: info.subagentModels,
    subagentModelsChangedAt: info.subagentModelsChangedAt,
    subagentModelsRevision: info.subagentModelsRevision,
    subagentModelsReadReceipt: info.subagentModelsReadReceipt,
    time: { updated: info.time.updated },
  })
  const generation = (sessionID: string) => {
    const current = input.generations.get(sessionID)
    if (current) return current
    const created = {}
    input.generations.set(sessionID, created)
    return created
  }
  const resolve = (sessionID: string, options?: { force?: boolean }, floor?: SessionManagementInfo): Promise<AppSession> => {
    const cached = input.read(sessionID)
    if (cached && !options?.force) return Promise.resolve(cached)
    const pending = input.requests.get(sessionID)
    if (pending) return pending
    const active = generation(sessionID)
    const state = { policyGeneration: {}, policy: floor ?? fences.get(sessionID) ?? cached }
    const request = (): Promise<AppSession> => {
      const policyGeneration = state.policyGeneration
      return input.request(sessionID).then((result) => {
        if (input.generations.get(sessionID) !== active) throw new DOMException("Session recovery superseded", "AbortError")
        if (state.policyGeneration !== policyGeneration) return request()
        const observed = mergeSessionManagementInfo(state.policy,
          mergeSessionManagementInfo(fences.get(sessionID), input.read(sessionID) ?? result))
        // Compatibility SDK snapshots carry no canonical V2 policy provenance.
        if (input.source === "snapshot") return input.retain(mergeSessionManagementInfo(observed, result))
        local.receipt = Math.max(local.receipt, observed.subagentModelsReadReceipt ?? 0) + 1
        return input.retain({
          ...result,
          subagentModelsChangedAt: observed.subagentModelsChangedAt,
          subagentModelsRevision: observed.subagentModelsRevision,
          subagentModelsReadReceipt: local.receipt,
        })
      }, (error: unknown) => {
        if (input.generations.get(sessionID) === active && state.policyGeneration !== policyGeneration) return request()
        throw error
      })
    }
    const resolved = request()
    input.requests.set(sessionID, resolved)
    reads.set(sessionID, state)
    const cleanup = () => {
      if (input.requests.get(sessionID) === resolved) input.requests.delete(sessionID)
      if (reads.get(sessionID) === state) reads.delete(sessionID)
      if (
        input.generations.get(sessionID) === active &&
        !input.read(sessionID) &&
        !input.requests.has(sessionID) &&
        !input.busy(sessionID)
      )
        input.generations.delete(sessionID)
    }
    void resolved.then(cleanup, cleanup)
    return resolved
  }
  return {
    generation,
    resolve,
    forget(sessionID: string) {
      fences.delete(sessionID)
      reads.delete(sessionID)
    },
    merge(next: AppSession): AppSession {
      const pending = input.requests.has(next.id) ? reads.get(next.id) : undefined
      const info = mergeSessionManagementInfo(pending?.policy,
        mergeSessionManagementInfo(fences.get(next.id), mergeSessionManagementInfo(input.read(next.id), next)))
      if (fences.has(next.id)) fences.set(next.id, policySnapshot(info))
      return info
    },
    applyPolicy(event: SessionManagementEvent) {
      const decoded = decodeSessionManagementEvent(event)
      if (!decoded || decoded.type !== "session.next.subagent.models.changed") return
      const sessionID = decoded.properties.sessionID
      const pending = input.requests.has(sessionID) ? reads.get(sessionID) : undefined
      const info = input.read(sessionID)
      const current = mergeSessionManagementInfo(pending?.policy,
        mergeSessionManagementInfo(fences.get(sessionID), info ?? { id: sessionID, time: { updated: 0 } }))
      const next = applySessionManagementEvent(current, decoded)
      if (!next) return
      const canonical = current.subagentModelsReadReceipt !== undefined && next.subagentModels === current.subagentModels
      if (pending) {
        pending.policyGeneration = {}
        pending.policy = policySnapshot(next)
      }
      fences.delete(sessionID)
      fences.set(sessionID, policySnapshot(next))
      const oldest = fences.size > SESSION_MANAGEMENT_FENCE_LIMIT ? fences.keys().next().value : undefined
      const floor = oldest === undefined ? undefined : fences.get(oldest)
      const protectedRead = oldest === undefined || !input.requests.has(oldest) ? undefined : reads.get(oldest)
      if (protectedRead && floor) {
        protectedRead.policyGeneration = {}
        protectedRead.policy = mergeSessionManagementInfo(floor, protectedRead.policy ?? floor)
      }
      // Copy the floor into request ownership before eviction; even a rejected protected GET must retry.
      const recovery = oldest !== undefined && (protectedRead || !input.read(oldest))
        ? resolve(oldest, { force: true }, floor)
        : undefined
      if (oldest !== undefined) fences.delete(oldest)
      const remembered = info ? input.retain({ ...info, ...next, time: { ...info.time, ...next.time } }) : undefined
      if (remembered && !canonical && !pending && !recovery) return
      return Promise.allSettled([
        canonical || pending || !remembered ? resolve(sessionID, { force: true }) : Promise.resolve(remembered),
        ...(recovery ? [recovery] : []),
      ]).then((results) => {
        const rows = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
        const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected" &&
          !(result.reason instanceof DOMException && result.reason.name === "AbortError"))
        results.forEach((result, index) => {
          if (result.status !== "rejected" || (result.reason instanceof DOMException && result.reason.name === "AbortError")) return
          console.error("Failed to recover session policy", { sessionID: index === 0 ? sessionID : oldest, error: result.reason })
        })
        if (!rows.length && failure) throw failure.reason
        return rows
      })
    },
  }
}
