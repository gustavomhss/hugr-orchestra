import type { LiveRecoveryAction, LiveRecoverySnapshot } from "@orchestra/app/live"
import type { DeliveryFailureReason, DeliverySnapshot, LiveDeliveryCompletion, LiveDeliveryConnection, LiveDeliveryManager, LiveDeliveryProducer } from "./live-delivery-contract.ts"
import { LiveDeliveryError, deliveryReason } from "./live-delivery-error.ts"
import { createLiveDeliveryManager } from "./live-delivery-manager.ts"
import type { LiveDeliveryOwner, LiveDeliveryOwnerOptions } from "./live-delivery-owner-contract.ts"
import { deliveryConnection, isLocalID, sameConnection } from "./live-delivery-values.ts"
import { openLiveOutbox } from "./live-outbox.ts"

export function createLiveDeliveryOwner(options: LiveDeliveryOwnerOptions): LiveDeliveryOwner {
  const listeners = new Set<(completion: LiveDeliveryCompletion) => void>()
  const waiters = new Set<{ resolve(connection: LiveDeliveryConnection): void; cancel(): void }>()
  const starts = new Map<AbortController, Promise<LiveDeliveryProducer>>()
  const exportJobs = new Map<AbortController, Promise<LiveRecoveryAction>>()
  const actions = new Set<Promise<LiveRecoveryAction>>()
  const publications = new Set<Promise<void>>()
  let current: LiveDeliveryConnection | undefined
  let generation = 0
  let publication = 0
  let rotating = false
  let closing = false
  let rotation = Promise.resolve()
  let shutdownJob: Promise<void> | undefined
  const delivery = openDelivery()

  function openDelivery(): LiveDeliveryManager | undefined {
    // Storage failure disables Live without breaking unrelated desktop operation.
    const store = (() => { try { return openLiveOutbox(options.userData) } catch { return undefined } })()
    if (!store) return undefined
    try {
      return createLiveDeliveryManager({ store, connection, onComplete(completion) {
        for (const listener of [...listeners]) {
          try { listener({ ...completion }) } catch { console.warn("Live delivery completion observer failed") }
        }
      } })
    } catch {
      try { store.close() } catch { /* The unavailable facade must also contain a failed storage close. */ }
      return undefined
    }
  }
  function canStart() {
    return !closing && !rotating && current !== undefined && delivery?.snapshot().state === "ready"
  }
  function connection(signal: AbortSignal): Promise<LiveDeliveryConnection> {
    if (signal.aborted) return Promise.reject(new LiveDeliveryError("cancelled"))
    if (closing) return Promise.reject(new LiveDeliveryError("closed"))
    if (current && !rotating) return Promise.resolve(current)
    return new Promise((resolve, reject) => {
      const cleanup = () => { waiters.delete(waiter); signal.removeEventListener("abort", waiter.cancel) }
      const waiter = {
        resolve(value: LiveDeliveryConnection) { cleanup(); resolve(value) },
        cancel() { cleanup(); reject(new LiveDeliveryError(closing ? "closed" : "cancelled")) },
      }
      waiters.add(waiter)
      signal.addEventListener("abort", waiter.cancel, { once: true })
      if (signal.aborted) waiter.cancel()
    })
  }
  function fence() {
    current = undefined
    generation++
    publication++
    for (const waiter of [...waiters]) waiter.cancel()
    for (const controller of starts.keys()) controller.abort()
    for (const controller of exportJobs.keys()) controller.abort()
  }
  async function joinAttempts() {
    while (starts.size || exportJobs.size || actions.size)
      await Promise.allSettled([...starts.values(), ...exportJobs.values(), ...actions])
  }
  function invalidate(): Promise<void> {
    if (closing) return shutdownJob ?? Promise.resolve()
    // Close admission before any stop callback or Promise continuation can reenter Main.
    rotating = true
    fence()
    const previous = rotation
    const completion = Promise.withResolvers<void>()
    rotation = completion.promise
    const job = (async () => {
      const failures: unknown[] = []
      const prior = await Promise.allSettled([previous])
      prior.forEach((outcome) => { if (outcome.status === "rejected") failures.push(outcome.reason) })
      try { await options.stopCapture("rotation") } catch (error) { failures.push(error) }
      await joinAttempts()
      if (failures.length) throw new AggregateError(failures, "Live delivery rotation failed")
    })()
    job.then(completion.resolve, completion.reject)
    return completion.promise
  }
  function setConnection(value: LiveDeliveryConnection): Promise<void> {
    if (closing) return Promise.reject(new LiveDeliveryError("closed"))
    const next = Object.freeze({ mode: value.mode, epoch: value.epoch, server: Object.freeze({ ...value.server }) })
    try { deliveryConnection(next) } catch (error) { return Promise.reject(error) }
    if (current && sameConnection(deliveryConnection(current), deliveryConnection(next))) return Promise.resolve()
    // A known resource replacement has the same stop fence as an explicit invalidation.
    if (current) invalidate()
    const observedGeneration = generation, observedPublication = ++publication
    const pending = rotation
    const job = pending.then(() => {
      if (closing || observedGeneration !== generation || observedPublication !== publication) return
      current = next
      rotating = false
      for (const waiter of [...waiters]) waiter.resolve(current)
    })
    publications.add(job)
    job.then(() => publications.delete(job), () => publications.delete(job))
    return job
  }
  function refusal(): DeliveryFailureReason | undefined {
    if (closing) return "closed"
    if (!delivery) return "storage"
    if (rotating) return "cancelled"
    return undefined
  }
  function start(input: Parameters<LiveDeliveryManager["start"]>[0], signal: AbortSignal): Promise<LiveDeliveryProducer> {
    const unavailable = refusal()
    if (unavailable) return Promise.reject(new LiveDeliveryError(unavailable))
    if (signal.aborted) return Promise.reject(new LiveDeliveryError("cancelled"))
    if (!delivery || !canStart()) return Promise.reject(new LiveDeliveryError(delivery?.snapshot().state === "storage-error" ? "storage" : "offline"))
    const active = delivery, observed = generation, controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener("abort", abort, { once: true })
    const job = Promise.resolve().then(async () => {
      if (controller.signal.aborted || closing || rotating || observed !== generation) throw new LiveDeliveryError("cancelled")
      const producer = await active.start(input, controller.signal)
      if (controller.signal.aborted || closing || rotating || observed !== generation) {
        // A settled ACK racing cancellation must never install capture; no capture used this lease.
        const requested = producer.requestClose(), sealed = producer.seal()
        if (!requested.ok) throw new LiveDeliveryError(requested.reason)
        if (!sealed.ok) throw new LiveDeliveryError(sealed.reason)
        throw new LiveDeliveryError("cancelled")
      }
      return producer
    }).finally(() => { signal.removeEventListener("abort", abort); starts.delete(controller) })
    starts.set(controller, job)
    return job
  }
  function snapshot(): DeliverySnapshot {
    const value: DeliverySnapshot = delivery?.snapshot() ?? { state: "storage-error", items: [], unconfirmedStarts: [] }
    return { ...value, state: closing ? "closed" : value.state }
  }
  function metadata(): LiveRecoverySnapshot {
    const value = snapshot()
    return {
      state: value.state,
      canStart: canStart(),
      items: value.items.map((item) => ({
        id: item.id, title: item.meeting.title, sessionID: item.meeting.sessionID, meetingID: item.meeting.id,
        timeStarted: item.meeting.timeStarted, pendingCount: item.pendingCount, pendingBytes: item.pendingBytes,
        closeRequested: item.closeRequested, sealed: item.sealed, activeProducer: item.activeProducer,
        status: item.status, ...(item.reason === undefined ? {} : { reason: item.reason }), unsaved: item.unsaved,
      })),
      unconfirmedStarts: value.unconfirmedStarts.map((item) => ({ id: item.id, title: item.title, sessionID: item.sessionID, reason: item.reason })),
    }
  }
  function retry(id: string): LiveRecoveryAction {
    const reason = refusal()
    return reason ? failure(reason) : delivery!.retry(id)
  }
  function finish(id: string): LiveRecoveryAction {
    const reason = refusal()
    return reason ? failure(reason) : delivery!.finish(id)
  }
  function discard(id: string): Promise<LiveRecoveryAction> {
    const reason = refusal()
    if (reason) return Promise.resolve(failure(reason))
    const job = delivery!.discard(id)
    actions.add(job)
    job.then(() => actions.delete(job), () => actions.delete(job))
    return job
  }
  function exportRecord(id: string): Promise<LiveRecoveryAction> {
    const reason = refusal()
    if (reason) return Promise.resolve(failure(reason))
    if (!isLocalID(id)) return Promise.resolve(failure("conflict"))
    try {
      const data = delivery!.export(id), controller = new AbortController()
      const job = Promise.resolve().then(() => controller.signal.aborted ? failure("cancelled") : options.exportData(data, controller.signal))
        .catch((error: unknown) => failure(controller.signal.aborted ? "cancelled" : deliveryReason(error)))
        .finally(() => exportJobs.delete(controller))
      exportJobs.set(controller, job)
      return job
    } catch (error) { return Promise.resolve(failure(deliveryReason(error))) }
  }
  function shutdown(): Promise<void> {
    if (shutdownJob) return shutdownJob
    const completion = Promise.withResolvers<void>()
    shutdownJob = completion.promise
    closing = true
    fence()
    const pendingRotation = rotation
    const job = (async () => {
      const failures: unknown[] = []
      const prior = await Promise.allSettled([pendingRotation])
      prior.forEach((outcome) => { if (outcome.status === "rejected") failures.push(outcome.reason) })
      try { await options.stopCapture("quit") } catch (error) { failures.push(error) }
      await joinAttempts()
      await Promise.allSettled([...publications])
      // Existing producers retain their final-append lease until local capture has joined.
      try { await delivery?.shutdown() } catch (error) { failures.push(error) }
      listeners.clear()
      if (failures.length) throw new AggregateError(failures, "Live delivery shutdown failed")
    })()
    job.then(completion.resolve, completion.reject)
    return completion.promise
  }
  const manager: LiveDeliveryManager = {
    start, snapshot, retry, finish, discard, shutdown,
    export(id) {
      if (!isLocalID(id)) throw new LiveDeliveryError("conflict")
      return delivery?.export(id) ?? { kind: "storage-unavailable", id, unsavedUnavailable: true }
    },
  }
  return {
    manager, canStart, connection, setConnection, invalidate, shutdown,
    recovery: { snapshot: async () => metadata(), retry: async (id) => retry(id), finish: async (id) => finish(id), discard, export: exportRecord },
    onComplete(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

function failure(reason: DeliveryFailureReason): LiveRecoveryAction { return { ok: false, reason } }
