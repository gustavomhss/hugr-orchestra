import { describe, expect, test } from "bun:test"
import { createRequestOwner, previewResponse, saveResponse } from "./requests"

function deferred<T>() {
  const result: { resolve?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => { result.resolve = resolve })
  return { promise, resolve(value: T) { result.resolve?.(value) } }
}

describe("Actions request ownership", () => {
  test("deduplicates a read and rejects a late same-resource response after supersession", async () => {
    const owner = createRequestOwner()
    const old = deferred<string>()
    const fresh = deferred<string>()
    const started = deferred<AbortSignal>()
    const values: string[] = []
    const errors: unknown[] = []
    const first = owner.run("run", "binding:1/run:old/attempt:1", async (handle) => {
      started.resolve(handle.signal)
      const value = await old.promise
      if (handle.current()) values.push(value)
    }, (error) => errors.push(error))
    const signal = await started.promise
    const duplicate = owner.run("run", "binding:1/run:old/attempt:1", async () => { throw new Error("duplicate started") },
      (error) => errors.push(error))
    expect(duplicate).toBe(first)
    const second = owner.run("run", "binding:1/run:new/attempt:2", async (handle) => {
      const value = await fresh.promise
      if (handle.current()) values.push(value)
    }, (error) => errors.push(error))
    expect(signal.aborted).toBe(true)
    fresh.resolve("new")
    await second
    old.resolve("old")
    await first
    expect(values).toEqual(["new"])
    expect(errors).toEqual([])
    owner.dispose()
  })

  test("route reset aborts reads, disposal aborts lifetime commands, callbacks cannot revive either", async () => {
    const owner = createRequestOwner()
    const read = deferred<void>()
    const command = deferred<void>()
    const signals: AbortSignal[] = []
    const started = deferred<void>()
    const committed: string[] = []
    const reading = owner.run("read", "a", async (handle) => {
      signals.push(handle.signal)
      await read.promise
      if (handle.current()) committed.push("read")
    }, () => committed.push("error"))
    const writing = owner.run("command", "intent", async (handle) => {
      signals.push(handle.signal)
      started.resolve()
      await command.promise
      if (handle.current()) committed.push("command")
    }, () => committed.push("error"), true)
    await started.promise
    owner.reset()
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false])
    owner.dispose()
    owner.dispose()
    expect(signals.map((signal) => signal.aborted)).toEqual([true, true])
    read.resolve()
    command.resolve()
    await Promise.all([reading, writing])
    await owner.run("new", "b", async () => { committed.push("revived") }, () => committed.push("error"))
    expect(committed).toEqual([])
  })
})

describe("Actions bounded output", () => {
  test("preview keeps the byte bound and cancels before requesting another chunk", async () => {
    const metrics = { pulls: 0, cancels: 0 }
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { metrics.pulls++; controller.enqueue(new Uint8Array(8192).fill(120)) },
      cancel() { metrics.cancels++ },
    }, { highWaterMark: 0 }))
    const preview = await previewResponse(response, new AbortController().signal)
    expect(preview).toEqual({ text: "x".repeat(64 * 1024), truncated: true })
    expect(metrics).toEqual({ pulls: 8, cancels: 1 })
    expect(response.body?.locked).toBe(false)
  })

  test("preview decodes split UTF-8 incrementally and retains blank lines", async () => {
    const bytes = new TextEncoder().encode("\n雪\n\n")
    const metrics = { offset: 0 }
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (metrics.offset === bytes.length) { controller.close(); return }
        controller.enqueue(bytes.subarray(metrics.offset, ++metrics.offset))
      },
    }, { highWaterMark: 0 }))
    expect(await previewResponse(response, new AbortController().signal)).toEqual({ text: "\n雪\n\n", truncated: false })
    expect(response.body?.locked).toBe(false)
  })

  test("abort releases a pending preview reader even when transport ignores AbortSignal", async () => {
    const started = deferred<void>()
    const metrics = { cancels: 0 }
    const response = new Response(new ReadableStream<Uint8Array>({
      pull() { started.resolve() }, cancel() { metrics.cancels++ },
    }, { highWaterMark: 0 }))
    const abort = new AbortController()
    const preview = previewResponse(response, abort.signal).catch((error: unknown) => error)
    await started.promise
    abort.abort()
    const error = await preview
    expect(error instanceof DOMException && error.name).toBe("AbortError")
    expect(metrics.cancels).toBe(1)
    expect(response.body?.locked).toBe(false)
  })

  test("download forwards binary bytes with backpressure and abort fails a partial save", async () => {
    const pulled = deferred<void>()
    const metrics = { pulls: 0, cancels: 0 }
    const received: number[][] = []
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        metrics.pulls++
        if (metrics.pulls === 1) { controller.enqueue(new Uint8Array([0, 255, 10, 10])); return }
        pulled.resolve()
      },
      cancel() { metrics.cancels++ },
    }, { highWaterMark: 0 }), { headers: { "content-type": "application/octet-stream" } })
    const abort = new AbortController()
    const saved = saveResponse(response, abort.signal, async (streamed) => {
      expect(streamed.headers.get("content-type")).toBe("application/octet-stream")
      const reader = streamed.body?.getReader()
      if (!reader) throw new Error("missing save reader")
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) return
          received.push([...chunk.value])
        }
      } finally { reader.releaseLock() }
    }).catch((error: unknown) => error)
    await pulled.promise
    abort.abort()
    const error = await saved
    expect(error instanceof DOMException && error.name).toBe("AbortError")
    expect(received).toEqual([[0, 255, 10, 10]])
    expect(metrics).toEqual({ pulls: 2, cancels: 1 })
    expect(response.body?.locked).toBe(false)
  })
})
