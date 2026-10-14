import { expect, test } from "bun:test"
import { open, readdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { RESPONSE_DOWNLOAD_CHUNK_BYTES } from "../preload/response-download"
import { responseDownloadFixture } from "./response-download.fixture"

test("commits exact ordered raw bytes after partial writes; handles clear once", async () => {
  const fixture = await responseDownloadFixture()
  try {
    await writeFile(fixture.destination, "prior file")
    const handle = await fixture.handle()
    expect(handle).not.toContain(fixture.root)
    expect(await fixture.api.ready(handle)).toEqual({ status: "ok" })
    const bytes = Uint8Array.from({ length: 8211 }, (_, index) => index)
    expect(await fixture.api.write(handle, 0, bytes.buffer)).toEqual({ status: "ok" })
    expect(await fixture.api.write(handle, 1, new Uint8Array([255, 0]).buffer)).toEqual({ status: "ok" })
    expect(await readFile(fixture.destination, "utf8")).toBe("prior file")
    expect(await fixture.api.finish(handle, 2)).toEqual({ status: "ok" })
    expect(await readFile(fixture.destination)).toEqual(Buffer.from([...bytes, 255, 0]))
    expect(fixture.metrics.writes).toBeGreaterThan(2)
    expect(await fixture.api.finish(handle, 2)).toEqual({ status: "error", code: "permission_denied" })
    await fixture.api.cancel(handle)
    expect(fixture.metrics.closes).toBe(1)
    expect(await readdir(fixture.root)).toEqual(["download.bin"])
    expect(fixture.sender.listenerCount("did-start-navigation")).toBe(0)
  } finally { await fixture.close() }
})

test("foreign contents/frame cannot write, finish or cancel an originating capability", async () => {
  const fixture = await responseDownloadFixture()
  try {
    const handle = await fixture.handle()
    expect(await fixture.api.ready(handle)).toEqual({ status: "ok" })
    for (const source of [{ sender: fixture.sender, senderFrame: {} }, { sender: {}, senderFrame: fixture.event.senderFrame }]) {
      expect(await fixture.invoke("response-download-start", source, "foreign")).toEqual({ status: "error", code: "permission_denied" })
      expect(await fixture.invoke("response-download-ready", source, handle)).toEqual({ status: "error", code: "permission_denied" })
      expect(await fixture.invoke("response-download-write", source, handle, 0, new ArrayBuffer(1))).toEqual({ status: "error", code: "permission_denied" })
      expect(await fixture.invoke("response-download-finish", source, handle, 0)).toEqual({ status: "error", code: "permission_denied" })
      expect(await fixture.invoke("response-download-cancel", source, handle)).toEqual({ status: "error", code: "permission_denied" })
    }
    expect(await fixture.api.write(handle, 0, new Uint8Array([42]).buffer)).toEqual({ status: "ok" })
    expect(await fixture.api.finish(handle, 1)).toEqual({ status: "ok" })
    expect(await readFile(fixture.destination)).toEqual(Buffer.from([42]))
  } finally { await fixture.close() }
})

test("oversize, replay, gaps and malformed chunks fail closed without changing destination", async () => {
  const fixture = await responseDownloadFixture()
  try {
    await writeFile(fixture.destination, "prior file")
    for (const [sequence, chunk] of [[1, new ArrayBuffer(1)], [0, new ArrayBuffer(RESPONSE_DOWNLOAD_CHUNK_BYTES + 1)],
      [0, new ArrayBuffer(0)], [0, new Uint8Array(1)], [0.5, new ArrayBuffer(1)]]) {
      const handle = await fixture.handle()
      expect(await fixture.api.ready(handle)).toEqual({ status: "ok" })
      expect(await fixture.invoke("response-download-write", fixture.event, handle, sequence, chunk)).toEqual({ status: "error", code: "transfer_failed" })
      expect(await readFile(fixture.destination, "utf8")).toBe("prior file")
      expect(await readdir(fixture.root)).toEqual(["download.bin"])
    }
    const handle = await fixture.handle()
    await fixture.api.ready(handle)
    await fixture.api.write(handle, 0, new ArrayBuffer(1))
    expect(await fixture.api.write(handle, 0, new ArrayBuffer(1))).toEqual({ status: "error", code: "transfer_failed" })
    expect(await readFile(fixture.destination, "utf8")).toBe("prior file")
  } finally { await fixture.close() }
})

test("cancel during chooser prevents late open; denied chooser remains distinct", async () => {
  const chosen = Promise.withResolvers<{ canceled: boolean; filePath: string }>()
  const fixture = await responseDownloadFixture({ choose: () => chosen.promise })
  try {
    const handle = await fixture.handle()
    const waiting = fixture.api.ready(handle)
    expect((await fixture.api.start("second")).status).toBe("error")
    expect(await fixture.api.cancel(handle)).toEqual({ status: "cancelled" })
    expect((await fixture.api.start("still choosing")).status).toBe("error")
    chosen.resolve({ canceled: false, filePath: fixture.destination })
    expect(await waiting).toEqual({ status: "cancelled" })
    expect(await readdir(fixture.root)).toEqual([])
    expect(fixture.metrics.closes).toBe(0)
    expect((await fixture.api.start("dismissed")).status).toBe("ok")
  } finally { await fixture.close() }
  const denied = await responseDownloadFixture({ choose: async () => { throw Object.assign(new Error("denied"), { code: "EACCES" }) } })
  try {
    expect(await denied.api.ready(await denied.handle())).toEqual({ status: "error", code: "permission_denied" })
    expect(await readdir(denied.root)).toEqual([])
  } finally { await denied.close() }
})

test("exclusive-open collision never deletes an unowned file; empty response still commits", async () => {
  const fixture = await responseDownloadFixture()
  try {
    const handle = await fixture.handle()
    const collision = join(fixture.root, `.orchestra-download-${handle}.tmp`)
    await writeFile(collision, "not owned")
    expect(await fixture.api.ready(handle)).toEqual({ status: "error", code: "transfer_failed" })
    expect(await readFile(collision, "utf8")).toBe("not owned")
    const empty = await fixture.handle()
    expect(await fixture.api.ready(empty)).toEqual({ status: "ok" })
    expect(await fixture.api.finish(empty, 0)).toEqual({ status: "ok" })
    expect((await readFile(fixture.destination)).byteLength).toBe(0)
  } finally { await fixture.close() }
})

test("overlap is rejected rather than queued; cancel waits for in-flight disk write", async () => {
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const metrics = { writes: 0, closes: 0 }
  const fixture = await responseDownloadFixture({ open: async (path) => {
    const file = await open(path, "wx", 0o600)
    return {
      async write(bytes, offset, length) { metrics.writes++; started.resolve(); await release.promise; return file.write(bytes, offset, length) },
      close() { metrics.closes++; return file.close() },
    }
  } })
  try {
    const handle = await fixture.handle()
    await fixture.api.ready(handle)
    const writing = fixture.api.write(handle, 0, new ArrayBuffer(10))
    await started.promise
    const overlap = fixture.api.write(handle, 1, new ArrayBuffer(10))
    const cancelling = fixture.api.cancel(handle)
    expect(metrics).toEqual({ writes: 1, closes: 0 })
    expect(await cancelling).toEqual({ status: "error", code: "transfer_failed" })
    release.resolve()
    expect(await writing).toEqual({ status: "cancelled" })
    expect(await overlap).toEqual({ status: "error", code: "transfer_failed" })
    expect(metrics).toEqual({ writes: 1, closes: 1 })
    expect(await readdir(fixture.root)).toEqual([])
  } finally { release.resolve(); await fixture.close() }
})

test("renderer death, window close and document navigation clean temporary file and listeners", async () => {
  for (const death of ["render-process-gone", "destroyed", "closed", "did-start-navigation"]) {
    const fixture = await responseDownloadFixture()
    try {
      const handle = await fixture.handle()
      await fixture.api.ready(handle)
      expect(await readdir(fixture.root)).toHaveLength(1)
      expect(fixture.sender.listenerCount("did-start-navigation")).toBe(1)
      expect(fixture.metrics.closes).toBe(0)
      if (death === "did-start-navigation") {
        fixture.sender.emit(death, { isMainFrame: true, isSameDocument: true })
        expect(await fixture.api.write(handle, 0, new ArrayBuffer(1))).toEqual({ status: "ok" })
        fixture.sender.emit(death, { isMainFrame: true, isSameDocument: false })
      } else (death === "closed" ? fixture.win : fixture.sender).emit(death)
      // Observe event-owned cleanup before making any further IPC request.
      const deadline = Date.now() + 3000
      while (fixture.sender.listenerCount("did-start-navigation") && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 5))
      expect(fixture.metrics.closes).toBe(1)
      expect(await readdir(fixture.root)).toEqual([])
      expect(fixture.sender.listenerCount("did-start-navigation")).toBe(0)
      expect(fixture.win.listenerCount("closed")).toBe(0)
      expect(await fixture.api.cancel(handle)).toEqual({ status: "error", code: "permission_denied" })
    } finally { await fixture.close() }
  }
})

test("late cancel observes submitted rename result and successful commit relinquishes temporary pathname", async () => {
  for (const outcome of ["ok", "denied"] as const) {
    const submitted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const fixture = await responseDownloadFixture({ rename: async (source, destination) => {
      submitted.resolve()
      await release.promise
      if (outcome === "denied") throw Object.assign(new Error("rename denied"), { code: "EACCES" })
      await rename(source, destination)
      // Another owner reuses the vacated name before the syscall acknowledgement reaches the sink.
      await writeFile(source, "new owner", { flag: "wx" })
    } })
    try {
      await writeFile(fixture.destination, "prior file")
      const handle = await fixture.handle()
      await fixture.api.ready(handle)
      await fixture.api.write(handle, 0, new Uint8Array([0, 255]).buffer)
      const finishing = fixture.api.finish(handle, 1)
      await submitted.promise
      const cancelling = fixture.api.cancel(handle)
      expect(await fixture.api.cancel(handle)).toEqual({ status: "error", code: "transfer_failed" })
      expect(await fixture.api.finish(handle, 1)).toEqual({ status: "error", code: "transfer_failed" })
      expect(await readFile(fixture.destination, "utf8")).toBe("prior file")
      release.resolve()
      const result = outcome === "ok" ? { status: "ok" } : { status: "error", code: "permission_denied" }
      expect(await finishing).toEqual(result)
      expect(await cancelling).toEqual(result)
      expect(fixture.metrics.closes).toBe(1)
      if (outcome === "ok") {
        expect(await readFile(fixture.destination)).toEqual(Buffer.from([0, 255]))
        expect(await readFile(join(fixture.root, `.orchestra-download-${handle}.tmp`), "utf8")).toBe("new owner")
      }
      if (outcome === "denied") {
        expect(await readFile(fixture.destination, "utf8")).toBe("prior file")
        expect(await readdir(fixture.root)).toEqual(["download.bin"])
      }
    } finally { release.resolve(); await fixture.close() }
  }
})

test("first cancel before rename submission prevents commit while duplicate cancel rejects immediately", async () => {
  const closing = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const metrics = { renames: 0 }
  const fixture = await responseDownloadFixture({
    open: async (path) => {
      const file = await open(path, "wx", 0o600)
      return { write: (bytes, offset, length) => file.write(bytes, offset, length), async close() {
        await file.close()
        closing.resolve()
        await release.promise
      } }
    },
    rename: async (source, destination) => { metrics.renames++; await rename(source, destination) },
  })
  try {
    await writeFile(fixture.destination, "prior file")
    const handle = await fixture.handle()
    await fixture.api.ready(handle)
    const finishing = fixture.api.finish(handle, 0)
    await closing.promise
    const cancelling = fixture.api.cancel(handle)
    expect(await fixture.api.cancel(handle)).toEqual({ status: "error", code: "transfer_failed" })
    release.resolve()
    expect(await finishing).toEqual({ status: "cancelled" })
    expect(await cancelling).toEqual({ status: "cancelled" })
    expect(metrics.renames).toBe(0)
    expect(await readFile(fixture.destination, "utf8")).toBe("prior file")
    expect(await readdir(fixture.root)).toEqual(["download.bin"])
  } finally { release.resolve(); await fixture.close() }
})

test("duplicate ready flood settles while original chooser stays stalled", async () => {
  const entered = Promise.withResolvers<void>()
  const choice = Promise.withResolvers<{ canceled: boolean }>()
  const deadline = Promise.withResolvers<never>()
  const metrics = { choosers: 0 }
  const fixture = await responseDownloadFixture({ choose: () => { metrics.choosers++; entered.resolve(); return choice.promise } })
  const handle = await fixture.handle()
  const waiting = fixture.api.ready(handle)
  try {
    await entered.promise
    const timer = setTimeout(() => deadline.reject(new Error("Duplicate ready calls retained stalled chooser")), 3000)
    const replies = await Promise.race([Promise.all(Array.from({ length: 128 }, () => fixture.api.ready(handle))), deadline.promise])
      .finally(() => clearTimeout(timer))
    expect(replies).toHaveLength(128)
    expect(replies.every((reply) => reply.status === "error" && reply.code === "transfer_failed")).toBe(true)
    expect(metrics.choosers).toBe(1)
    choice.resolve({ canceled: true })
    expect(await waiting).toEqual({ status: "cancelled" })
    expect(await readdir(fixture.root)).toEqual([])
  } finally { choice.resolve({ canceled: true }); await waiting; await fixture.close() }
}, 10000)

test("ended operation and cancel floods settle while first cancellation waits for stalled disk write", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const deadline = Promise.withResolvers<never>()
  const metrics = { closes: 0 }
  const fixture = await responseDownloadFixture({ open: async (path) => {
    const file = await open(path, "wx", 0o600)
    return { async write(bytes, offset, length) { entered.resolve(); await release.promise; return file.write(bytes, offset, length) },
      close() { metrics.closes++; return file.close() } }
  } })
  try {
    const handle = await fixture.handle()
    await fixture.api.ready(handle)
    const writing = fixture.api.write(handle, 0, new ArrayBuffer(1))
    await entered.promise
    const cancelling = fixture.api.cancel(handle)
    const timer = setTimeout(() => deadline.reject(new Error("Ended calls retained stalled cleanup")), 3000)
    const replies = await Promise.race([Promise.all(Array.from({ length: 32 }, () => [
      fixture.api.ready(handle), fixture.api.write(handle, 1, new ArrayBuffer(1)),
      fixture.api.finish(handle, 1), fixture.api.cancel(handle),
    ]).flat()), deadline.promise]).finally(() => clearTimeout(timer))
    expect(replies).toHaveLength(128)
    expect(replies.every((reply) => reply.status === "error" && reply.code === "transfer_failed")).toBe(true)
    expect(metrics.closes).toBe(0)
    release.resolve()
    expect(await writing).toEqual({ status: "cancelled" })
    expect(await cancelling).toEqual({ status: "cancelled" })
    expect(metrics.closes).toBe(1)
    expect(await readdir(fixture.root)).toEqual([])
  } finally { release.resolve(); await fixture.close() }
}, 10000)
