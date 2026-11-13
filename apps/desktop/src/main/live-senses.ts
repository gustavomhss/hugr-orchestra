import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"

import { SAMPLE_RATE, echoGate, interleave, levelMeter } from "./live-audio"
import { startCapture } from "./live-capture"
import { captureFrame } from "./live-frame"
import { readTranscriptionKey } from "./live-key"
import type { MeetingServer } from "./live-meeting-client"
import type { LiveDeliveryManager } from "./live-delivery-contract"
import { readPermissions, requestMicrophone, type SensePermissions, type SenseStatus } from "./live-permissions"
import { segmenter, type Caption, type Segment } from "./live-segmenter"
import { createTranscriber } from "./live-transcriber"
import { transportLog } from "./live-transport-log"

// The live seat's senses for one meeting: capture both tracks, transcribe, cut segments and append them to the durable
// meeting record, and report captions and failures in the overlay's vocabulary. Wiring into the overlay and the app
// lifecycle is the caller's; this owns nothing global.

export type LiveSensesEvent =
  | { kind: "caption"; line: Caption }
  | { kind: "segment"; segment: Segment }
  | { kind: "permissions"; permissions: SensePermissions }
  | {
      kind: "error"
      error:
        | ({ kind: "permission" } & SensePermissions)
        | { kind: "stt"; attempt: number; retryInSeconds: number; closeCode: number; reason: string; watermarkMs: number }
        | { kind: "network"; offlineMs: number }
        | { kind: "storage"; reason: "storage" | "quota"; incomplete: true }
    }
  | { kind: "recovered"; source: "stt" | "network" }

const DEFAULT_MODEL = "nova-3"

export async function startSenses(options: {
  signal?: AbortSignal
  runtime?: {
    readKey?: typeof readTranscriptionKey
    microphone?: typeof requestMicrophone
    capture?: typeof startCapture
    transcriber?: typeof createTranscriber
  }
  delivery: LiveDeliveryManager
  server?: MeetingServer
  sessionID: string
  title: string
  logDirectory: string
  model?: string
  // A BCP-47 tag, or "auto" to let the engine follow the meeting's language.
  language?: string
  // The tracks to open; a track left out is never captured and raises no permission prompt.
  sources?: { microphone: boolean; systemAudio: boolean }
  onLevels?: (levels: { microphone: number; "system-audio": number }) => void
  onEvent: (event: LiveSensesEvent) => void
}) {
  const signal = options.signal ?? new AbortController().signal
  signal.throwIfAborted()
  const want = options.sources ?? { microphone: true, systemAudio: true }
  const key = (options.runtime?.readKey ?? readTranscriptionKey)()
  if (!key) throw new Error("No speech-to-text key is set for the live seat.")
  const senses = {
    microphone: !want.microphone || await microphonePermission(signal, options.runtime?.microphone ?? requestMicrophone) ? "granted" : "denied",
    systemAudio: "on-request",
  } as { microphone: SenseStatus; systemAudio: SenseStatus }
  signal.throwIfAborted()
  const report = () => {
    const permissions = { ...readPermissions(senses.systemAudio), microphone: senses.microphone }
    options.onEvent({ kind: "permissions", permissions })
    if (Object.values(permissions).includes("denied"))
      options.onEvent({ kind: "error", error: { kind: "permission", ...permissions } })
  }
  report()

  const producer = await options.delivery.start({ sessionID: options.sessionID, title: options.title }, signal)
  const meeting = options.delivery.snapshot().items.find((item) => item.id === producer.localID)?.meeting
  if (!meeting) {
    producer.abandon()
    throw new Error("Live durable meeting metadata is unavailable")
  }
  const log = transportLog(options.logDirectory, producer.meetingID)
  const installed = Promise.withResolvers<void>()
  const state = {
    capture: undefined as Awaited<ReturnType<typeof startCapture>> | undefined,
    acquisition: undefined as Promise<Awaited<ReturnType<typeof startCapture>>> | undefined,
    transcriber: undefined as ReturnType<typeof createTranscriber> | undefined,
    stopping: undefined as Promise<{ unsent: number }> | undefined,
    started: false, finished: false, incomplete: false, installed: false,
    failures: [] as unknown[],
    warning: undefined as "storage" | "quota" | undefined,
  }
  const clock = { ms: 0 }
  const gate = echoGate()
  const meter = levelMeter((levels) => options.onLevels?.(levels))
  const pending = () => options.delivery.snapshot().items.find((item) => item.id === producer.localID)?.pendingCount ?? 0
  const warn = () => {
    state.incomplete = true
    const reason = options.delivery.snapshot().items.find((item) => item.id === producer.localID)?.reason === "quota" ? "quota" : "storage"
    if (state.warning === reason) return
    state.warning = reason
    try { options.onEvent({ kind: "error", error: { kind: "storage", reason, incomplete: true } }) }
    catch (error) { state.failures.push(error) }
  }
  const cutter = segmenter({
    endOfSpeech: true,
    onCaption: (line) => options.onEvent({ kind: "caption", line }),
    onSegment(segment) {
      log.write({ event: "segment", track: segment.track, startMs: segment.startMs, endMs: segment.endMs,
        latencyMs: Date.now() - (meeting.timeStarted + segment.endMs) })
      if (producer.append({ id: randomUUID(), ...segment }) === "refused") {
        warn()
        void stop().catch((error: unknown) => log.write({ event: "senses-stop-failed", reason: String(error) }))
        return
      }
      options.onEvent({ kind: "segment", segment })
    },
  })
  function stop() {
    if (state.stopping) return state.stopping
    // Publish before requestClose, capture.stop, abort listeners or final callbacks can synchronously reenter.
    const completion = Promise.withResolvers<{ unsent: number }>()
    state.stopping = completion.promise
    const job = (async () => {
      const failures = state.failures
      try { if (!producer.requestClose().ok) warn() } catch (error) { failures.push(error); warn() }
      if (!state.installed) await installed.promise
      if (!state.capture && state.acquisition) {
        try { state.capture = await state.acquisition } catch { state.incomplete = true }
      }
      try { await state.capture?.stop() } catch (error) { failures.push(error); warn() }
      try { await state.transcriber?.stop() } catch (error) { failures.push(error); warn() }
      try { cutter.flush() } catch (error) { failures.push(error); warn() }
      // These listeners must not interpret seal's normal producer-signal abort as another capture failure.
      signal.removeEventListener("abort", abort)
      producer.signal.removeEventListener("abort", refused)
      state.finished = true
      try {
        if (state.incomplete || failures.length) producer.abandon()
        else if (!producer.seal().ok) { warn(); producer.abandon() }
      } catch (error) {
        failures.push(error)
        warn()
        try { producer.abandon() } catch (cleanup) { failures.push(cleanup) }
      }
      log.write({ event: "capture", state: "stopped" })
      try { await log.flush() } catch (error) { failures.push(error) }
      if (failures.length) throw new AggregateError(failures, "Live capture cleanup failed; recent audio may be missing")
      return { unsent: pending() }
    })()
    job.then(completion.resolve, completion.reject)
    return completion.promise
  }
  function abort() {
    if (state.stopping) return
    if (!state.started) state.incomplete = true
    void stop().catch((error: unknown) => log.write({ event: "senses-stop-failed", reason: String(error) }))
  }
  function refused() {
    if (state.stopping) return
    warn()
    void stop().catch((error: unknown) => log.write({ event: "senses-stop-failed", reason: String(error) }))
  }
  signal.addEventListener("abort", abort, { once: true })
  producer.signal.addEventListener("abort", refused, { once: true })
  try {
    signal.throwIfAborted()
    producer.signal.throwIfAborted()
    state.transcriber = (options.runtime?.transcriber ?? createTranscriber)(
      { engine: "deepgram", model: options.model ?? DEFAULT_MODEL, key, language: options.language === "auto" ? "multi" : options.language },
      (event) => {
        if (state.finished) return
        if (event.kind === "piece") return cutter.piece(event.piece, clock.ms)
        if (event.kind === "speech-end") return cutter.speechEnd(event.track)
        if (event.kind === "open") {
          log.write({ event: "open", attempt: event.attempt, replayFromMs: event.replayFromMs })
          if (event.attempt > 1) options.onEvent({ kind: "recovered", source: "stt" })
          return
        }
        log.write({ event: "close", attempt: event.attempt, code: event.code, reason: event.reason,
          retryInSeconds: event.retryInSeconds, watermarkMs: event.watermarkMs })
        options.onEvent({ kind: "error", error: { kind: "stt", attempt: event.attempt,
          retryInSeconds: event.retryInSeconds, closeCode: event.code, reason: event.reason, watermarkMs: event.watermarkMs } })
      },
    )
    // Publish the acquisition promise before invoking a boundary that can synchronously emit callbacks.
    state.acquisition = Promise.resolve().then(() => {
      signal.throwIfAborted()
      producer.signal.throwIfAborted()
      return (options.runtime?.capture ?? startCapture)({
        audio(me, them) {
          if (state.finished) return
          if (senses.systemAudio === "on-request" && them.some((sample) => sample !== 0)) {
            senses.systemAudio = "granted"
            report()
          }
          meter(me, them, Date.now())
          const startMs = clock.ms
          const pcm = interleave(me, them, startMs, gate)
          clock.ms += ((pcm.length / 2) * 1000) / SAMPLE_RATE
          state.transcriber?.send(startMs, pcm)
        },
        status(sense, status) {
          if (state.finished || senses[sense] === status) return
          senses[sense] = status
          report()
        },
        state(state, reason) { log.write({ event: "capture", state, reason }) },
      }, want, AbortSignal.any([signal, producer.signal]))
    })
    state.installed = true
    installed.resolve()
    state.capture = await state.acquisition
    signal.throwIfAborted()
    producer.signal.throwIfAborted()
    state.started = true
    return { localID: producer.localID, meetingID: producer.meetingID,
      look(exclude: BrowserWindow[]) { return captureFrame(exclude) }, stop }
  } catch (error) {
    state.incomplete = true
    state.installed = true
    installed.resolve()
    const cleanup = await Promise.allSettled([stop()])
    const failures = cleanup.flatMap((outcome) => outcome.status === "rejected" ? [outcome.reason] : [])
    if (failures.length) throw new AggregateError([error, ...failures], "Live capture startup and cleanup failed")
    throw error
  }
}

// A permission dialog transfers no capture resource. Stop observes its late outcome but never waits for the OS UI.
function microphonePermission(signal: AbortSignal, request: typeof requestMicrophone) {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<boolean>((resolve, reject) => {
    let settled = false
    const finish = (value: boolean | undefined, error?: unknown) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", abort)
      if (error !== undefined) reject(error)
      else resolve(value === true)
    }
    const abort = () => finish(undefined, signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) { abort(); return }
    try { request().then((value) => finish(value), (error: unknown) => finish(undefined, error)) }
    catch (error) { finish(undefined, error) }
  })
}
