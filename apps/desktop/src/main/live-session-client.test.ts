import { afterEach, expect, test } from "bun:test"
import { parseFrame, sessionClient, type LiveSessionEvent } from "./live-session-client"

const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(() => servers.splice(0).forEach((server) => server.stop(true)))

const frame = (type: string, data: Record<string, unknown>) => `id: 1\ndata: ${JSON.stringify({ id: "evt", type, data })}\n\n`

// A stand-in for the server: session create and prompt record their bodies; the event stream sends `events` in
// pieces that split frames, then stays open.
function fakeServer(events: string[]) {
  const seen = { requests: [] as { path: string; auth: string; body?: unknown }[] }
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const auth = request.headers.get("authorization") ?? ""
      if (url.pathname === "/api/event") {
        seen.requests.push({ path: url.pathname, auth })
        const text = events.join("")
        const middle = Math.floor(text.length / 2)
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(text.slice(0, middle)))
              controller.enqueue(new TextEncoder().encode(text.slice(middle)))
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        )
      }
      seen.requests.push({ path: url.pathname, auth, body: await request.json() })
      if (url.pathname === "/api/session") return Response.json({ data: { id: "ses_live" } })
      return Response.json({ data: {} })
    },
  })
  servers.push(server)
  return { url: `http://127.0.0.1:${server.port}`, seen }
}

test("creates the live session and admits prompts with their delivery", async () => {
  const fake = fakeServer([])
  const client = sessionClient({ url: fake.url, password: "pw" })
  const sessionID = await client.create()
  await client.prompt(sessionID, { text: "hi", files: [{ uri: "data:image/jpeg;base64,AA", name: "screen.jpg" }] }, "queue")
  expect(sessionID).toBe("ses_live")
  expect(fake.seen.requests).toEqual([
    { path: "/api/session", auth: `Basic ${Buffer.from("orchestra:pw").toString("base64")}`, body: { agent: "live" } },
    {
      path: "/api/session/ses_live/prompt",
      auth: `Basic ${Buffer.from("orchestra:pw").toString("base64")}`,
      body: { prompt: { text: "hi", files: [{ uri: "data:image/jpeg;base64,AA", name: "screen.jpg" }] }, delivery: "queue" },
    },
  ])
})

test("follows this session's deltas, text and status across split frames", async () => {
  const fake = fakeServer([
    frame("server.connected", {}),
    frame("session.next.text.delta", { sessionID: "other", delta: "no" }),
    frame("session.next.text.delta", { sessionID: "ses_live", delta: "**Yes" }),
    frame("session.next.text.delta", { sessionID: "ses_live", delta: ".**" }),
    frame("session.next.text.ended", { sessionID: "ses_live", text: "**Yes.**" }),
    frame("session.status", { sessionID: "ses_live", status: { type: "busy" } }),
    frame("session.status", { sessionID: "ses_live", status: { type: "idle" } }),
  ])
  const events: LiveSessionEvent[] = []
  const abort = new AbortController()
  const done = sessionClient({ url: fake.url }).follow(
    "ses_live",
    (event) => {
      events.push(event)
      if (event.kind === "idle") abort.abort()
    },
    abort.signal,
  )
  await done
  expect(events).toEqual([
    { kind: "delta", delta: "**Yes" },
    { kind: "delta", delta: ".**" },
    { kind: "text", text: "**Yes.**" },
    { kind: "busy" },
    { kind: "idle" },
  ])
})

test("a failed step carries its message; garbage frames are skipped", () => {
  expect(
    parseFrame(`data: ${JSON.stringify({ type: "session.next.step.failed", data: { sessionID: "s", error: { message: "rate limited" } } })}`, "s"),
  ).toEqual({ kind: "failed", message: "rate limited" })
  expect(parseFrame("data: {not json", "s")).toBeUndefined()
  expect(parseFrame(": keepalive", "s")).toBeUndefined()
})

test("the seat's live_look call becomes a look request with its question", () => {
  const called = (input: Record<string, unknown>, tool = "live_look") =>
    parseFrame(frame("session.next.tool.called", { sessionID: "s", tool, input, provider: { executed: false } }), "s")
  expect(called({ question: "Which slide?" })).toEqual({ kind: "look", question: "Which slide?" })
  expect(called({ question: " " })).toEqual({ kind: "look" })
  expect(called({})).toEqual({ kind: "look" })
  expect(called({ path: "a" }, "read")).toBeUndefined()
})
