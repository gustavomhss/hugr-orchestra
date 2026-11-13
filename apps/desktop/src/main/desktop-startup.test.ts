import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, open, readdir, rm } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createStartupFence } from "./desktop-startup"

// Real OS handle ownership only; this does not substitute for Main's process-acquisition source review.
async function withFiles(body: (f: {
  open(): Promise<FileHandle>
  entries(): Promise<string[]>
  hold(): ReturnType<typeof Promise.withResolvers<void>>
  watch<A>(job: Promise<A>): Promise<A>
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "desktop-startup-"))
  const handles: FileHandle[] = [], jobs: Promise<unknown>[] = [], releases: (() => void)[] = []
  try {
    await body({
      async open() { const file = await open(join(root, `${randomUUID()}.data`), "wx+"); handles.push(file); return file },
      entries: () => readdir(root),
      hold() { const held = Promise.withResolvers<void>(); releases.push(() => held.resolve()); return held },
      watch(job) { jobs.push(job); void job.catch(() => undefined); return job },
    })
  } finally {
    releases.forEach((release) => release())
    await Promise.allSettled(jobs)
    await Promise.allSettled(handles.map((file) => file.close()))
    await rm(root, { recursive: true, force: true })
  }
}

async function bounded<A>(job: Promise<A>, label: string) {
  const expired = Promise.withResolvers<never>()
  const timer = setTimeout(() => expired.reject(new Error(label)), 1500)
  try { return await Promise.race([job, expired.promise]) }
  finally { clearTimeout(timer) }
}

function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leaves) : [error]
}

test("startup fence joins late acquired real handle closure without adopting it", () => withFiles(async (f) => {
  const fence = createStartupFence(), entered = f.hold(), allocated = f.hold(), closingFile = f.hold(), releaseFile = f.hold()
  const state = { adopts: 0, closed: false, file: undefined as FileHandle | undefined }
  const acquiring = f.watch(fence.acquire(async () => {
    entered.resolve(); await allocated.promise
    state.file = await f.open()
    return state.file
  }, () => { state.adopts++ }, async (file) => {
    closingFile.resolve(); await releaseFile.promise; await file.close()
  }))
  await bounded(entered.promise, "Acquisition was not entered")
  const closing = f.watch(fence.close().then(() => { state.closed = true }))
  expect(state.closed).toBe(false)
  allocated.resolve()
  await bounded(closingFile.promise, "Late resource cleanup was not entered")
  expect(state.adopts).toBe(0)
  expect(state.closed).toBe(false)
  if (!state.file) throw new Error("Expected actual allocated handle")
  expect((await state.file.stat()).isFile()).toBe(true)
  releaseFile.resolve()
  await bounded(closing, "Fence close did not join actual handle release")
  await Promise.allSettled([acquiring])
  expect(state.adopts).toBe(0)
  await expect(state.file.stat()).rejects.toMatchObject({ code: "EBADF" })
}))

test("startup fence rejects new acquisition after close without allocating a file", () => withFiles(async (f) => {
  const fence = createStartupFence()
  await fence.close()
  const state = { starts: 0, adopts: 0 }
  await expect(fence.acquire(async () => { state.starts++; return f.open() }, () => { state.adopts++ }, (file) => file.close())).rejects.toThrow()
  expect(state).toEqual({ starts: 0, adopts: 0 })
  expect(await f.entries()).toEqual([])
}))

test("normal synchronous adoption transfers actual handle lifetime to Main's owner", () => withFiles(async (f) => {
  const fence = createStartupFence()
  const state = { owner: undefined as FileHandle | undefined, releases: 0 }
  const file = await fence.acquire(() => f.open(), (resource) => { state.owner = resource }, async (resource) => { state.releases++; await resource.close() })
  expect(state.owner).toBe(file)
  expect((await file.stat()).isFile()).toBe(true)
  await fence.close()
  expect(state.releases).toBe(0)
  expect((await file.stat()).isFile()).toBe(true)
  await file.close()
  await expect(file.stat()).rejects.toMatchObject({ code: "EBADF" })
}))

test("a close reentered from start still joins the tracked acquisition and closes its real late handle", () => withFiles(async (f) => {
  const fence = createStartupFence(), entered = f.hold(), release = f.hold()
  const state = { closing: undefined as Promise<void> | undefined, closed: false, adopts: 0, file: undefined as FileHandle | undefined }
  const acquiring = f.watch(fence.acquire(async () => {
    state.closing = f.watch(fence.close().then(() => { state.closed = true }))
    entered.resolve(); await release.promise
    state.file = await f.open()
    return state.file
  }, () => { state.adopts++ }, (file) => file.close()))
  await bounded(entered.promise, "Reentrant start was not entered")
  expect(state.closed).toBe(false)
  release.resolve()
  if (!state.closing) throw new Error("Expected close reentered from actual acquisition")
  await bounded(state.closing, "Reentrant close lost its startup job")
  await Promise.allSettled([acquiring])
  expect(state.adopts).toBe(0)
  if (!state.file) throw new Error("Expected actual late handle")
  await expect(state.file.stat()).rejects.toMatchObject({ code: "EBADF" })
}))

test("adoption failure releases the real handle and retains original plus cleanup causes", () => withFiles(async (f) => {
  const fence = createStartupFence(), original = new Error("adopt sentinel"), cleanup = new Error("release sentinel")
  const file = await f.open()
  const acquiring = f.watch(fence.acquire(async () => file, () => { throw original }, async (resource) => { await resource.close(); throw cleanup }))
  const failure = await acquiring.then(() => { throw new Error("Expected failed adoption") }, (error: unknown) => error)
  expect(leaves(failure)).toContain(original)
  expect(leaves(failure)).toContain(cleanup)
  await expect(file.stat()).rejects.toMatchObject({ code: "EBADF" })
  const closed = await fence.close().then(() => undefined, (error: unknown) => error)
  expect(leaves(closed)).toContain(cleanup)
}))

test("close reports a release failure only after every other actual late handle cleanup joins", () => withFiles(async (f) => {
  const fence = createStartupFence(), enteredA = f.hold(), enteredB = f.hold(), allocate = f.hold(), failedRelease = f.hold(), heldRelease = f.hold(), finishRelease = f.hold()
  const failure = new Error("late release sentinel")
  const files: FileHandle[] = []
  const state = { closed: false, adopts: 0 }
  const first = f.watch(fence.acquire(async () => { enteredA.resolve(); await allocate.promise; const file = await f.open(); files.push(file); return file },
    () => { state.adopts++ }, async (file) => { await file.close(); failedRelease.resolve(); throw failure }))
  const second = f.watch(fence.acquire(async () => { enteredB.resolve(); await allocate.promise; const file = await f.open(); files.push(file); return file },
    () => { state.adopts++ }, async (file) => { heldRelease.resolve(); await finishRelease.promise; await file.close() }))
  await bounded(Promise.all([enteredA.promise, enteredB.promise]), "Acquisitions were not entered")
  const closing = f.watch(fence.close().then(() => { state.closed = true; return undefined }, (error: unknown) => { state.closed = true; return error }))
  allocate.resolve()
  await bounded(Promise.all([failedRelease.promise, heldRelease.promise]), "Late releases were not entered")
  expect(state.closed).toBe(false)
  finishRelease.resolve()
  expect(leaves(await bounded(closing, "Close did not join both releases"))).toContain(failure)
  await Promise.allSettled([first, second])
  expect(state.adopts).toBe(0)
  expect(files).toHaveLength(2)
  for (const file of files) await expect(file.stat()).rejects.toMatchObject({ code: "EBADF" })
}))
