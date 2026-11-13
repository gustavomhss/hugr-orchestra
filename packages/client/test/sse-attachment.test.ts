import { expect, test } from "bun:test"
import { Orchestra } from "../src"
import type { SessionEventEncoded } from "../src/wire"

test.each([0, 16_384])("session SSE preserves a CLI-sized attachment with chunk size %i", async (size) => {
  const event = {
    id: "evt_attachment",
    type: "session.next.prompt.admitted",
    durable: { aggregateID: "ses_attachment", seq: 1, version: 1 },
    data: {
      timestamp: 1_717_171_717_000,
      sessionID: "ses_attachment",
      messageID: "msg_attachment",
      delivery: "steer",
      prompt: {
        text: "Describe the image",
        files: [{ uri: `data:image/png;base64,${Buffer.alloc(10 * 1024 * 1024).toString("base64")}`, mime: "image/png" }],
      },
    },
  } satisfies SessionEventEncoded
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (size === 0) controller.enqueue(bytes)
      if (size > 0)
        for (let offset = 0; offset < bytes.length; offset += size)
          controller.enqueue(bytes.subarray(offset, offset + size))
      controller.close()
    },
  })
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }),
  })
  const events = []
  for await (const received of client.sessions.events({ sessionID: "ses_attachment" })) events.push(received)
  expect(events).toEqual([event])
})

test.each([["\n", "\n"], ["\r", "\n\r\n"], ["\n\r", "\n"]])(
  "SSE accepts an exact-limit frame with split delimiter %j",
  async (first, last) => {
    const limit = 128 * 1024 * 1024
    const overhead = 'data: {"padding":""}'.length
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: {"padding":"${"x".repeat(limit - overhead)}"}${first}`))
        controller.enqueue(new TextEncoder().encode(last))
        controller.close()
      },
    })
    const client = Orchestra.make({
      baseUrl: "http://localhost:3000",
      fetch: async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }),
    })
    const iterator = client.events.subscribe()[Symbol.asyncIterator]()
    const received = await iterator.next()
    expect(received.done).toBe(false)
    if (received.done) throw new Error("Expected an exact-limit frame")
    // Do not copy or print the 128-Mi-unit payload in the assertion.
    expect("padding" in received.value && typeof received.value.padding === "string" && received.value.padding.length).toBe(
      limit - overhead,
    )
    expect((await iterator.next()).done).toBe(true)
  },
)

test.each([true, false])("SSE refuses an oversized frame, complete=%j", async (complete) => {
  const state = { cancelled: false }
  const deadline = Promise.withResolvers<void>()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(128 * 1024 * 1024)))
      controller.enqueue(new TextEncoder().encode(complete ? "x\n\n" : "x"))
      if (complete) controller.close()
      if (!complete) void deadline.promise.then(() => controller.error(new Error("Incomplete frame was not bounded")))
    },
    cancel() {
      state.cancelled = true
    },
  })
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }),
  })
  const timer = setTimeout(() => deadline.resolve(), 3000)
  try {
    await expect(client.events.subscribe()[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      name: "ClientError",
      reason: "MalformedResponse",
    })
    if (!complete) expect(state.cancelled).toBe(true)
  } finally {
    clearTimeout(timer)
  }
})
