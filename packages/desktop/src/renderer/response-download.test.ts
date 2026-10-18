import { expect, test } from "bun:test"
import { RESPONSE_DOWNLOAD_CHUNK_BYTES, type ResponseDownloadAPI, type ResponseDownloadResult } from "../preload/response-download"
import { responseDownloadFixture } from "../main/response-download.fixture"
import { rejection } from "../main/rejection.fixture"
import { createResponseDownloader } from "./response-download"
import { open, readdir, readFile, rename, writeFile } from "node:fs/promises"

test("bounded IPC copies preserve large source chunks and wait for each disk acknowledgement", async () => {
  const fixture = await responseDownloadFixture()
  const writing = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const metrics = { pulls: 0, sizes: [] as number[], sequences: [] as number[] }
  const downloader = createResponseDownloader({ ...fixture.api, async write(handle, sequence, bytes) {
    metrics.sizes.push(bytes.byteLength)
    metrics.sequences.push(sequence)
    if (sequence === 0) { writing.resolve(); await release.promise }
    return fixture.api.write(handle, sequence, bytes)
  } })
  const bytes = Uint8Array.from({ length: RESPONSE_DOWNLOAD_CHUNK_BYTES * 2 + 17 }, (_, index) => index % 256)
  const response = new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    metrics.pulls++
    if (metrics.pulls === 1) { controller.enqueue(bytes); return }
    controller.close()
  } }, { highWaterMark: 0 }))
  try {
    const saving = downloader.downloadResponse(response, "download.bin")
    await writing.promise
    expect(metrics.pulls).toBe(1)
    expect(metrics.sizes).toEqual([RESPONSE_DOWNLOAD_CHUNK_BYTES])
    release.resolve()
    await saving
    expect(metrics.sizes).toEqual([RESPONSE_DOWNLOAD_CHUNK_BYTES, RESPONSE_DOWNLOAD_CHUNK_BYTES, 17])
    expect(metrics.sequences).toEqual([0, 1, 2])
    expect(await readFile(fixture.destination)).toEqual(Buffer.from(bytes))
    expect(response.body?.locked).toBe(false)
  } finally { release.resolve(); downloader.dispose(); await fixture.close() }
})

test("chooser cancel does not pull body and cancels source once; denial is NotAllowedError", async () => {
  for (const status of ["cancelled", "error"] as const) {
    const metrics = { pulls: 0, cancels: 0, targets: 0 }
    const api: ResponseDownloadAPI = {
      start: async () => ({ status: "ok", handle: "opaque" }),
      ready: async () => status === "cancelled" ? { status } : { status, code: "permission_denied" },
      write: async () => { throw new Error("Body must not be written") },
      finish: async () => { throw new Error("Save must not finish") },
      cancel: async () => { metrics.targets++; return { status: "cancelled" } },
    }
    const downloader = createResponseDownloader(api)
    const response = new Response(new ReadableStream<Uint8Array>({
      pull() { metrics.pulls++ }, cancel() { metrics.cancels++ },
    }, { highWaterMark: 0 }))
    const error = await rejection(downloader.downloadResponse(response, "download"))
    expect(error instanceof DOMException && error.name).toBe(status === "cancelled" ? "AbortError" : "NotAllowedError")
    expect(metrics).toEqual({ pulls: 0, cancels: 1, targets: 1 })
    expect(response.body?.locked).toBe(false)
    downloader.dispose()
  }
})

test("source abort while chooser pending promptly cancels target without reading body", async () => {
  const entered = Promise.withResolvers<void>()
  const choice = Promise.withResolvers<{ canceled: boolean; filePath: string }>()
  const fixture = await responseDownloadFixture({ choose: () => { entered.resolve(); return choice.promise } })
  const downloader = createResponseDownloader(fixture.api)
  const body = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { body.resolve(controller) } }, { highWaterMark: 0 }))
  const reason = new DOMException("upstream abort", "AbortError")
  try {
    const saving = rejection(downloader.downloadResponse(response, "download"))
    await entered.promise
    ;(await body.promise).error(reason)
    expect(await saving).toBe(reason)
    choice.resolve({ canceled: false, filePath: fixture.destination })
    await Promise.resolve()
    expect(await readdir(fixture.root)).toEqual([])
    expect(response.body?.locked).toBe(false)
  } finally { choice.resolve({ canceled: true, filePath: fixture.destination }); downloader.dispose(); await fixture.close() }
})

test("unmount cancels pending source read; source failure and disk denial preserve prior destination", async () => {
  const fixture = await responseDownloadFixture()
  const downloader = createResponseDownloader(fixture.api)
  const pulled = Promise.withResolvers<void>()
  const metrics = { cancels: 0 }
  const response = new Response(new ReadableStream<Uint8Array>({
    pull() { pulled.resolve() }, cancel() { metrics.cancels++ },
  }, { highWaterMark: 0 }))
  try {
    const saving = rejection(downloader.downloadResponse(response, "download"))
    await pulled.promise
    downloader.dispose()
    const error = await saving
    expect(error instanceof DOMException && error.name).toBe("AbortError")
    expect(metrics.cancels).toBe(1)
    expect(await readdir(fixture.root)).toEqual([])
  } finally { downloader.dispose(); await fixture.close() }

  const denied = await responseDownloadFixture({ open: async (path) => {
    const file = await open(path, "wx", 0o600)
    return { write: async () => { throw Object.assign(new Error("disk denied"), { code: "EPERM" }) }, close: () => file.close() }
  } })
  const saving = createResponseDownloader(denied.api)
  try {
    await writeFile(denied.destination, "prior file")
    const error = await rejection(saving.downloadResponse(new Response(new Uint8Array([0, 255])), "download"))
    expect(error instanceof DOMException && error.name).toBe("NotAllowedError")
    expect(await readFile(denied.destination, "utf8")).toBe("prior file")
    expect(await readdir(denied.root)).toEqual(["download.bin"])
  } finally { saving.dispose(); await denied.close() }
})

test("stream error after acknowledged bytes propagates original error and removes partial save", async () => {
  const fixture = await responseDownloadFixture()
  const downloader = createResponseDownloader(fixture.api)
  const reason = new Error("provider stream interrupted")
  const state = { pulls: 0 }
  const response = new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (state.pulls++ === 0) { controller.enqueue(new Uint8Array([0, 255, 10])); return }
    controller.error(reason)
  } }, { highWaterMark: 0 }))
  try {
    await writeFile(fixture.destination, "prior file")
    expect(await rejection(downloader.downloadResponse(response, "download"))).toBe(reason)
    expect(await readFile(fixture.destination, "utf8")).toBe("prior file")
    expect(await readdir(fixture.root)).toEqual(["download.bin"])
    expect(fixture.metrics.closes).toBe(1)
  } finally { downloader.dispose(); await fixture.close() }
})

test("unmount before start acknowledgement cancels late capability exactly once", async () => {
  const opening = Promise.withResolvers<{ status: "ok"; handle: string }>()
  const entered = Promise.withResolvers<void>()
  const cancelled = Promise.withResolvers<void>()
  const metrics = { sources: 0, targets: 0 }
  const downloader = createResponseDownloader({
    start: () => { entered.resolve(); return opening.promise },
    ready: async () => { throw new Error("Disposed save must not open chooser") },
    write: async () => { throw new Error("Disposed save must not write") },
    finish: async () => { throw new Error("Disposed save must not commit") },
    cancel: async (handle) => {
      expect(handle).toBe("late-capability")
      metrics.targets++
      cancelled.resolve()
      return { status: "cancelled" }
    },
  })
  const response = new Response(new ReadableStream<Uint8Array>({ cancel() { metrics.sources++ } }, { highWaterMark: 0 }))
  const saving = rejection(downloader.downloadResponse(response, "download"))
  await entered.promise
  downloader.dispose()
  const error = await saving
  expect(error instanceof DOMException && error.name).toBe("AbortError")
  expect(metrics).toEqual({ sources: 1, targets: 0 })
  opening.resolve({ status: "ok", handle: "late-capability" })
  await cancelled.promise
  expect(metrics).toEqual({ sources: 1, targets: 1 })
})

test("unmount during disk write cancels source immediately and waits for single handle close", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const cancelled = Promise.withResolvers<void>()
  const metrics = { pulls: 0, closes: 0 }
  const fixture = await responseDownloadFixture({ open: async (path) => {
    const file = await open(path, "wx", 0o600)
    return {
      async write(bytes, offset, length) { entered.resolve(); await release.promise; return file.write(bytes, offset, length) },
      close() { metrics.closes++; return file.close() },
    }
  } })
  const downloader = createResponseDownloader(fixture.api)
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) { metrics.pulls++; controller.enqueue(new Uint8Array([0, 255])) },
    cancel() { cancelled.resolve() },
  }, { highWaterMark: 0 }))
  try {
    const saving = rejection(downloader.downloadResponse(response, "download"))
    await entered.promise
    downloader.dispose()
    await cancelled.promise
    expect(response.body?.locked).toBe(false)
    expect(metrics).toEqual({ pulls: 1, closes: 0 })
    release.resolve()
    const error = await saving
    expect(error instanceof DOMException && error.name).toBe("AbortError")
    expect(metrics).toEqual({ pulls: 1, closes: 1 })
    expect(await readdir(fixture.root)).toEqual([])
  } finally { release.resolve(); downloader.dispose(); await fixture.close() }
})

test("dispose during finalization preserves the sink's cancellation, commit or failure outcome", async () => {
  for (const outcome of ["cancelled", "ok", "denied", "disk-error", "reply-error"] as const) {
    const checkpoint = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const cancelled = Promise.withResolvers<void>()
    const reason = new Error("finish acknowledgement failed")
    const metrics: { finishes: number; cancels: number; closes: number; result?: ResponseDownloadResult } = {
      finishes: 0, cancels: 0, closes: 0,
    }
    const fixture = await responseDownloadFixture({
      open: async (path) => {
        const file = await open(path, "wx", 0o600)
        return { write: (bytes, offset, length) => file.write(bytes, offset, length), async close() {
          metrics.closes++
          await file.close()
          if (outcome === "cancelled") { checkpoint.resolve(); await release.promise }
        } }
      },
      rename: async (source, destination) => {
        checkpoint.resolve()
        await release.promise
        if (outcome === "denied") throw Object.assign(new Error("rename denied"), { code: "EACCES" })
        if (outcome === "disk-error") throw Object.assign(new Error("rename failed"), { code: "EIO" })
        await rename(source, destination)
      },
    })
    const downloader = createResponseDownloader({ ...fixture.api,
      async finish(handle, sequence) {
        metrics.finishes++
        const result = await fixture.api.finish(handle, sequence)
        metrics.result = result
        if (outcome === "reply-error") throw reason
        return result
      },
      cancel(handle) { metrics.cancels++; cancelled.resolve(); return fixture.api.cancel(handle) },
    })
    const response = new Response(new Uint8Array([0, 255, 10]))
    try {
      await writeFile(fixture.destination, "prior file")
      const saving = downloader.downloadResponse(response, "download").then(() => undefined, (error: unknown) => error)
      await checkpoint.promise
      downloader.dispose()
      await cancelled.promise
      expect(await readFile(fixture.destination, "utf8")).toBe("prior file")
      release.resolve()
      const error = await saving
      if (outcome === "ok") expect(error).toBeUndefined()
      if (outcome === "cancelled") expect(error instanceof DOMException && error.name).toBe("AbortError")
      if (outcome === "denied") expect(error instanceof DOMException && error.name).toBe("NotAllowedError")
      if (outcome === "disk-error") expect(error instanceof Error && error.message).toBe("transfer_failed")
      if (outcome === "reply-error") expect(error).toBe(reason)
      expect(metrics.finishes).toBe(1)
      expect(metrics.cancels).toBe(1)
      expect(metrics.closes).toBe(1)
      expect(metrics.result).toEqual(outcome === "cancelled" ? { status: "cancelled" }
        : outcome === "denied" ? { status: "error", code: "permission_denied" }
        : outcome === "disk-error" ? { status: "error", code: "transfer_failed" } : { status: "ok" })
      expect(await readFile(fixture.destination)).toEqual(
        outcome === "ok" || outcome === "reply-error" ? Buffer.from([0, 255, 10]) : Buffer.from("prior file"),
      )
      expect(await readdir(fixture.root)).toEqual(["download.bin"])
      expect(response.body?.locked).toBe(false)
    } finally { release.resolve(); downloader.dispose(); await fixture.close() }
  }
}, 10000)

test("failure between a read and its continuation never starts another write or finish", async () => {
  const fixture = await responseDownloadFixture()
  const metrics = { writes: 0, finishes: 0, pulls: 0 }
  const downloader = createResponseDownloader({ ...fixture.api,
    write(handle, sequence, bytes) { metrics.writes++; return fixture.api.write(handle, sequence, bytes) },
    finish(handle, sequence) { metrics.finishes++; return fixture.api.finish(handle, sequence) },
  })
  const reason = new Error("source failed before continuation")
  const response = new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    metrics.pulls++
    controller.enqueue(new Uint8Array([0, 255]))
    queueMicrotask(() => controller.error(reason))
  } }, { highWaterMark: 0 }))
  try {
    expect(await rejection(downloader.downloadResponse(response, "download"))).toBe(reason)
    expect(metrics).toEqual({ writes: 0, finishes: 0, pulls: 1 })
    expect(fixture.metrics.closes).toBe(1)
    expect(await readdir(fixture.root)).toEqual([])
  } finally { downloader.dispose(); await fixture.close() }
})

test("pending clone-branch cancellation does not hold original failure or reader lock behind upstream cleanup", async () => {
  const fixture = await responseDownloadFixture()
  const reason = new Error("native acknowledgement failed")
  const downloader = createResponseDownloader({ ...fixture.api, async ready(handle) {
    expect(await fixture.api.ready(handle)).toEqual({ status: "ok" })
    throw reason
  } })
  const state: { controller?: ReadableStreamDefaultController<Uint8Array>; cancels: number } = { cancels: 0 }
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { state.controller = controller }, cancel() { state.cancels++ },
  }, { highWaterMark: 0 }))
  const clone = response.clone()
  const deadline = Promise.withResolvers<never>()
  const timer = setTimeout(() => deadline.reject(new Error("Save awaited pending clone cancellation")), 3000)
  try {
    const error = await Promise.race([rejection(downloader.downloadResponse(response, "download")), deadline.promise])
      .finally(() => clearTimeout(timer))
    expect(error).toBe(reason)
    expect(response.body?.locked).toBe(false)
    expect(state.cancels).toBe(0)
    expect(fixture.metrics.closes).toBe(1)
    expect(await readdir(fixture.root)).toEqual([])
    await clone.body?.cancel()
    expect(state.cancels).toBe(1)
  } finally {
    clearTimeout(timer)
    if (!state.cancels) state.controller?.close()
    await clone.body?.cancel().catch(() => undefined)
    downloader.dispose()
    await fixture.close()
  }
}, 10000)

test("completed source chunks are collectible while an actual save stays parked on its next read", async () => {
  const fixture = await responseDownloadFixture()
  const downloader = createResponseDownloader(fixture.api)
  const parked = Promise.withResolvers<void>()
  const chunks: WeakRef<Uint8Array>[] = []
  const state: { controller?: ReadableStreamDefaultController<Uint8Array>; produced: number } = { produced: 0 }
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { state.controller = controller },
    pull(controller) {
      if (state.produced === 32) { parked.resolve(); return }
      const bytes = new Uint8Array(16 * 1024).fill(state.produced++)
      chunks.push(new WeakRef(bytes))
      controller.enqueue(bytes)
    },
  }, { highWaterMark: 0 }))
  const saving = downloader.downloadResponse(response, "download")
  try {
    await parked.promise
    expect(chunks).toHaveLength(32)
    expect(fixture.metrics.writes).toBeGreaterThanOrEqual(32)
    const held = new Uint8Array(1)
    const alive = new WeakRef(held)
    const released = (() => new WeakRef(new Uint8Array(1)))()
    // Use actual object reachability, not RSS estimates or a replacement Promise implementation.
    for (let pass = 0; pass < 4; pass++) { await Bun.sleep(0); Bun.gc(true) }
    expect(alive.deref()).toBe(held)
    expect(released.deref()).toBeUndefined()
    // Engines may retain the most recent loop value; retaining every completed race result is the regression.
    expect(chunks.filter((chunk) => chunk.deref() !== undefined).length).toBeLessThanOrEqual(2)
    state.controller?.close()
    await saving
  } finally {
    downloader.dispose()
    await saving.catch(() => undefined)
    await fixture.close()
  }
}, 10000)
