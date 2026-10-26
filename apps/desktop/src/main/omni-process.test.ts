import { afterEach, expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { gone, reap, sweep, tree } from "@orchestra/core/test/fixture/process-tree"
import { DesktopOmni } from "./omni-process"
import { startOwnedServe } from "./owned-serve"

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

// The desktop-owned `orchestra serve` supervisor (owned-serve.ts) over a real omni spawn.
// A stand-in for `orchestra serve`: Basic auth on /api/health, prints its password, /crash exits, SIGTERM is logged.
const fakeServe = `
const port = Number(process.argv[process.argv.indexOf("--port") + 1])
const password = process.env.ORCHESTRA_SERVER_PASSWORD
const expected = "Basic " + Buffer.from("orchestra:" + password).toString("base64")
console.log("listening with password " + password)
process.on("SIGTERM", () => {
  console.log("sigterm")
  process.exit(0)
})
Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    if (new URL(request.url).pathname === "/crash") setTimeout(() => process.exit(3), 10)
    if (request.headers.get("authorization") !== expected) return new Response("no", { status: 401 })
    return new Response("ok")
  },
})
`

test.skipIf(!on)("owned serve: readiness, redaction, crash restart, SIGTERM stop", async () => {
  expectSpawn(import.meta.path)
  const dir = await mkdtemp(join(tmpdir(), "owned-serve-"))
  await writeFile(join(dir, "serve.ts"), fakeServe)
  const lines: string[] = []
  const events: { message: string; meta?: Record<string, unknown> }[] = []
  const record = (message: string, meta?: Record<string, unknown>) => void events.push({ message, meta })
  const owned = await startOwnedServe({
    logger: { log: record, error: record },
    command: [process.execPath, join(dir, "serve.ts")],
    env: { PATH: process.env.PATH ?? "" },
    write: (_stream, message) => void lines.push(message),
  })
  const auth = { authorization: `Basic ${Buffer.from(`orchestra:${owned.password}`).toString("base64")}` }

  await owned.health.wait
  expect((await fetch(`${owned.url}/api/health`, { headers: auth })).status).toBe(200)
  expect((await fetch(`${owned.url}/api/health`)).status).toBe(401)
  await until(() => lines.some((line) => line.includes("listening with password")))
  expect(lines.join("\n")).not.toContain(owned.password)
  expect(lines).toContain("listening with password [redacted]")

  await fetch(`${owned.url}/crash`).catch(() => undefined)
  await until(() => events.some((event) => event.message === "owned serve restarting"))
  await until(() => fetch(`${owned.url}/api/health`, { headers: auth }).then((r) => r.ok, () => false))

  await owned.listener.stop()
  const exits = events.filter((event) => event.message === "owned serve exited").map((event) => event.meta)
  expect(exits[0]).toEqual({ code: 3, signal: null, stopping: false })
  // Windows has no SIGTERM handler to run: the stop terminates the process, so only the stopping exit is observable.
  if (process.platform === "win32") return expect(exits[1]?.stopping).toBe(true)
  await until(() => lines.includes("sigterm"))
  expect(exits[1]).toEqual({ code: 0, signal: null, stopping: true })
}, 30_000)

async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 15_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not met in 15s")
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
