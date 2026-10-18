import { expect, test } from "bun:test"
import type { Platform } from "@/context/platform"
import { saveActionsResponse } from "./save"

const platform: Platform = { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} }

test("typed platform seam receives exact response and decoded native filename", async () => {
  const response = new Response(new Uint8Array([0, 255, 10]), {
    headers: { "content-disposition": "attachment; filename*=UTF-8''job%20log.zip" },
  })
  const seen: { response?: Response; filename?: string } = {}
  await saveActionsResponse(response, { ...platform, downloadResponse: async (value, filename) => {
    seen.response = value
    seen.filename = filename
    const reader = value.body!.getReader()
    try {
      expect((await reader.read()).value).toEqual(new Uint8Array([0, 255, 10]))
      expect((await reader.read()).done).toBe(true)
    } finally { reader.releaseLock() }
  } })
  expect(seen).toEqual({ response, filename: "job log.zip" })
})

test("native cancellation and transfer errors propagate; untouched source is cancelled", async () => {
  for (const error of [new DOMException("", "AbortError"), new DOMException("permission_denied", "NotAllowedError"), new Error("stream interrupted")]) {
    const metrics = { cancels: 0 }
    const response = new Response(new ReadableStream<Uint8Array>({ cancel() { metrics.cancels++ } }, { highWaterMark: 0 }))
    const result = await saveActionsResponse(response, { ...platform, downloadResponse: async () => { throw error } })
      .then(() => { throw new Error("Expected save rejection") }, (reason: unknown) => reason)
    expect(result).toBe(error)
    expect(metrics.cancels).toBe(1)
  }
})

test("save failure propagates while response clone keeps source cancellation pending", async () => {
  const state: { controller?: ReadableStreamDefaultController<Uint8Array>; cancels: number } = { cancels: 0 }
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { state.controller = controller }, cancel() { state.cancels++ },
  }, { highWaterMark: 0 }))
  const clone = response.clone()
  const reason = new Error("native save failed")
  const deadline = Promise.withResolvers<never>()
  const timer = setTimeout(() => deadline.reject(new Error("Actions save awaited clone cancellation")), 3000)
  try {
    const result = await Promise.race([
      saveActionsResponse(response, { ...platform, downloadResponse: async () => { throw reason } })
        .then(() => { throw new Error("Expected save rejection") }, (error: unknown) => error),
      deadline.promise,
    ]).finally(() => clearTimeout(timer))
    expect(result).toBe(reason)
    expect(state.cancels).toBe(0)
    expect(response.body?.locked).toBe(false)
    await clone.body?.cancel()
    expect(state.cancels).toBe(1)
  } finally {
    clearTimeout(timer)
    if (!state.cancels) state.controller?.close()
    await clone.body?.cancel().catch(() => undefined)
  }
}, 10000)
