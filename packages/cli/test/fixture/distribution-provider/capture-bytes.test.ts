import { expect, test } from "bun:test"
import { captureByteCap, readCaptureBytes, requireCaptureLength } from "../distribution-provider-bytes"
import { decodeCaptureRequest, streamedCompletion } from "../distribution-provider-wire"

test("header cap accepts exact boundary and rejects malformed or oversized lengths", () => {
  for (const length of [null, "0", String(captureByteCap)]) expect(() => requireCaptureLength(length)).not.toThrow()
  for (const length of ["", "-1", "NaN", "Infinity", "1.5", String(captureByteCap + 1), "999999999999999999999999"])
    expect(() => requireCaptureLength(length)).toThrow(new Error("PROVIDER_CAPTURE_REQUEST_TOO_LARGE"))
})

test("bounded reader returns exact bytes and accepts exact 8 MiB boundary", async () => {
  const bytes = Uint8Array.from([0, 1, 2, 255])
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes.subarray(0, 2)); controller.enqueue(bytes.subarray(2)); controller.close()
  } })
  expect(await readCaptureBytes(body, { failure: "PROVIDER_CAPTURE_REQUEST_TOO_LARGE" })).toEqual(Buffer.from(bytes))
  expect(await readCaptureBytes(null, { failure: "PROVIDER_CAPTURE_REQUEST_TOO_LARGE" })).toEqual(Buffer.alloc(0))
  const boundary = new Uint8Array(captureByteCap).fill(7)
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(boundary); controller.close() } })
  expect(await readCaptureBytes(stream, { failure: "PROVIDER_CAPTURE_REQUEST_TOO_LARGE" })).toEqual(Buffer.from(boundary))
})

test("oversized request body fails by actual streamed bytes without trusting content length", async () => {
  const observed: string[] = []
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(captureByteCap)); controller.enqueue(Uint8Array.of(1))
  }, cancel(reason) { observed.push(reason.message) } })
  await expect(readCaptureBytes(body, { failure: "PROVIDER_CAPTURE_REQUEST_TOO_LARGE",
    report(error) { observed.push(error.message) } })).rejects.toThrow(new Error("PROVIDER_CAPTURE_REQUEST_TOO_LARGE"))
  expect(observed).toEqual(["PROVIDER_CAPTURE_REQUEST_TOO_LARGE", "PROVIDER_CAPTURE_REQUEST_TOO_LARGE"])
})

test("response overflow records then aborts shared upstream before tee cancellation can wait", async () => {
  const controller = new AbortController()
  const order: string[] = []
  const source = new ReadableStream<Uint8Array>({ start(upstream) {
    controller.signal.addEventListener("abort", () => { order.push("abort"); upstream.error(controller.signal.reason) })
    upstream.enqueue(new Uint8Array(captureByteCap + 1))
  } })
  const [forwarded, capture] = source.tee()
  await expect(readCaptureBytes(capture, { failure: "PROVIDER_CAPTURE_RESPONSE_TOO_LARGE", controller,
    report(error) { order.push(error.message) } })).rejects.toThrow(new Error("PROVIDER_CAPTURE_RESPONSE_TOO_LARGE"))
  await expect(forwarded.getReader().read()).rejects.toThrow(new Error("PROVIDER_CAPTURE_RESPONSE_TOO_LARGE"))
  expect(order).toEqual(["PROVIDER_CAPTURE_RESPONSE_TOO_LARGE", "abort"])
}, 1_000)

test("strict UTF8/JSON/model parsing preserves captured wire string", () => {
  const json = '{ "model": "qwen3:0.6b", "messages": [{"role":"user","content":"Olá"}] }'
  const bytes = new TextEncoder().encode(json)
  expect(decodeCaptureRequest(bytes, "qwen3:0.6b").json).toBe(json)
  expect(decodeCaptureRequest(bytes, "qwen3:0.6b").request.messages[0].content).toBe("Olá")
  expect(() => decodeCaptureRequest(bytes, "wrong-model")).toThrow(new Error("PROVIDER_CAPTURE_MODEL_MISMATCH"))
  expect(() => decodeCaptureRequest(Uint8Array.from([0xc3, 0x28]), "qwen3:0.6b")).toThrow()
  expect(() => decodeCaptureRequest(new TextEncoder().encode("{broken"), "qwen3:0.6b")).toThrow()
})

test("SSE parser joins real-format tool-call fragments and terminal text", () => {
  const sse = [
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"bash","arguments":"{\\\"command\\\":"}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\\"pwd\\\"}"}}]},"finish_reason":"tool_calls"}]}',
    'data: [DONE]',
  ].join("\r\n\r\n")
  expect(streamedCompletion(sse)).toEqual({ content: "", calls: [{ id: "call-1", name: "bash", arguments: '{"command":"pwd"}' }], finishes: ["tool_calls"] })
  expect(streamedCompletion('data: {"choices":[{"delta":{"content":"finished"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'))
    .toEqual({ content: "finished", calls: [], finishes: ["stop"] })
  expect(() => streamedCompletion('data: {"choices":[]}')).toThrow(new Error("OLLAMA_SSE_INCOMPLETE"))
  expect(() => streamedCompletion('data: {bad}\n\ndata: [DONE]')).toThrow()
})
