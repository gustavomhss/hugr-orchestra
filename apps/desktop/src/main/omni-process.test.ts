import { afterEach, expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { getEventListeners } from "node:events"
import { promisify } from "node:util"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { gone, reap, sweep, tree } from "@orchestra/core/test/fixture/process-tree"
import { Omni } from "@orchestra/core/omni"
import { DesktopOmni } from "./omni-process"
import { until } from "./omni-process.fixture"

// The desktop's omni adapters against real processes. They need the omni addon and supervisor, so they run with
// ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER on (test:ci --env); the preload's positive control then also requires them to
// have spawned through omni. Trees are identified by a nonce in argv (process-tree.ts), never by a bare pid.
const on = DesktopOmni.enabled()
const legacy = promisify(execFile)
const nonces: string[] = []

afterEach(async () => {
  await Promise.all(nonces.splice(0).map((nonce) => reap(nonce).catch(() => undefined)))
})

function nonceTree(depth = 2) {
  const created = tree(depth)
  nonces.push(created.nonce)
  return created
}

/** Polls the process table until nothing carries the nonce; bounds a death, never a latency. */
async function swept(nonce: string) {
  const deadline = Date.now() + 20_000
  for (;;) {
    const left = await sweep(nonce)
    if (left.length === 0 || Date.now() > deadline) return left
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

function settle<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: Record<string, unknown>) => ({ value: undefined, error }),
  )
}

const node = (script: string, ...args: string[]) => [process.execPath, ["-e", script, ...args]] as const

test.skipIf(!on)(
  "execFile resolves and rejects like child_process.execFile",
  async () => {
    expectSpawn(import.meta.path)
    const cases = [
      node("process.stdout.write('out'); process.stderr.write('err')"),
      node("process.stderr.write('No such container: x\\n'); process.exit(1)"),
      [`missing-${randomUUID()}`, []] as const,
    ]
    for (const [file, args] of cases) {
      const [omni, before] = await Promise.all([
        settle(DesktopOmni.execFile(file, [...args])),
        settle(legacy(file, [...args])),
      ])
      expect(omni.value).toEqual(before.value)
      expect(omni.error?.code).toEqual(before.error?.code)
      expect(omni.error?.stderr).toEqual(before.error?.stderr)
    }
  },
  30_000,
)

test.skipIf(!on)(
  "execFile's timeout stops the whole tree",
  async () => {
    const created = nonceTree()
    const started = Date.now()
    const result = await settle(
      DesktopOmni.execFile(created.command, created.args, { timeout: 2000, killSignal: "SIGKILL" }),
    )
    expect(result.error?.killed).toBe(true)
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(await gone(created.nonce)).toBe(0)
    expect(await swept(created.nonce)).toEqual([])
  },
  30_000,
)

test.skipIf(!on)(
  "spawn pipes stdin, stdout and stderr as bytes and reports exit then close",
  async () => {
    const [file, args] = node(
      "process.stdin.on('data', (d) => process.stdout.write(d)); process.stdin.on('end', () => { process.stderr.write('done'); process.exit(4) })",
    )
    const child = DesktopOmni.spawn(file, [...args])
    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk))
    const events: string[] = []
    child.once("exit", () => events.push("exit"))
    const closed = new Promise<number | null>((resolve) => child.once("close", (code) => resolve(code)))
    const bytes = Buffer.from([0, 1, 2, 0xff, 0xfe, ...Buffer.from("é ✓")])
    child.stdin.end(bytes)
    expect(await closed).toBe(4)
    events.push("close")
    expect(events).toEqual(["exit", "close"])
    expect(Buffer.concat(chunks)).toEqual(bytes)
    expect(Buffer.concat(errors).toString()).toBe("done")
  },
  30_000,
)

test.skipIf(!on)(
  "spawn's kill stops the whole tree, and a missing program errors with ENOENT",
  async () => {
    const created = nonceTree()
    const child = DesktopOmni.spawn(created.command, created.args, { stdin: "closed" })
    await new Promise<void>((resolve) =>
      child.stdout.on("data", (chunk: Buffer) => chunk.toString().includes(created.ready) && resolve()),
    )
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()))
    expect(child.kill()).toBe(true)
    await closed
    expect(await gone(created.nonce)).toBe(0)
    expect(await swept(created.nonce)).toEqual([])

    const missing = DesktopOmni.spawn(`missing-${randomUUID()}`, [])
    const error = await new Promise<Error & { code?: string }>((resolve) => missing.once("error", resolve))
    expect(error.code).toBe("ENOENT")
  },
  30_000,
)

test.skipIf(!on)(
  "close is bounded when a grandchild keeps the pipes after the root exits, and it is stopped",
  async () => {
    const nonce = `omni-desktop-${randomUUID()}`
    nonces.push(nonce)
    const grandchild = JSON.stringify(["-e", "setInterval(() => {}, 1 << 30)", nonce])
    const [file, args] = node(
      `require("node:child_process").spawn(process.execPath, ${grandchild}, { stdio: "inherit" }); setTimeout(() => process.exit(0), 500)`,
      nonce,
    )
    const child = DesktopOmni.spawn(file, [...args], { stdin: "closed" })
    child.stdout.resume()
    const started = Date.now()
    const code = await new Promise<number | null>((resolve) => child.once("close", (value) => resolve(value)))
    expect(code).toBe(0)
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(await swept(nonce)).toEqual([])
  },
  30_000,
)

test.skipIf(!on)(
  "an aborted spawn fails with AbortError and leaves no tree",
  async () => {
    const created = nonceTree()
    const controller = new AbortController()
    const child = DesktopOmni.spawn(created.command, created.args, { stdin: "closed", signal: controller.signal })
    await new Promise<void>((resolve) =>
      child.stdout.on("data", (chunk: Buffer) => chunk.toString().includes(created.ready) && resolve()),
    )
    const failed = new Promise<Error>((resolve) => child.once("error", resolve))
    controller.abort()
    expect((await failed).name).toBe("AbortError")
    expect(await gone(created.nonce)).toBe(0)
  },
  30_000,
)

test.skipIf(!on)(
  "terminal: queued output, resize, exit code and kill of the whole tree",
  async () => {
    const [file, args] = node("process.stdout.write('cols=' + process.stdout.columns + '\\n'); process.exit(3)")
    const short = await DesktopOmni.terminal(file, [...args], { name: "xterm-256color", cols: 120, rows: 40 })
    const exit = await new Promise<number>((resolve) => short.onExit((event) => resolve(event.exitCode)))
    // Data written before any listener attached is replayed to the first one (D-L7).
    const replayed: string[] = []
    short.onData((data) => replayed.push(data))
    expect(replayed.join("")).toContain("cols=120")
    expect(exit).toBe(3)

    const created = nonceTree()
    const terminal = await DesktopOmni.terminal(created.command, created.args, { name: "xterm", cols: 80, rows: 24 })
    const output: string[] = []
    await new Promise<void>((resolve) =>
      terminal.onData((data) => {
        output.push(data)
        if (output.join("").includes(created.ready)) resolve()
      }),
    )
    terminal.resize(100_000, 0)
    const ended = new Promise<number>((resolve) => terminal.onExit((event) => resolve(event.exitCode)))
    terminal.kill()
    await ended
    expect(await gone(created.nonce)).toBe(0)
    expect(await swept(created.nonce)).toEqual([])
  },
  30_000,
)



test.skipIf(!on)("a real spawn failure emits error then one close, removes abort ownership, and invents no exit", async () => {
  expectSpawn(import.meta.path)
  // A failed native start has no child to count; this successful control proves the same adapter used omni.
  await DesktopOmni.execFile(process.execPath, ["-e", "process.exit(0)"])
  const controller = new AbortController()
  const events: string[] = []
  const failures: Error[] = []
  const child = DesktopOmni.spawn(`missing-${randomUUID()}`, [], { signal: controller.signal })
  child.stdout.resume()
  child.stderr.resume()
  child.stdin.end()
  child.on("error", (error: Error) => { failures.push(error); events.push("error") })
  child.on("exit", () => events.push("exit"))
  child.on("close", () => events.push("close"))
  await until(() => events.includes("close"))
  expect(failures).toHaveLength(1)
  expect(failures[0]).toMatchObject({ code: "ENOENT" })
  expect(events).toEqual(["error", "close"])
  expect(child.stdout.readableEnded).toBe(true)
  expect(child.stderr.readableEnded).toBe(true)
  expect(child.stdin.writableFinished || child.stdin.destroyed).toBe(true)
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
  controller.abort()
  await Bun.sleep(50)
  expect(events).toEqual(["error", "close"])
}, 30_000)

test.skipIf(!on)("abort racing with a real failed start still settles error and close once", async () => {
  expectSpawn(import.meta.path)
  await DesktopOmni.execFile(process.execPath, ["-e", "process.exit(0)"])
  const controller = new AbortController()
  const events: string[] = []
  const child = DesktopOmni.spawn(`missing-${randomUUID()}`, [], { signal: controller.signal })
  child.stdout.resume()
  child.stderr.resume()
  child.on("error", () => { events.push("error"); controller.abort() })
  child.on("exit", () => events.push("exit"))
  child.on("close", () => events.push("close"))
  await until(() => events.includes("close"))
  await Bun.sleep(50)
  expect(events).toEqual(["error", "close"])
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
}, 30_000)


type Binding = Awaited<ReturnType<typeof Omni.load>>
type NativeChild = ReturnType<Binding["spawn"]>
type NativeExit = Awaited<ReturnType<NativeChild["wait"]>>
type NativeChunk = NativeChild["output"] extends AsyncIterable<infer T> ? T : never

// The fault seam changes one operation on a real native child; stop still reaches that child's real reaper.
function instrument(overrides: (child: NativeChild) => Partial<Pick<NativeChild, "wait" | "stop" | "output" | "write">>) {
  const state = { stops: 0, child: undefined as NativeChild | undefined }
  const load: typeof Omni.load = async () => {
    const binding = await Omni.load()
    const spawn = ((file: string, args?: readonly string[], options?: Parameters<Binding["spawn"]>[2]) => {
      const child = binding.spawn(file, args, options)
      state.child = child
      const fault = overrides(child)
      const forwarded = {
        pid: child.pid,
        output: fault.output ?? child.output,
        droppedBytes: child.droppedBytes,
        lines: () => child.lines(),
        write: fault.write ?? ((data: string | Uint8Array) => child.write(data)),
        wait: fault.wait ?? (() => child.wait()),
        stop: (options?: Parameters<NativeChild["stop"]>[0]) => {
          state.stops += 1
          return fault.stop ? fault.stop(options) : child.stop(options)
        },
        processes: () => child.processes(),
        [Symbol.asyncDispose]: () => child[Symbol.asyncDispose](),
      }
      return "closeStdin" in child
        ? { ...forwarded, closeStdin: () => child.closeStdin() }
        : { ...forwarded, resize: (cols: number, rows: number) => child.resize(cols, rows) }
    }) as Binding["spawn"]
    return { ...binding, spawn }
  }
  return { state, load }
}

function controlledOutput(next: () => Promise<IteratorResult<NativeChunk>>, finish?: () => Promise<IteratorResult<NativeChunk>>) {
  return { [Symbol.asyncIterator]: () => ({ next, return: finish ?? (async () => ({ done: true as const, value: undefined })) }) }
}

test.skipIf(!on)("supervisor wait rejection after tree readiness closes pipes and releases stdin", async () => {
  expectSpawn(import.meta.path)
  const created = nonceTree(0)
  const wait = Promise.withResolvers<NativeExit>()
  const neverWrite = Promise.withResolvers<void>()
  const injected = instrument(() => ({ wait: () => wait.promise, write: () => neverWrite.promise }))
  const controller = new AbortController()
  const child = DesktopOmni.spawn(created.command, created.args, { load: injected.load, signal: controller.signal })
  const events: string[] = []
  child.on("error", () => events.push("error"))
  child.on("exit", () => events.push("exit"))
  child.on("close", (code, signal) => events.push(`close:${code}:${signal}`))
  const ready: string[] = []
  child.stdout.on("data", (chunk: Buffer) => ready.push(chunk.toString()))
  child.stderr.resume()
  const written = Promise.withResolvers<void>()
  child.stdin.on("error", () => {})
  child.stdin.write("pending", () => written.resolve())
  const finished = Promise.withResolvers<void>()
  child.stdin.end(() => finished.resolve())
  await until(() => ready.join("").includes(created.ready))
  wait.reject(new Error("supervisor-lost"))
  try {
    await until(() => events.some((event) => event.startsWith("close:")))
    await Promise.race([Promise.all([written.promise, finished.promise]), Bun.sleep(1000).then(() => { throw new Error("stdin callback retained") })])
    expect(events).toEqual(["error", "close:null:null"])
    expect(child.stdout.readableEnded || child.stdout.destroyed).toBe(true)
    expect(child.stderr.readableEnded || child.stderr.destroyed).toBe(true)
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
    expect(injected.state.stops).toBeGreaterThan(0)
    expect(await swept(created.nonce)).toEqual([])
  } finally {
    await injected.state.child?.stop()
  }
}, 30_000)

test.skipIf(!on)("pump rejection after tree readiness is observed before wait and reaps the child", async () => {
  expectSpawn(import.meta.path)
  const created = nonceTree(0)
  const output = Promise.withResolvers<IteratorResult<NativeChunk>>()
  const injected = instrument((child) => ({ output: {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of child.output) {
        yield chunk
        if (Buffer.from(chunk.data).toString().includes(created.ready)) await output.promise
      }
    },
  } }))
  const child = DesktopOmni.spawn(created.command, created.args, { load: injected.load })
  const events: string[] = []
  child.on("error", () => events.push("error"))
  child.on("exit", () => events.push("exit"))
  child.on("close", (code) => events.push(`close:${code}`))
  const ready: string[] = []
  child.stdout.on("data", (chunk: Buffer) => ready.push(chunk.toString()))
  child.stderr.resume()
  await until(() => ready.join("").includes(created.ready))
  output.reject(new Error("pump-lost"))
  try {
    await until(() => events.some((event) => event.startsWith("close:")))
    expect(events).toEqual(["error", "close:null"])
    expect(injected.state.stops).toBeGreaterThan(0)
    expect(await swept(created.nonce)).toEqual([])
  } finally {
    await injected.state.child?.stop()
  }
}, 30_000)

test.each(["pump", "stop"]).skipIf(!on)("%s failure after OS exit preserves the one real exit status", async (failure) => {
  expectSpawn(import.meta.path)
  const output = Promise.withResolvers<IteratorResult<NativeChunk>>()
  const injected = instrument((child) => ({
    output: controlledOutput(() => output.promise),
    ...(failure === "stop" ? { stop: async () => { await child.stop(); throw new Error("reaper-unavailable") } } : {}),
  }))
  const child = DesktopOmni.spawn(process.execPath, ["-e", "process.exit(7)"], { load: injected.load })
  const events: string[] = []
  child.on("error", () => events.push("error"))
  child.on("exit", (code) => events.push(`exit:${code}`))
  child.on("close", (code) => events.push(`close:${code}`))
  child.stdout.resume()
  child.stderr.resume()
  await until(() => events.includes("exit:7"))
  if (failure === "pump") output.reject(new Error("late-pump-failure"))
  if (failure === "stop") output.resolve({ done: true, value: undefined })
  await until(() => events.includes("close:7"))
  expect(events).toEqual(["exit:7", "error", "close:7"])
  expect(injected.state.stops).toBeGreaterThan(0)
}, 30_000)

test.skipIf(!on)("failed wait bounds a stalled iterator return and reaper without claiming successful cleanup", async () => {
  expectSpawn(import.meta.path)
  const created = nonceTree(0)
  const wait = Promise.withResolvers<NativeExit>()
  const ready: string[] = []
  const injected = instrument((child) => ({
    wait: () => wait.promise,
    output: {
      [Symbol.asyncIterator]() {
        const actual = child.output[Symbol.asyncIterator]()
        return {
          next: () => ready.join("").includes(created.ready) ? new Promise<IteratorResult<NativeChunk>>(() => {}) : actual.next(),
          return: () => new Promise<IteratorResult<NativeChunk>>(() => {}),
        }
      },
    },
    stop: () => new Promise(() => {}),
  }))
  const child = DesktopOmni.spawn(created.command, created.args, { load: injected.load })
  const errors: Error[] = []
  child.on("error", (error: Error) => errors.push(error))
  child.stdout.on("data", (chunk: Buffer) => ready.push(chunk.toString()))
  child.stderr.resume()
  const closed = Promise.withResolvers<void>()
  child.once("close", () => closed.resolve())
  await until(() => ready.join("").includes(created.ready))
  wait.reject(new Error("supervisor-lost"))
  try {
    await Promise.race([closed.promise, Bun.sleep(6000).then(() => { throw new Error("cleanup exceeded drain grace") })])
    expect(errors.some((error) => error.message.includes("termination-unknown"))).toBe(true)
    expect(injected.state.stops).toBeGreaterThan(0)
  } finally {
    await injected.state.child?.stop()
  }
}, 15_000)

test.skipIf(!on)("PTY wait rejection reaps the tree, ends data, and replays fallback exit once with disposable listeners", async () => {
  expectSpawn(import.meta.path)
  const created = nonceTree(0)
  const wait = Promise.withResolvers<NativeExit>()
  const injected = instrument(() => ({ wait: () => wait.promise }))
  const terminal = await DesktopOmni.terminal(created.command, created.args, { name: "xterm", cols: 80, rows: 24, load: injected.load })
  const events: number[] = []
  const late: number[] = []
  const text: string[] = []
  terminal.onData((data) => text.push(data))
  terminal.onExit((event) => {
    events.push(event.exitCode)
    terminal.onExit((replay) => late.push(replay.exitCode))
  })
  await until(() => text.join("").includes(created.ready))
  wait.reject(new Error("supervisor-lost"))
  try {
    await until(() => events.length > 0)
    await Bun.sleep(50)
    const disposed: number[] = []
    terminal.onExit((event) => disposed.push(event.exitCode)).dispose()
    const before = text.join("")
    await Bun.sleep(100)
    expect(events).toEqual([1])
    expect(late).toEqual([1])
    expect(disposed).toEqual([])
    expect(text.join("")).toBe(before)
    expect(injected.state.stops).toBeGreaterThan(0)
    expect(await swept(created.nonce)).toEqual([])
  } finally {
    await injected.state.child?.stop()
  }
}, 30_000)


test.skipIf(!on)("PTY pump failure settles fallback exit and never delivers output after termination", async () => {
  expectSpawn(import.meta.path)
  const created = nonceTree(0)
  const output = Promise.withResolvers<IteratorResult<NativeChunk>>()
  const state = { first: true }
  const injected = instrument(() => ({ output: controlledOutput(() => {
    if (!state.first) return output.promise
    state.first = false
    return Promise.resolve({ done: false, value: { stream: "pty", data: "before" } })
  }) }))
  const terminal = await DesktopOmni.terminal(created.command, created.args, { name: "xterm", cols: 80, rows: 24, load: injected.load })
  const text: string[] = []
  const exits: number[] = []
  terminal.onData((data) => text.push(data))
  terminal.onExit((event) => exits.push(event.exitCode))
  await until(() => text.join("") === "before")
  output.reject(new Error("pty-pump-lost"))
  try {
    await until(() => exits.length > 0)
    await Bun.sleep(100)
    expect(exits).toEqual([1])
    expect(text).toEqual(["before"])
    expect(injected.state.stops).toBeGreaterThan(0)
    expect(await swept(created.nonce)).toEqual([])
  } finally {
    await injected.state.child?.stop()
  }
}, 30_000)


test.skipIf(!on)("PTY normal exit uses a listener snapshot and respects disposal before late replay", async () => {
  expectSpawn(import.meta.path)
  const terminal = await DesktopOmni.terminal(process.execPath, ["-e", "process.exit(3)"], { name: "xterm", cols: 80, rows: 24 })
  const first: number[] = []
  const registeredDuringExit: number[] = []
  terminal.onExit((event) => {
    first.push(event.exitCode)
    terminal.onExit((late) => registeredDuringExit.push(late.exitCode))
  })
  await until(() => first.length > 0)
  await Bun.sleep(50)
  expect(first).toEqual([3])
  expect(registeredDuringExit).toEqual([3])
  const disposed: number[] = []
  terminal.onExit((event) => disposed.push(event.exitCode)).dispose()
  await Bun.sleep(50)
  expect(disposed).toEqual([])
})


test.each([true, false]).skipIf(!on)("abort wins a missing start (already aborted: %s) with one error and close", async (already) => {
  expectSpawn(import.meta.path)
  await DesktopOmni.execFile(process.execPath, ["-e", "process.exit(0)"])
  const controller = new AbortController()
  if (already) controller.abort()
  const child = DesktopOmni.spawn(`missing-${randomUUID()}`, [], { signal: controller.signal })
  const events: string[] = []
  const errors: Error[] = []
  child.stdout.resume()
  child.stderr.resume()
  child.on("error", (error: Error) => { errors.push(error); events.push("error") })
  child.on("exit", () => events.push("exit"))
  child.on("close", () => events.push("close"))
  if (!already) controller.abort()
  await until(() => events.includes("close"))
  await Bun.sleep(50)
  expect(events).toEqual(["error", "close"])
  expect(errors[0].name).toBe("AbortError")
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
}, 30_000)

test.skipIf(!on)("pipe EOF still observes a failed kill while OS wait remains pending", async () => {
  expectSpawn(import.meta.path)
  const created = nonceTree(0)
  const state = { eof: false }
  const injected = instrument((child) => ({
    output: {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of child.output) {
          yield chunk
          if (Buffer.from(chunk.data).toString().includes(created.ready)) break
        }
        state.eof = true
      },
    },
    stop: async () => { throw new Error("reaper-unavailable") },
  }))
  const child = DesktopOmni.spawn(created.command, created.args, { load: injected.load })
  const events: string[] = []
  const errors: Error[] = []
  child.stdout.resume()
  child.stderr.resume()
  child.on("error", (error: Error) => { errors.push(error); events.push("error") })
  child.on("exit", () => events.push("exit"))
  child.on("close", (code, signal) => events.push(`close:${code}:${signal}`))
  await until(() => state.eof)
  await Bun.sleep(50)
  child.kill()
  try {
    await until(() => events.includes("close:null:null"))
    expect(events).toEqual(["error", "close:null:null"])
    expect(errors[0].message).toContain("termination-unknown")
    expect(injected.state.stops).toBeGreaterThanOrEqual(2)
  } finally {
    await injected.state.child?.stop()
  }
}, 30_000)

test.skipIf(!on)("PTY failed kill settles fallback exit while wait remains pending", async () => {
  expectSpawn(import.meta.path)
  const created = nonceTree(0)
  const injected = instrument(() => ({ stop: async () => { throw new Error("reaper-unavailable") } }))
  const terminal = await DesktopOmni.terminal(created.command, created.args, { name: "xterm", cols: 80, rows: 24, load: injected.load })
  const text: string[] = []
  const exits: number[] = []
  terminal.onData((data) => text.push(data))
  terminal.onExit((event) => exits.push(event.exitCode))
  await until(() => text.join("").includes(created.ready))
  terminal.kill()
  try {
    await until(() => exits.length > 0)
    await Bun.sleep(50)
    expect(exits).toEqual([1])
    expect(injected.state.stops).toBeGreaterThanOrEqual(2)
  } finally {
    await injected.state.child?.stop()
  }
}, 30_000)

test.skipIf(!on)("iterator return failure after drain grace reports error and preserves real OS exit", async () => {
  expectSpawn(import.meta.path)
  const marker = `ready-${randomUUID()}`
  const state = { ready: false, returned: false }
  const injected = instrument((child) => ({ output: {
    [Symbol.asyncIterator]() {
      const output = child.output[Symbol.asyncIterator]()
      return {
        next: () => state.ready ? new Promise<IteratorResult<NativeChunk>>(() => {}) : output.next().then((next) => {
          if (!next.done && Buffer.from(next.value.data).toString().includes(marker)) state.ready = true
          return next
        }),
        return: async () => {
          state.returned = true
          await output.return?.()
          throw new Error("late-iterator-return-failed")
        },
      }
    },
  } }))
  const child = DesktopOmni.spawn(process.execPath, ["-e", `console.log(${JSON.stringify(marker)}); setTimeout(() => process.exit(7), 100)`], { load: injected.load })
  const events: string[] = []
  const errors: Error[] = []
  child.stdout.resume()
  child.stderr.resume()
  child.on("error", (error: Error) => { errors.push(error); events.push("error") })
  child.on("exit", (code) => events.push(`exit:${code}`))
  child.on("close", (code) => events.push(`close:${code}`))
  await until(() => events.includes("close:7"))
  expect(state.ready).toBe(true)
  expect(state.returned).toBe(true)
  expect(events).toEqual(["exit:7", "error", "close:7"])
  expect(errors[0].message).toContain("late-iterator-return-failed")
})
