export { LiveDeliveryError } from "./live-delivery-error.ts"

import { randomUUID } from "node:crypto"
import { OutboxError } from "./live-outbox.ts"
import { DeliveryRequestError, DeliveryStaleError, LiveDeliveryError, deliveryReason } from "./live-delivery-error.ts"
import { createDeliveryHttp, deliverySleep } from "./live-delivery-http.ts"
import { admittedSegment, comparePending, deliveryIdentity, isLocalID, matchesRecord, sameConnection, sameTarget, serializedBytes, startInput } from "./live-delivery-values.ts"
import type { DeliveryConnection, DeliveryIdentity } from "./live-delivery-values.ts"
import type { DeliveryAction, DeliveryFailureReason, DeliveryItem, DeliverySnapshot, LiveDeliveryManager, LiveDeliveryOptions, LiveDeliveryProducer, UnconfirmedStart } from "./live-delivery-contract.ts"
import type { OutboxMeeting, OutboxReason, OutboxStatus, OutboxSummary, OutboxTarget } from "./live-outbox-contract.ts"
import type { MeetingSegment } from "./live-meeting-client.ts"

type Owner = { open: boolean; controller: AbortController }
type Producer = { active: boolean; closed: boolean; controller: AbortController; failure?: DeliveryFailureReason }
type Entry = {
  id: string
  last: OutboxSummary
  owner?: Owner
  job?: Promise<void>
  producer?: Producer
  next: boolean
  paused: boolean
  removed: boolean
  deleting: boolean
  unavailable: boolean
  override?: { status: OutboxStatus; reason?: OutboxReason }
  proof?: DeliveryConnection
}
type Known = { target: OutboxTarget; meeting: OutboxMeeting }
type Start = { id: string; input: { sessionID: string; title: string }; owner: Owner; reserved: boolean; attempted: boolean }
const BACKOFF = [250, 500, 1000, 2000, 4000, 8000, 8000]
const owner = (): Owner => ({ open: true, controller: new AbortController() })
const closeOwner = (value: Owner | undefined) => { if (!value) return; value.open = false; value.controller.abort() }
const suspended = (record: OutboxSummary) => record.failures >= 8 || record.status === "paused" || record.status === "blocked" || record.status === "storage-error"

export function createLiveDeliveryManager(options: LiveDeliveryOptions): LiveDeliveryManager {
  const http = createDeliveryHttp(options.connection)
  const entries = new Map<string, Entry>(), starts = new Map<string, Start>(), unconfirmed = new Map<string, UnconfirmedStart>()
  const adoptions = new Map<string, { owner: Owner; job: Promise<void> }>()
  const jobs = new Set<Promise<unknown>>()
  let cache: OutboxSummary[] = []
  let unavailable = false
  let closing = false
  let closed = false
  let shutdown: Promise<void> | undefined
  let unsaved: { id: string; segment: MeetingSegment } | undefined

  function track<A>(job: Promise<A>) { jobs.add(job); job.then(() => jobs.delete(job), () => jobs.delete(job)); return job }
  function live(value: Owner) { if (!value.open || closing || value.controller.signal.aborted) throw new LiveDeliveryError("cancelled") }
  function entry(record: OutboxSummary) {
    const existing = entries.get(record.id)
    if (existing) { existing.last = record; return existing }
    const value: Entry = { id: record.id, last: record, next: false, paused: true, removed: false, deleting: false, unavailable: false }
    entries.set(value.id, value)
    return value
  }
  function rows() {
    if (closed) return cache
    try {
      cache = [...options.store.list()]
      cache.forEach(entry)
      unavailable = false
    } catch {
      unavailable = true
      for (const value of entries.values()) {
        value.paused = true; value.next = false; value.override = { status: "storage-error", reason: "storage" }
        closeOwner(value.owner)
        if (value.producer) { value.producer.closed = true; value.producer.failure ??= "storage"; value.producer.controller.abort() }
      }
    }
    return cache
  }
  function notify() {
    rows()
    try { options.onChange?.() } catch { console.warn("Live delivery observer failed") }
  }
  function summary(value: Entry) { const result = options.store.summary(value.id); value.last = result; return result }
  function noUnsaved(value: Entry) { return !value.unavailable && unsaved?.id !== value.id }
  function canClose(value: Entry, record: OutboxSummary) { return record.closeRequested && record.sealed && record.pendingCount === 0 && !value.producer?.active && noUnsaved(value) }
  function status(value: Entry, input: { status: OutboxStatus; reason?: OutboxReason; failures: number }) {
    try { options.store.setStatus(value.id, input); value.last = options.store.summary(value.id); value.override = undefined; return true }
    catch (error) { localFailure(value, error, undefined, false); return false }
  }
  function localFailure(value: Entry, error: unknown, segment?: MeetingSegment, persist = true) {
    const reason = deliveryReason(error)
    value.paused = true; value.next = false; closeOwner(value.owner)
    if (value.producer) {
      value.producer.closed = true; value.producer.failure ??= reason; value.producer.controller.abort()
    }
    if (segment) {
      if (!unsaved) unsaved = { id: value.id, segment }
      else if (unsaved.id !== value.id) value.unavailable = true
    }
    value.override = { status: "storage-error", reason: reason === "quota" || reason === "conflict" ? reason : "storage" }
    if (persist) {
      try { options.store.setStatus(value.id, { ...value.override, failures: value.last.failures }); value.last = options.store.summary(value.id) } catch { /* Keep the last known metadata and the explicit failed-admission state. */ }
    }
    notify()
  }
  function publicSnapshot(): DeliverySnapshot {
    const current = closing ? cache : rows()
    const items: DeliveryItem[] = current.map((record) => {
      const value = entries.get(record.id)
      return { ...record, target: { ...record.target }, meeting: { ...record.meeting }, ...value?.override, activeProducer: value?.producer?.active ?? false, unsaved: unsaved?.id === record.id ? "retained" : value?.unavailable ? "unavailable" : "none", ...(unsaved?.id === record.id ? { unsavedBytes: serializedBytes(unsaved.segment) } : {}) }
    })
    return { state: closing ? "closed" : unavailable ? "storage-error" : "ready", items, unconfirmedStarts: [...unconfirmed.values()].map((value) => ({ ...value, ...(value.target ? { target: { ...value.target } } : {}), ...(value.meeting ? { meeting: { ...value.meeting } } : {}) })) }
  }
  function capacity(except?: string) {
    const current = rows()
    if (unavailable) throw new LiveDeliveryError("storage")
    const ids = new Set([...current.map((record) => record.id), ...[...starts.values()].filter((start) => start.reserved).map((start) => start.id), ...unconfirmed.keys()])
    if (except) ids.delete(except)
    if (ids.size >= 128) throw new LiveDeliveryError("quota")
    options.store.assertCanCreate()
  }
  function assertTarget(record: OutboxSummary) { if (record.target.profileID !== options.store.profileID) throw new LiveDeliveryError("target") }
  async function fence(value: Owner, connection: DeliveryConnection) {
    live(value)
    try { await http.check(connection, value.controller.signal) }
    catch (error) { if (!value.open || closing) throw new LiveDeliveryError("cancelled"); if (error instanceof DeliveryStaleError) throw error; throw new DeliveryStaleError() }
    live(value)
  }
  async function proof(value: Entry, current: Owner): Promise<DeliveryIdentity> {
    const record = summary(value); assertTarget(record)
    const response = await http.request("read", { signal: current.controller.signal, target: record.target, directory: record.target.directory, meetingID: record.meeting.id, beforeSend: () => live(current) })
    await fence(current, response.connection)
    const identity = deliveryIdentity(response.data, true)
    if (!matchesRecord(identity, record)) throw new LiveDeliveryError("target")
    comparePending(response.data, options.store.export(value.id).segments)
    value.proof = response.connection
    return identity
  }
  function complete(value: Entry, identity: DeliveryIdentity, current: Owner) {
    live(current)
    const record = summary(value)
    if (!canClose(value, record) || identity.meeting.timeEnded === null || !matchesRecord(identity, record)) throw new LiveDeliveryError("ended")
    options.store.complete(value.id, { target: record.target, meetingID: record.meeting.id, sessionID: record.meeting.sessionID, timeStarted: record.meeting.timeStarted, timeEnded: identity.meeting.timeEnded })
    value.removed = true; value.next = false; value.paused = true; closeOwner(current)
    entries.delete(value.id); unconfirmed.delete(value.id); notify()
  }
  async function drain(value: Entry, current: Owner) {
    let stage: "read" | "append" | "stop" = "read"
    let reconcile = false
    while (current.open && !closing && !value.paused && !value.deleting && !value.removed) {
      try {
        live(current)
        const record = summary(value), batch = options.store.batch(value.id)
        if (!batch.ids.length && !canClose(value, record)) return
        assertTarget(record)
        const connection = await http.resolve(current.controller.signal); live(current)
        if (reconcile || !value.proof || !sameConnection(value.proof, connection)) {
          stage = "read"
          const identity = await proof(value, current); live(current)
          reconcile = false
          if (identity.meeting.timeEnded !== null) { complete(value, identity, current); return }
        }
        live(current)
        if (batch.ids.length) {
          stage = "append"
          const response = await http.request("append", { signal: current.controller.signal, expected: value.proof, target: record.target, directory: record.target.directory, body: { meetingID: record.meeting.id, segments: batch.segments }, beforeSend: () => live(current) })
          await fence(current, response.connection)
          const before = summary(value).pendingCount
          options.store.acknowledge(value.id, batch.ids)
          const after = summary(value)
          if (after.pendingCount < before && !status(value, { status: "sending", failures: after.failures })) return
          notify()
          continue
        }
        stage = "stop"
        const response = await http.request("stop", { signal: current.controller.signal, expected: value.proof, target: record.target, directory: record.target.directory, body: { meetingID: record.meeting.id }, beforeSend: () => { live(current); if (!canClose(value, summary(value))) throw new LiveDeliveryError("cancelled") } })
        await fence(current, response.connection)
        const identity = deliveryIdentity(response.data, false)
        if (!matchesRecord(identity, record) || identity.meeting.timeEnded === null) throw new LiveDeliveryError("target")
        complete(value, identity, current)
        return
      } catch (caught) {
        if (!current.open || closing || value.deleting || value.removed) return
        if (caught instanceof DeliveryStaleError) { value.paused = true; value.next = false; closeOwner(current); return }
        let error = caught
        try {
          if (error instanceof DeliveryRequestError && error.connection) await fence(current, error.connection)
          if (stage === "stop" && deliveryReason(error) === "ended" && summary(value).pendingCount === 0) {
            const identity = await proof(value, current)
            if (identity.meeting.timeEnded !== null) { complete(value, identity, current); return }
            error = new DeliveryRequestError("ended", true, value.proof)
          }
        } catch (checking) {
          if (!current.open || closing) return
          if (checking instanceof DeliveryStaleError) { value.paused = true; value.next = false; closeOwner(current); return }
          error = checking
        }
        if (error instanceof OutboxError || deliveryReason(error) === "storage") { localFailure(value, error); return }
        if (!(error instanceof DeliveryRequestError && error.transient)) {
          const reason = deliveryReason(error)
          value.paused = true; value.next = false; closeOwner(current)
          status(value, { status: "blocked", reason: outboxReason(reason), failures: value.last.failures }); notify()
          return
        }
        const failures = summary(value).failures + 1
        if (!status(value, { status: failures >= 8 ? "paused" : "sending", reason: outboxReason(error.reason), failures })) return
        notify()
        if (failures >= 8) { value.paused = true; value.next = false; closeOwner(current); return }
        reconcile = true
        try { await deliverySleep(BACKOFF[failures - 1]!, current.controller.signal, options.sleep) }
        catch { return }
      }
    }
  }
  function schedule(value: Entry) {
    if (closing || value.removed || value.deleting || value.paused) return
    value.next = true
    if (value.job) return
    value.next = false
    const current = owner(); value.owner = current
    const job = drain(value, current).catch((error: unknown) => { if (current.open && !closing && !value.removed) localFailure(value, error) })
    value.job = job; track(job)
    job.then(() => {
      if (value.job !== job) return
      value.job = undefined; closeOwner(current)
      if (value.owner === current) value.owner = undefined
      if (value.next && !value.paused && !value.removed && !value.deleting && !closing) schedule(value)
    })
  }
  function remember(start: Start, reason: DeliveryFailureReason, known?: Known) {
    const base: UnconfirmedStart = { id: start.id, ...start.input, reason }
    const withMeeting = known && serializedBytes({ ...base, meeting: known.meeting }) <= 16 * 1024 ? { ...base, meeting: known.meeting } : base
    const value = known && serializedBytes({ ...withMeeting, target: known.target }) <= 16 * 1024 ? { ...withMeeting, target: known.target } : withMeeting
    unconfirmed.set(start.id, value)
  }
  function commitKnown(id: string, known: Known) {
    try {
      const existing = options.store.summary(id)
      if (!sameTarget(existing.target, known.target) || existing.meeting.id !== known.meeting.id || existing.meeting.sessionID !== known.meeting.sessionID || existing.meeting.timeStarted !== known.meeting.timeStarted) throw new LiveDeliveryError("conflict")
      return entry(existing)
    } catch (error) {
      if (!(error instanceof OutboxError && error.reason === "missing")) throw error
      return entry(options.store.create({ id, ...known }))
    }
  }
  function producer(value: Entry): LiveDeliveryProducer {
    const identity: Producer = { active: true, closed: false, controller: new AbortController() }
    value.producer = identity
    return {
      localID: value.id, meetingID: value.last.meeting.id, signal: identity.controller.signal,
      append(input) {
        if (closing || identity.closed || !identity.active || value.removed || value.deleting) return "refused"
        let segment: MeetingSegment | undefined
        try {
          segment = admittedSegment(input)
          if (unavailable) throw new LiveDeliveryError("storage")
          const accepted = options.store.append(value.id, segment)
          if (accepted === "accepted") { notify(); schedule(value) }
          return accepted
        } catch (error) {
          if (!segment) value.unavailable = true
          localFailure(value, error, segment)
          return "refused"
        }
      },
      requestClose() {
        if (closing || identity.closed || !identity.active) return failure("closed")
        try { options.store.requestClose(value.id); notify(); schedule(value); return success() }
        catch (error) { localFailure(value, error); return failure(deliveryReason(error)) }
      },
      seal() {
        if (closing || !identity.active) return failure("closed")
        identity.active = false; identity.closed = true; identity.controller.abort()
        // Joining the producer releases its lease, but an unsaved final must remain appendable by Retry.
        if (identity.failure || !noUnsaved(value)) { notify(); return failure(identity.failure ?? "storage") }
        try { options.store.seal(value.id); notify(); schedule(value); return success() }
        catch (error) { localFailure(value, error); return failure(deliveryReason(error)) }
      },
      abandon() {
        if (!identity.active) return
        identity.active = false; identity.closed = true; identity.controller.abort()
        value.paused = true; value.next = false; closeOwner(value.owner)
        if (!closing && !value.removed && !value.override) status(value, { status: "interrupted", reason: value.last.reason, failures: value.last.failures })
        notify()
      },
    }
  }
  async function performStart(start: Start, signal: AbortSignal): Promise<LiveDeliveryProducer> {
    let known: Known | undefined
    try {
      const response = await http.request("start", { signal: start.owner.controller.signal, body: { ...start.input, consent: "unknown" }, beforeSend: () => { live(start.owner); capacity(start.id) }, sent: () => { start.attempted = true } })
      const identity = deliveryIdentity(response.data, false)
      if (identity.meeting.sessionID !== start.input.sessionID || identity.meeting.timeEnded !== null || (response.connection.directory !== undefined && response.connection.directory !== identity.directory)) throw new LiveDeliveryError("target")
      known = { target: { profileID: options.store.profileID, mode: response.connection.mode, authority: response.connection.origin, directory: identity.directory }, meeting: { id: identity.meeting.id, sessionID: identity.meeting.sessionID, timeStarted: identity.meeting.timeStarted, title: start.input.title } }
      if (serializedBytes(known) > 16 * 1024) throw new LiveDeliveryError("quota")
      // A valid ACK can arrive during cancellation; persist its exact tuple before rejecting the caller.
      if (start.owner.open && !closing) {
        try { await fence(start.owner, response.connection) }
        catch (error) { if (start.owner.open && !closing) throw error }
      }
      const value = commitKnown(start.id, known)
      start.reserved = false; value.paused = false; value.proof = response.connection
      if (!status(value, { status: "sending", failures: 0 })) throw new LiveDeliveryError("storage")
      notify()
      if (signal.aborted || !start.owner.open || closing) {
        options.store.requestClose(value.id); options.store.seal(value.id)
        notify(); if (!closing) schedule(value)
        throw new LiveDeliveryError("cancelled")
      }
      return producer(value)
    } catch (error) {
      const reason = signal.aborted || !start.owner.open || closing ? "cancelled" : deliveryReason(error)
      if (start.attempted && !entries.has(start.id)) remember(start, reason, known)
      notify()
      throw new LiveDeliveryError(reason)
    } finally { starts.delete(start.id); closeOwner(start.owner) }
  }
  function adopt(id: string, known: Known, reset: boolean) {
    if (adoptions.has(id)) return
    const previous = entries.get(id)
    if (previous) { previous.paused = true; previous.next = false; closeOwner(previous.owner) }
    const current = owner()
    let adopted: Entry | undefined
    const job = (async () => {
      if (previous?.job) await previous.job
      live(current)
      const response = await http.request("read", { signal: current.controller.signal, target: known.target, directory: known.target.directory, meetingID: known.meeting.id, beforeSend: () => live(current) })
      await fence(current, response.connection)
      const identity = deliveryIdentity(response.data, true)
      if (!matchesRecord(identity, known)) throw new LiveDeliveryError("target")
      adopted = commitKnown(id, known)
      adopted.owner = current; adopted.proof = response.connection
      comparePending(response.data, options.store.export(id).segments)
      unconfirmed.delete(id)
      options.store.requestClose(id); options.store.seal(id)
      const record = summary(adopted)
      if (reset) status(adopted, { status: "sending", failures: 0 })
      adopted.paused = reset ? !!adopted.override : suspended(record)
      if (!adopted.paused && identity.meeting.timeEnded !== null) { complete(adopted, identity, current); return }
      notify()
    })().catch((error: unknown) => {
      if (!current.open || closing) return
      const pending = unconfirmed.get(id)
      if (pending) { unconfirmed.set(id, { ...pending, reason: deliveryReason(error) }); notify() }
      else if (adopted) localFailure(adopted, error)
    })
    adoptions.set(id, { owner: current, job }); track(job)
    job.then(() => {
      adoptions.delete(id); closeOwner(current)
      if (!adopted) return
      if (adopted.owner === current) adopted.owner = undefined
      if (!adopted.paused && !closing && !adopted.removed && !adopted.deleting) schedule(adopted)
    })
  }
  function existing(id: string) {
    if (closing) throw new LiveDeliveryError("closed")
    if (!isLocalID(id)) throw new LiveDeliveryError("conflict")
    rows()
    if (unavailable) throw new LiveDeliveryError("storage")
    return entry(options.store.summary(id))
  }
  function retry(id: string): DeliveryAction {
    try {
      if (closing) return failure("closed")
      if (!isLocalID(id)) return failure("conflict")
      if (adoptions.has(id)) return success()
      const pending = unconfirmed.get(id)
      if (pending) { if (!pending.target || !pending.meeting) return failure("target"); adopt(id, { target: pending.target, meeting: pending.meeting }, true); return success() }
      const value = existing(id)
      if (value.deleting) return failure("closed")
      if (value.unavailable) return failure("storage")
      // Closing the HTTP generation never revives or invalidates the independent producer identity.
      closeOwner(value.owner); value.proof = undefined
      if (unsaved?.id === id) { options.store.append(id, unsaved.segment); unsaved = undefined }
      if (!status(value, { status: "sending", failures: 0 })) return failure("storage")
      value.paused = false; value.override = undefined; notify(); schedule(value)
      return success()
    } catch (error) { return failure(deliveryReason(error)) }
  }
  function finish(id: string): DeliveryAction {
    try {
      if (closing) return failure("closed")
      if (!isLocalID(id)) return failure("conflict")
      if (adoptions.has(id)) return success()
      const pending = unconfirmed.get(id)
      if (pending) { if (!pending.target || !pending.meeting) return failure("target"); adopt(id, { target: pending.target, meeting: pending.meeting }, false); return success() }
      const value = existing(id)
      if (value.producer?.active) return failure("active")
      if (!noUnsaved(value)) return failure("storage")
      options.store.requestClose(id); options.store.seal(id)
      const record = summary(value)
      // Finish commits local intent; only explicit Retry may reset a paused/blocked campaign.
      if (!suspended(record) && value.override?.status !== "storage-error") { value.paused = false; schedule(value) }
      notify()
      return success()
    } catch (error) { const value = entries.get(id); if (value) localFailure(value, error); return failure(deliveryReason(error)) }
  }
  function discard(id: string) {
    if (closing) return Promise.resolve(failure("closed"))
    if (!isLocalID(id)) return Promise.resolve(failure("conflict"))
    const value = entries.get(id), adoption = adoptions.get(id)
    if (value?.producer?.active) return Promise.resolve(failure("active"))
    closeOwner(adoption?.owner)
    if (value) { value.deleting = true; value.paused = true; value.next = false; closeOwner(value.owner) }
    const job = (async () => {
      if (adoption) await adoption.job
      if (value?.job) await value.job
      if (closing) return failure("closed")
      try {
        rows(); if (unavailable) throw new LiveDeliveryError("storage")
        try { options.store.discard(id) } catch (error) { if (!(unconfirmed.has(id) && error instanceof OutboxError && error.reason === "missing")) throw error }
        if (value) value.removed = true
        entries.delete(id); unconfirmed.delete(id); if (unsaved?.id === id) unsaved = undefined
        notify(); return success()
      } catch (error) { if (value) value.deleting = false; return failure(deliveryReason(error)) }
    })()
    return track(job)
  }
  function stop() {
    if (shutdown) return shutdown
    // Abort listeners can reenter shutdown synchronously; publish its identity before aborting.
    const completion = Promise.withResolvers<void>()
    shutdown = completion.promise
    closing = true
    for (const start of starts.values()) closeOwner(start.owner)
    for (const adoption of adoptions.values()) closeOwner(adoption.owner)
    for (const value of entries.values()) { value.paused = true; value.next = false; closeOwner(value.owner); if (value.producer) { value.producer.closed = true; value.producer.controller.abort() } }
    const job = (async () => {
      while (jobs.size) await Promise.allSettled([...jobs])
      try { options.store.close(); closed = true } catch { throw new LiveDeliveryError("storage") }
      notify()
    })()
    job.then(completion.resolve, completion.reject)
    return shutdown
  }

  for (const record of rows()) {
    const value = entry(record)
    if (record.closeRequested && !suspended(record) && (record.status === "sending" || record.status === "interrupted")) {
      try { options.store.seal(record.id); value.paused = false; schedule(value) } catch (error) { localFailure(value, error) }
    } else if (!record.closeRequested && record.status === "sending") status(value, { status: "interrupted", reason: record.reason, failures: record.failures })
  }
  return {
    start(input, signal) {
      if (closing) return Promise.reject(new LiveDeliveryError("closed"))
      const id = randomUUID()
      try {
        const admitted = startInput(input)
        if (signal.aborted) throw new LiveDeliveryError("cancelled")
        capacity()
        if (rows().some((record) => record.meeting.sessionID === admitted.sessionID) || [...starts.values()].some((value) => value.input.sessionID === admitted.sessionID) || [...unconfirmed.values()].some((value) => value.sessionID === admitted.sessionID)) throw new LiveDeliveryError("active")
        if (serializedBytes({ id, ...admitted, reason: "authentication" }) > 16 * 1024) throw new LiveDeliveryError("quota")
        const value: Start = { id, input: admitted, owner: owner(), reserved: true, attempted: false }
        starts.set(id, value)
        const abort = () => closeOwner(value.owner)
        signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort()
        const job = performStart(value, signal).finally(() => signal.removeEventListener("abort", abort))
        return track(job)
      } catch (error) { return Promise.reject(new LiveDeliveryError(deliveryReason(error))) }
    },
    snapshot: publicSnapshot,
    retry,
    finish,
    discard,
    export(id) {
      if (!isLocalID(id)) throw new LiveDeliveryError("conflict")
      const pending = unconfirmed.get(id)
      if (pending) return { kind: "unconfirmed", data: { ...pending, ...(pending.target ? { target: { ...pending.target } } : {}), ...(pending.meeting ? { meeting: { ...pending.meeting } } : {}) } }
      const value = entries.get(id)
      try { return { kind: "stored", data: options.store.export(id), ...(unsaved?.id === id ? { unsaved: { ...unsaved.segment } } : {}), unsavedUnavailable: value?.unavailable ?? false } }
      catch (error) { if (!value && error instanceof OutboxError && error.reason === "missing") throw new LiveDeliveryError("missing"); return { kind: "storage-unavailable", id, ...(unsaved?.id === id ? { unsaved: { ...unsaved.segment } } : {}), unsavedUnavailable: value?.unavailable ?? false } }
    },
    shutdown: stop,
  }
}

function outboxReason(reason: DeliveryFailureReason): OutboxReason {
  return reason === "active" ? "conflict" : reason === "closed" || reason === "cancelled" ? "shutdown" : reason
}
function success(): DeliveryAction { return { ok: true } }
function failure(reason: DeliveryFailureReason): DeliveryAction { return { ok: false, reason } }
