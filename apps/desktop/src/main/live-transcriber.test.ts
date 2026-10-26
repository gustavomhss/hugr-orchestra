import { afterEach, expect, test } from "bun:test"
import type { ServerWebSocket } from "bun"
import { createTranscriber, type TranscriberEvent } from "./live-transcriber"

// A local stand-in for the engine's streaming endpoint: it answers the token subprotocol, closes on CloseStream, and
// lets each test script its replies per connection as audio arrives, so no reply races the first sent chunk.
type Connection = { index: number; audio: number }

function fakeEngine(onAudio: (socket: ServerWebSocket<Connection>) => void) {
  const seen = { connections: 0, protocols: [] as string[], query: [] as URLSearchParams[], audio: 0 }
  const server = Bun.serve<Connection, undefined>({
    port: 0,
    fetch(request, server) {
      seen.protocols.push(request.headers.get("sec-websocket-protocol") ?? "")
      seen.query.push(new URL(request.url).searchParams)
      const upgraded = server.upgrade(request, {
        headers: { "Sec-WebSocket-Protocol": "token" },
        data: { index: seen.connections++, audio: 0 },
      })
      return upgraded ? undefined : new Response("no", { status: 400 })
    },
    websocket: {
      message(socket, message) {
        if (typeof message === "string") return message.includes("CloseStream") ? socket.close(1000) : undefined
        seen.audio += 1
        socket.data.audio += 1
        onAudio(socket)
      },
    },
  })
  servers.push(server)
  return { url: `ws://127.0.0.1:${server.port}/v1/listen`, seen }
}

const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(() => servers.splice(0).forEach((server) => server.stop(true)))

const results = (channel: number, start: number, duration: number, transcript: string, final = true) =>
  JSON.stringify({
    type: "Results",
    channel_index: [channel, 2],
    start,
    duration,
    is_final: final,
    speech_final: final,
    channel: { alternatives: [{ transcript }] },
  })

const until = async (check: () => boolean, ms = 5000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out")
    await Bun.sleep(10)
  }
}

const chunk = () => new Int16Array(640)

test("streams audio and reports pieces and end of speech in meeting time", async () => {
  const events: TranscriberEvent[] = []
  const engine = fakeEngine((socket) => socket.send(results(1, 0, 0.5, "hi there")))
  const transcriber = createTranscriber({ engine: "deepgram", model: "nova-3", key: "secret", url: engine.url }, (event) =>
    events.push(event),
  )
  await until(() => events.some((event) => event.kind === "open"))
  transcriber.send(2000, chunk())
  await until(() => events.some((event) => event.kind === "speech-end"))
  expect(engine.seen.protocols[0]).toBe("token, secret")
  expect(engine.seen.query[0].get("multichannel")).toBe("true")
  expect(engine.seen.query[0].get("channels")).toBe("2")
  expect(events.filter((event) => event.kind !== "open")).toEqual([
    { kind: "piece", piece: { track: "them", text: "hi there", startMs: 2000, endMs: 2500, final: true } },
    { kind: "speech-end", track: "them", atMs: 2500 },
  ])
  await transcriber.stop()
})

test("reconnects after a drop, replays unacknowledged audio and drops repeated finals", async () => {
  const events: TranscriberEvent[] = []
  const engine = fakeEngine((socket) => {
    if (socket.data.audio < 2) return
    if (socket.data.index === 0) {
      socket.send(results(0, 0, 0.02, "first"))
      return socket.close(1011, "engine overloaded")
    }
    // The replay starts at stream time 0 again, so the engine repeats the first final before the new one.
    socket.send(results(0, 0, 0.02, "first"))
    socket.send(results(0, 0.02, 0.02, "second"))
  })
  const transcriber = createTranscriber({ engine: "deepgram", model: "nova-3", key: "secret", url: engine.url }, (event) =>
    events.push(event),
  )
  await until(() => events.some((event) => event.kind === "open"))
  transcriber.send(0, chunk())
  transcriber.send(20, chunk())
  await until(() => events.some((event) => event.kind === "piece" && event.piece.text === "second"))
  expect(events.find((event) => event.kind === "close")).toEqual({
    kind: "close",
    attempt: 1,
    code: 1011,
    reason: "engine overloaded",
    retryInSeconds: 1,
    watermarkMs: 0,
  })
  expect(events.filter((event) => event.kind === "open").map((event) => event.attempt)).toEqual([0, 1])
  expect(
    events.flatMap((event) => (event.kind === "piece" ? [`${event.piece.text}@${event.piece.startMs}`] : [])),
  ).toEqual(["first@0", "second@20"])
  // Both chunks went out twice: live on the first socket, replayed on the second.
  expect(engine.seen.audio).toBe(4)
  await transcriber.stop()
})

test("a drop without a close frame reports 1006", async () => {
  const events: TranscriberEvent[] = []
  const engine = fakeEngine((socket) => socket.terminate())
  const transcriber = createTranscriber({ engine: "deepgram", model: "nova-3", key: "secret", url: engine.url }, (event) =>
    events.push(event),
  )
  await until(() => events.some((event) => event.kind === "open"))
  transcriber.send(0, chunk())
  await until(() => events.some((event) => event.kind === "close"))
  expect(events.find((event) => event.kind === "close")).toMatchObject({ code: 1006, attempt: 1 })
  await transcriber.stop()
})

test("rejects an unknown engine, a malformed model and a missing key", () => {
  const onEvent = () => {}
  expect(() => createTranscriber({ engine: "other" as "deepgram", model: "nova-3", key: "k" }, onEvent)).toThrow()
  expect(() => createTranscriber({ engine: "deepgram", model: "nova 3&x", key: "k" }, onEvent)).toThrow()
  expect(() => createTranscriber({ engine: "deepgram", model: "nova-3", key: "" }, onEvent)).toThrow()
})
