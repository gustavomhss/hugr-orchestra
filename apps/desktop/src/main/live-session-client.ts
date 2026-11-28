import { Option, Schema } from "effect"

import { setTimeout } from "node:timers/promises"
import { liveRequest, type MeetingServer } from "./live-meeting-client"
import { liveSessionHeaders, liveSessionRequest } from "./live-session-request"

// The live seat's session from main: create it, admit prompts, and follow its answer stream. Text deltas and status
// are live-only, so they come from the server-wide event stream (`/api/event`), filtered to this session; the
// per-session stream carries durable events only.

export type LiveSessionEvent =
  | { kind: "delta"; delta: string }
  | { kind: "text"; text: string }
  | { kind: "failed"; message: string }
  | { kind: "busy" }
  | { kind: "idle" }
  // The seat asked for a frame through its `live_look` tool; only the desktop can capture one.
  | { kind: "look"; question?: string }
  // A prompt with files reached the seat's history: the steps after it can see the frame.
  | { kind: "framed" }

export type LivePrompt = { text: string; files?: { uri: string; name?: string }[] }

const RECONNECT_MS = 1000

export function sessionClient(server: MeetingServer, owner?: AbortSignal) {
  const request = liveRequest(server)
  return {
    async create(model?: { providerID: string; id: string }) {
      return liveSessionRequest(request, "/api/session", {
        method: "POST", body: JSON.stringify({ agent: "live", model }),
      }, owner, async (response) => {
        const body: { data: { id: string } } = await response.json()
        return body.data.id
      })
    },
    async prompt(sessionID: string, prompt: LivePrompt, delivery: "steer" | "queue") {
      await liveSessionRequest(request, `/api/session/${sessionID}/prompt`, {
        method: "POST", body: JSON.stringify({ prompt, delivery }),
      }, owner, async (response) => { await response.arrayBuffer() })
    },
    async follow(sessionID: string, onEvent: (event: LiveSessionEvent) => void, follow: AbortSignal) {
      const signal = owner ? AbortSignal.any([owner, follow]) : follow
      while (!signal.aborted) {
        await read(request, sessionID, onEvent, signal).catch(() => undefined)
        if (!signal.aborted) await setTimeout(RECONNECT_MS, undefined, { signal }).catch(() => undefined)
      }
    },
  }
}

async function read(request: ReturnType<typeof liveRequest>, sessionID: string, onEvent: (event: LiveSessionEvent) => void, signal: AbortSignal) {
  const response = await liveSessionHeaders(request, "/api/event", signal)
  if (!response.body) throw new Error("/api/event answered without a body")
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  const buffer = { text: "" }
  try {
    while (!signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) return
      buffer.text += chunk.value
      const frames = buffer.text.split("\n\n")
      buffer.text = frames.pop() ?? ""
      frames.forEach((frame) => {
        if (signal.aborted) return
        const event = parseFrame(frame, sessionID)
        if (event) onEvent(event)
      })
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export function parseFrame(frame: string, sessionID: string): LiveSessionEvent | undefined {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
  if (!data) return
  const event = Option.getOrUndefined(decodeJson(data))
  if (typeof event !== "object" || event === null || !("type" in event) || !("data" in event)) return
  const body = event.data as Record<string, unknown> | null
  if (!body || body.sessionID !== sessionID) return
  if (event.type === "session.next.text.delta" && typeof body.delta === "string") return { kind: "delta", delta: body.delta }
  if (event.type === "session.next.text.ended" && typeof body.text === "string") return { kind: "text", text: body.text }
  if (event.type === "session.next.step.failed") return { kind: "failed", message: describe(body.error) }
  if (event.type === "session.next.tool.called" && body.tool === "live_look") {
    const question = (body.input as { question?: unknown } | undefined)?.question
    return typeof question === "string" && question.trim() ? { kind: "look", question } : { kind: "look" }
  }
  if (event.type === "session.next.prompted") {
    const files = (body.prompt as { files?: unknown } | undefined)?.files
    return Array.isArray(files) && files.length ? { kind: "framed" } : undefined
  }
  // The V2 server sends no status events: a step start means busy, and a step that ends without tool calls ends the turn.
  if (event.type === "session.next.step.started") return { kind: "busy" }
  if (event.type === "session.next.step.ended" && body.finish !== "tool-calls") return { kind: "idle" }
}

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

function describe(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string")
    return error.message
  return "The live seat could not answer."
}
