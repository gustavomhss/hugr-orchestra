import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, open, readdir, readFile, rm } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runStartupCommand } from "./background-cli"
import { createStartupFence } from "./desktop-startup"

// Actual files and subprocesses; the fence is Main's boundary, not a full Electron bootstrap.
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

async function bounded<A>(job: Promise<A>, label: string, timeoutMs = 1500) {
  const expired = Promise.withResolvers<never>()
  const timer = setTimeout(() => expired.reject(new Error(label)), timeoutMs)
  try { return await Promise.race([job, expired.promise]) }
  finally { clearTimeout(timer) }
}

function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leaves) : [error]
}

function processGone(pid: number) {
  try { process.kill(pid, 0); return false }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true
    throw error
  }
}

async function withHeldStartupCommand(args: string[], ignoreTerm: boolean, body: (child: {
  start(signal?: AbortSignal, timeoutMs?: number): ReturnType<typeof runStartupCommand>
  ready: Promise<{ pid: number; args: string[] }>
  term(): Promise<string>
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "desktop-startup-command-"))
  const ready = Promise.withResolvers<{ pid: number; args: string[] }>()
  void ready.promise.catch(() => undefined)
  const cleanup = new AbortController()
  const state = { pid: undefined as number | undefined }
  const jobs: Promise<unknown>[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const pid = Number(url.searchParams.get("pid"))
    response.setHeader("Connection", "close")
    response.end()
    if (url.pathname !== "/ready" || !Number.isSafeInteger(pid) || pid <= 0) {
      ready.reject(new Error("Invalid startup subprocess handshake"))
      return
    }
    state.pid = pid
    ready.resolve({ pid, args: url.searchParams.getAll("arg") })
  })
  server.on("error", ready.reject)
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve() })
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Expected a local subprocess handshake address")
    const program = [
      `const { get } = require("node:http")`,
      `const { writeFileSync } = require("node:fs")`,
      ignoreTerm ? `process.on("SIGTERM", () => writeFileSync(${JSON.stringify(join(root, "term"))}, "SIGTERM"))` : "",
      `const ready = new URL(${JSON.stringify(`http://127.0.0.1:${address.port}/ready`)})`,
      `ready.searchParams.set("pid", String(process.pid))`,
      `for (const arg of process.argv.slice(-${args.length})) ready.searchParams.append("arg", arg)`,
      `setInterval(() => {}, 1000)`,
      `get(ready, { headers: { Connection: "close" } }, response => response.resume()).on("error", error => { console.error(error); process.exit(2) })`,
    ].join("\n")
    await body({
      start(signal, timeoutMs = 30_000) {
        if (jobs.length) throw new Error("The startup subprocess fixture owns one command")
        // The cleanup signal also makes the pre-fix RED release its real child after the assertion fails.
        const job = runStartupCommand(process.execPath, ["-e", program, "--", ...args], {
          signal: AbortSignal.any([cleanup.signal, ...(signal ? [signal] : [])]),
          timeoutMs,
          killGraceMs: ignoreTerm ? 1000 : 100,
          killWaitMs: 3000,
        })
        jobs.push(job)
        void job.catch(() => undefined)
        return job
      },
      ready: ready.promise,
      term: () => readFile(join(root, "term"), "utf8"),
    })
  } finally {
    cleanup.abort()
    try {
      if (state.pid !== undefined && !processGone(state.pid)) {
        try { process.kill(state.pid, "SIGKILL") }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error }
      }
      await bounded(Promise.allSettled(jobs), "Startup subprocess fixture did not join its command", 5000)
    } finally {
      server.closeAllConnections()
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      await rm(root, { recursive: true, force: true })
    }
  }
}

async function expectStartupCancellation(args: string[], ignoreTerm = false) {
  await withHeldStartupCommand(args, ignoreTerm, async (child) => {
    const fence = createStartupFence()
    const state = { adopts: 0, releases: 0, signal: undefined as AbortSignal | undefined }
    const acquiring = fence.acquire((signal) => {
      state.signal = signal
      return child.start(signal)
    }, () => { state.adopts++ }, async () => { state.releases++ })
    const outcome = acquiring.then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }))
    const started = await bounded(child.ready, "Startup subprocess did not reach its handshake", 5000)
    expect(started.args).toEqual(args)
    expect(processGone(started.pid)).toBe(false)
    const closing = fence.close()
    expect(fence.close()).toBe(closing)
    await bounded(closing, "Quit did not cancel and join its startup subprocess", 5000)
    const result = await outcome
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("Cancelled startup command unexpectedly succeeded")
    expect(state.signal?.aborted).toBe(true)
    expect(result.error).toBe(state.signal?.reason)
    expect(state.adopts).toBe(0)
    expect(state.releases).toBe(0)
    expect(processGone(started.pid)).toBe(true)
    if (ignoreTerm) expect(await child.term()).toBe("SIGTERM")
  })
}

test("Quit cancels and reaps a pending owned --version subprocess before adopting", () => expectStartupCancellation(["--version"]), 15_000)

test("Quit cancels and reaps a pending shared service status subprocess before adopting", () => expectStartupCancellation(["service", "status"]), 15_000)

test.skipIf(process.platform === "win32")("Quit escalates a startup subprocess that ignores SIGTERM and joins SIGKILL", () => expectStartupCancellation(["--version"], true), 15_000)

test("startup command preserves stdout, stderr and its explicit environment", async () => {
  const output = await bounded(runStartupCommand(process.execPath, ["-e", `process.stdout.write(process.env.ORCHESTRA_STARTUP_TEST_VALUE); process.stderr.write("startup stderr")`], {
    env: { ...process.env, ORCHESTRA_STARTUP_TEST_VALUE: "startup stdout" },
    timeoutMs: 5000,
  }), "Successful startup command did not finish", 10_000)
  expect(output).toEqual({ stdout: "startup stdout", stderr: "startup stderr" })
}, 15_000)

test("startup command reports spawn failure without waiting for its execution deadline", async () => {
  const error = await bounded(runStartupCommand(join(tmpdir(), `missing-startup-command-${randomUUID()}`), [], {
    timeoutMs: 30_000,
  }).then(() => undefined, (failure: unknown) => failure), "Missing startup executable did not fail promptly", 5000)
  expect(error).toMatchObject({ code: "ENOENT" })
}, 10_000)

test("startup command deadline reaps a real pending subprocess without a Quit request", () => withHeldStartupCommand(["--version"], false, async (child) => {
  const outcome = child.start(undefined, 5000).then(() => undefined, (error: unknown) => error)
  const started = await bounded(child.ready, "Deadline subprocess did not reach its handshake", 5000)
  const error = await bounded(outcome, "Startup command deadline did not join its subprocess", 10_000)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toBe("startup-process-timeout")
  expect(processGone(started.pid)).toBe(true)
}), 20_000)

test("close aborts every pending acquisition before joining and remains reentrant from abort", () => withFiles(async (f) => {
  const fence = createStartupFence(), enteredA = f.hold(), enteredB = f.hold(), finish = f.hold()
  const state = { aborts: 0, adopts: 0, closed: false, reentered: undefined as Promise<void> | undefined }
  const start = async (signal: AbortSignal | undefined, entered: ReturnType<typeof f.hold>) => {
    signal?.addEventListener("abort", () => { state.aborts++; state.reentered = fence.close() }, { once: true })
    entered.resolve()
    await finish.promise
    if (signal?.aborted) throw signal.reason
    return f.open()
  }
  const first = f.watch(fence.acquire((signal) => start(signal, enteredA), () => { state.adopts++ }, (file) => file.close()))
  const second = f.watch(fence.acquire((signal) => start(signal, enteredB), () => { state.adopts++ }, (file) => file.close()))
  await bounded(Promise.all([enteredA.promise, enteredB.promise]), "Pending acquisitions did not start")
  const closing = fence.close()
  f.watch(closing.then(() => { state.closed = true }))
  expect(state.aborts).toBe(2)
  expect(state.reentered).toBe(closing)
  expect(state.closed).toBe(false)
  finish.resolve()
  await bounded(closing, "Close did not join cancelled acquisition cleanup")
  expect((await Promise.allSettled([first, second])).map((result) => result.status)).toEqual(["rejected", "rejected"])
  expect(state.adopts).toBe(0)
  expect(await f.entries()).toEqual([])
}))

test("close reports an acquisition cleanup failure instead of treating abort as confirmed termination", () => withFiles(async (f) => {
  const fence = createStartupFence(), entered = f.hold(), finish = f.hold()
  const failure = new Error("startup termination unknown sentinel")
  const acquiring = f.watch(fence.acquire(async (signal) => {
    signal?.addEventListener("abort", () => finish.resolve(), { once: true })
    entered.resolve()
    await finish.promise
    throw failure
  }, () => { throw new Error("Failed acquisition cannot be adopted") }, async () => {}))
  await bounded(entered.promise, "Failing acquisition did not start")
  const closed = await bounded(fence.close().then(() => undefined, (error: unknown) => error), "Close did not report acquisition failure")
  expect(leaves(closed)).toContain(failure)
  await expect(acquiring).rejects.toBe(failure)
}))

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
