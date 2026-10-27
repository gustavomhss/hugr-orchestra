import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

// A JSON-lines transport log per meeting, for diagnosis: connects, close reasons, latency per segment. It never holds
// audio, transcript text or keys; callers pass only the fields below.

export type TransportEntry =
  | { event: "open"; attempt: number; replayFromMs: number }
  | { event: "close"; attempt: number; code: number; reason: string; retryInSeconds: number; watermarkMs: number }
  | { event: "segment"; track: "me" | "them"; startMs: number; endMs: number; latencyMs: number }
  | { event: "append-failed"; reason: string; pending: number }
  | { event: "capture"; state: "started" | "restarted" | "stopped" | "failed"; reason?: string }
  // The live loop: one line per answer with its time to first text, and its failures.
  | { event: "answer"; kind: "answer" | "suggestion" | "stop" | "notice"; latencyMs: number; failed?: string }
  | { event: "prompt-failed"; kind: "answer" | "suggestion" | "stop" | "notice"; reason: string }
  | { event: "session-failed" | "senses-failed" | "senses-stop-failed" | "look-failed"; reason: string }
  | { event: "stopped"; unsent?: number }
  // The bridge: the meeting started on fewer sources than the owner asked for, and renames that did not reach the record.
  | { event: "sources"; microphone: boolean; systemAudio: boolean }
  | { event: "rename-failed"; reason: string }

export function transportLog(directory: string, meetingID: string) {
  const file = join(directory, `${meetingID}.jsonl`)
  const ready = mkdir(directory, { recursive: true })
  // Writes are chained so lines keep their order; a failed write is dropped, never thrown into the meeting.
  const state = { queue: ready.then(() => undefined) as Promise<void> }
  return {
    file,
    write(entry: TransportEntry) {
      const line = JSON.stringify({ at: Date.now(), ...entry }) + "\n"
      state.queue = state.queue.then(() => appendFile(file, line)).catch(() => undefined)
    },
    flush() {
      return state.queue
    },
  }
}
