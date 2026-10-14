import { expect, test } from "bun:test"
import { RESPONSE_DOWNLOAD_CHUNK_BYTES, type ResponseDownloadAPI } from "../preload/response-download"
import { responseDownloadFixture } from "../main/response-download.fixture"
import { rejection } from "../main/rejection.fixture"
import { createResponseDownloader } from "./response-download"
import { open, readdir, readFile, writeFile } from "node:fs/promises"

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
    expect(metrics).toEqual({ pulls: 1, closes: 0 })
    release.resolve()
    const error = await saving
    expect(error instanceof DOMException && error.name).toBe("AbortError")
    expect(metrics).toEqual({ pulls: 1, closes: 1 })
    expect(await readdir(fixture.root)).toEqual([])
  } finally { release.resolve(); downloader.dispose(); await fixture.close() }
})
