import { Option, Schema } from "effect"

import { liveRequest, type MeetingServer } from "./live-meeting-client"

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

export type LivePrompt = { text: string; files?: { uri: string; name?: string }[] }

const RECONNECT_MS = 1000

export function sessionClient(server: MeetingServer) {
  const request = liveRequest(server)
  return {
    async create() {
      const body: { data: { id: string } } = await (await request.post("/api/session", { agent: "live" })).json()
      return body.data.id
    },
    async prompt(sessionID: string, prompt: LivePrompt, delivery: "steer" | "queue") {
      await request.post(`/api/session/${sessionID}/prompt`, { prompt, delivery })
    },
    // Follows the stream until `signal` aborts, reconnecting after a drop. Events of other sessions are skipped.
    async follow(sessionID: string, onEvent: (event: LiveSessionEvent) => void, signal: AbortSignal) {
      while (!signal.aborted) {
        await read(request, sessionID, onEvent, signal).catch(() => undefined)
        if (!signal.aborted) await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS))
      }
    },
  }
}

async function read(
  request: ReturnType<typeof liveRequest>,
  sessionID: string,
  onEvent: (event: LiveSessionEvent) => void,
  signal: AbortSignal,
) {
  const response = await fetch(request.endpoint("/api/event"), {
    headers: { authorization: request.headers.get("authorization") ?? "", accept: "text/event-stream" },
    signal,
  })
  if (!response.ok || !response.body) throw new Error(`/api/event answered ${response.status}`)
  const buffer = { text: "" }
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    buffer.text += chunk
    const frames = buffer.text.split("\n\n")
    buffer.text = frames.pop() ?? ""
    frames.forEach((frame) => {
      const event = parseFrame(frame, sessionID)
      if (event) onEvent(event)
    })
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
  const status = (body.status as { type?: unknown } | undefined)?.type
  if (event.type === "session.status" && status === "busy") return { kind: "busy" }
  if (event.type === "session.status" && status === "idle") return { kind: "idle" }
}

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

function describe(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string")
    return error.message
  return "The live seat could not answer."
}
