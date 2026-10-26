import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"

import { SAMPLE_RATE, echoGate, interleave } from "./live-audio"
import { startCapture } from "./live-capture"
import { captureFrame } from "./live-frame"
import { readTranscriptionKey } from "./live-key"
import { meetingClient, type MeetingServer } from "./live-meeting-client"
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
    }
  | { kind: "recovered"; source: "stt" | "network" }

const DEFAULT_MODEL = "nova-3"

export async function startSenses(options: {
  server: MeetingServer
  sessionID: string
  title: string
  logDirectory: string
  model?: string
  onEvent: (event: LiveSensesEvent) => void
}) {
  const key = readTranscriptionKey()
  if (!key) throw new Error("No speech-to-text key is set for the live seat.")
  const senses = { microphone: (await requestMicrophone()) ? "granted" : "denied", systemAudio: "on-request" } as {
    microphone: SenseStatus
    systemAudio: SenseStatus
  }
  const report = () => {
    const permissions = { ...readPermissions(senses.systemAudio), microphone: senses.microphone }
    options.onEvent({ kind: "permissions", permissions })
    if (Object.values(permissions).includes("denied"))
      options.onEvent({ kind: "error", error: { kind: "permission", ...permissions } })
  }
  report()

  const client = meetingClient(options.server, {
    failed(reason, pending, offlineMs) {
      log.write({ event: "append-failed", reason, pending })
      options.onEvent({ kind: "error", error: { kind: "network", offlineMs } })
    },
    recovered() {
      options.onEvent({ kind: "recovered", source: "network" })
    },
  })
  const meeting = await client.start(options.sessionID, options.title)
  const log = transportLog(options.logDirectory, meeting.id)
  const clock = { ms: 0 }
  const gate = echoGate()

  const cutter = segmenter({
    endOfSpeech: true,
    onCaption: (line) => options.onEvent({ kind: "caption", line }),
    onSegment(segment) {
      log.write({
        event: "segment",
        track: segment.track,
        startMs: segment.startMs,
        endMs: segment.endMs,
        latencyMs: Date.now() - (meeting.timeStarted + segment.endMs),
      })
      client.append(meeting.id, { id: randomUUID(), ...segment })
      options.onEvent({ kind: "segment", segment })
    },
  })
  const transcriber = createTranscriber({ engine: "deepgram", model: options.model ?? DEFAULT_MODEL, key }, (event) => {
    if (event.kind === "piece") return cutter.piece(event.piece, clock.ms)
    if (event.kind === "speech-end") return cutter.speechEnd(event.track)
    if (event.kind === "open") {
      log.write({ event: "open", attempt: event.attempt, replayFromMs: event.replayFromMs })
      if (event.attempt > 1) options.onEvent({ kind: "recovered", source: "stt" })
      return
    }
    log.write({
      event: "close",
      attempt: event.attempt,
      code: event.code,
      reason: event.reason,
      retryInSeconds: event.retryInSeconds,
      watermarkMs: event.watermarkMs,
    })
    options.onEvent({
      kind: "error",
      error: {
        kind: "stt",
        attempt: event.attempt,
        retryInSeconds: event.retryInSeconds,
        closeCode: event.code,
        reason: event.reason,
        watermarkMs: event.watermarkMs,
      },
    })
  })

  const capture = await startCapture({
    audio(me, them) {
      // Loopback delivers silence until the system grants the audio tap, so the first sound is the proof.
      if (senses.systemAudio === "on-request" && them.some((sample) => sample !== 0)) {
        senses.systemAudio = "granted"
        report()
      }
      const startMs = clock.ms
      const pcm = interleave(me, them, startMs, gate)
      clock.ms += ((pcm.length / 2) * 1000) / SAMPLE_RATE
      transcriber.send(startMs, pcm)
    },
    status(sense, status) {
      if (senses[sense] === status) return
      senses[sense] = status
      report()
    },
    state(state, reason) {
      log.write({ event: "capture", state, reason })
    },
  }).catch(async (error) => {
    await transcriber.stop()
    await client.stop(meeting.id).catch(() => undefined)
    throw error
  })

  return {
    meetingID: meeting.id,
    look(exclude: BrowserWindow[]) {
      return captureFrame(exclude)
    },
    // Ends capture first so no audio arrives after the engine's final flush, then closes the open segments and the
    // meeting. `unsent` counts segments that never reached the record.
    async stop() {
      await capture.stop()
      log.write({ event: "capture", state: "stopped" })
      await transcriber.stop()
      cutter.flush()
      const result = await client.stop(meeting.id)
      await log.flush()
      return result
    },
  }
}
