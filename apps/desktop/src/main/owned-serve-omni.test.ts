import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, realpath, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { DesktopOmni } from "./omni-process"
import { startOwnedServe } from "./owned-serve"
import { until } from "./omni-process.fixture"

const on = DesktopOmni.enabled()

// The desktop-owned `orchestra serve` supervisor (owned-serve.ts) over a real omni spawn.
// A stand-in for `orchestra serve`: Basic auth on /api/health, prints its password and cwd, /crash exits, SIGTERM is logged.
const fakeServe = `
const port = Number(process.argv[process.argv.indexOf("--port") + 1])
const password = process.env.ORCHESTRA_SERVER_PASSWORD
const expected = "Basic " + Buffer.from("orchestra:" + password).toString("base64")
console.log("listening with password " + password)
console.log("cwd " + process.cwd())
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

test.skipIf(!on)("owned serve: readiness, redaction, cwd, crash restart, SIGTERM stop", async () => {
  expectSpawn(import.meta.path)
  // Windows runners keep TEMP as an 8.3 short path (RUNNER~1); the child reports the cwd it was given, so give it the long one.
  const dir = await realpath(await mkdtemp(join(tmpdir(), "owned-serve-")))
  await writeFile(join(dir, "serve.ts"), fakeServe)
  const lines: string[] = []
  const events: { message: string; meta?: Record<string, unknown> }[] = []
  const record = (message: string, meta?: Record<string, unknown>) => void events.push({ message, meta })
  const owned = await startOwnedServe({
    logger: { log: record, error: record },
    command: [process.execPath, join(dir, "serve.ts")],
    env: { PATH: process.env.PATH ?? "" },
    cwd: dir,
    write: (_stream, message) => void lines.push(message),
  })
  const auth = { authorization: `Basic ${Buffer.from(`orchestra:${owned.password}`).toString("base64")}` }

  await owned.health.wait
  expect((await fetch(`${owned.url}/api/health`, { headers: auth })).status).toBe(200)
  expect((await fetch(`${owned.url}/api/health`)).status).toBe(401)
  await until(() => lines.some((line) => line.includes("listening with password")))
  expect(lines.join("\n")).not.toContain(owned.password)
  expect(lines).toContain("listening with password [redacted]")
  expect(lines).toContain(`cwd ${dir}`)

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

test.skipIf(!on)("owned serve: a spawn error fails health without waiting out the timeout", async () => {
  const started = Date.now()
  const owned = await startOwnedServe({
    logger: { log: () => {}, error: () => {} },
    command: [join(tmpdir(), "orchestra-missing-binary")],
    env: { PATH: process.env.PATH ?? "" },
    cwd: tmpdir(),
    write: () => {},
  })
  const failure = await owned.health.wait.then(
    () => undefined,
    (error: unknown) => error,
  )
  await owned.listener.stop()
  expect(failure).toBeInstanceOf(Error)
  expect((failure as Error).message).toContain("ENOENT")
  expect((failure as Error).message).not.toContain("not healthy within")
  expect(Date.now() - started).toBeLessThan(15_000)
}, 30_000)

const newerDatabase =
  "This database was created by a newer Orchestra version (it has migrations this build does not know: 20261105094327_inbox). Update the app before opening it."
const newerRefusal = "owned serve will not restart: the database is newer than this build"

test.skipIf(!on)("owned serve: a newer database is not restarted", async () => {
  expectSpawn(import.meta.path)
  const dir = await mkdtemp(join(tmpdir(), "owned-serve-"))
  await writeFile(join(dir, "serve.ts"), `console.error(${JSON.stringify(newerDatabase)}); process.exit(1)`)
  const messages: string[] = []
  const owned = await startOwnedServe({
    logger: {
      log: (message) => messages.push(message),
      error: (message) => messages.push(message),
    },
    command: [process.execPath, join(dir, "serve.ts")],
    env: { PATH: process.env.PATH ?? "" },
    cwd: dir,
    write: () => {},
  })
  const failure = await owned.health.wait.then(
    () => undefined,
    (error: unknown) => error,
  )
  // The refusal is logged on close, after health has already rejected on exit. Stopping first would skip it.
  await until(() => messages.includes(newerRefusal))
  await owned.listener.stop()
  expect(failure).toBeInstanceOf(Error)
  expect((failure as Error).message).toContain("newer Orchestra version")
  expect(messages).toContain(newerRefusal)
  expect(messages).not.toContain("owned serve restarting")
}, 30_000)

test.skipIf(!on)("owned serve: a newer database written without a trailing newline is not restarted", async () => {
  expectSpawn(import.meta.path)
  const started = await ownedScript(`process.stderr.write(${JSON.stringify(newerDatabase)}); process.exit(1)`)
  try {
    await until(() => started.messages.includes(newerRefusal) && started.spawns.length >= 1)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    expect(started.messages).not.toContain("owned serve restarting")
    expect(started.spawns).toHaveLength(1)
  } finally {
    await started.owned.listener.stop()
  }
}, 30_000)

test.skipIf(!on)("owned serve: a newer database followed by more than 15 lines is not restarted", async () => {
  expectSpawn(import.meta.path)
  const tail = Array.from({ length: 16 }, (_, index) => `effect stack ${index}`)
  const started = await ownedScript(
    `console.error(${JSON.stringify([newerDatabase, ...tail].join("\n"))}); process.exit(1)`,
  )
  try {
    await until(() => started.messages.includes(newerRefusal) && started.spawns.length >= 1)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    expect(started.messages).not.toContain("owned serve restarting")
    expect(started.spawns).toHaveLength(1)
  } finally {
    await started.owned.listener.stop()
  }
}, 30_000)

test.skipIf(!on)("owned serve: a newer database phrase does not suppress a later unrelated restart", async () => {
  expectSpawn(import.meta.path)
  // The phrase child is not restarted, so the later child is a new supervisor. A refusal kept past that child would suppress it.
  const previous = await ownedScript(`console.error(${JSON.stringify(newerDatabase)}); process.exit(1)`)
  try {
    await until(() => previous.messages.includes(newerRefusal))
    expect(previous.messages).not.toContain("owned serve restarting")
  } finally {
    await previous.owned.listener.stop()
  }
  const later = await ownedScript(`console.error("cannot open database: disk full"); process.exit(2)`)
  try {
    await until(() => later.messages.includes("owned serve restarting") && later.spawns.length >= 2)
    expect(later.messages).not.toContain(newerRefusal)
  } finally {
    await later.owned.listener.stop()
  }
}, 30_000)

test.skipIf(!on)("owned serve: a server that dies at start fails health with its last output", async () => {
  expectSpawn(import.meta.path)
  const dir = await mkdtemp(join(tmpdir(), "owned-serve-"))
  await writeFile(join(dir, "serve.ts"), `console.error("cannot open database: disk full"); process.exit(2)`)
  const owned = await startOwnedServe({
    logger: { log: () => {}, error: () => {} },
    command: [process.execPath, join(dir, "serve.ts")],
    env: { PATH: process.env.PATH ?? "" },
    cwd: dir,
    write: () => {},
  })
  const failure = await owned.health.wait.then(
    () => undefined,
    (error: unknown) => error,
  )
  await owned.listener.stop()
  expect(failure).toBeInstanceOf(Error)
  expect((failure as Error).message).toContain("exited before its health check passed")
  expect((failure as Error).message).toContain("cannot open database: disk full")
}, 30_000)

async function ownedScript(script: string) {
  const dir = await mkdtemp(join(tmpdir(), "owned-serve-"))
  await writeFile(join(dir, "serve.ts"), script)
  const messages: string[] = []
  const spawns: Array<number | undefined> = []
  const owned = await startOwnedServe({
    logger: {
      log: (message) => messages.push(message),
      error: (message) => messages.push(message),
    },
    command: [process.execPath, join(dir, "serve.ts")],
    env: { PATH: process.env.PATH ?? "" },
    cwd: dir,
    write: () => {},
    onSpawn: (pid) => spawns.push(pid),
  })
  // Health rejects on exit, before close decides. Hold the rejection so it does not fail the test early.
  const failure = owned.health.wait.then(
    () => undefined,
    (error: unknown) => error,
  )
  return { owned, messages, spawns, failure }
}

test.skipIf(!on)("owned serve: diagnostics bound long split lines, redact secrets and remember newer database", async () => {
  expectSpawn(import.meta.path)
  const dir = await mkdtemp(join(tmpdir(), "owned-serve-bounded-"))
  await writeFile(join(dir, "serve.ts"), `
const password = process.env.ORCHESTRA_SERVER_PASSWORD
process.stderr.write("newer Orchestra ")
setTimeout(() => {
  process.stderr.write("version" + "é".repeat(2_000_000) + password.slice(0, 18))
  setTimeout(() => {
    process.stderr.write(password.slice(18) + "x".repeat(2_000_000) + "\\n")
    console.error(Array.from({length: 30}, (_, i) => "tail " + i).join("\\n"))
    setTimeout(() => process.exit(1), 300)
  }, 20)
}, 20)
`)
  const messages: string[] = []
  const sizes: number[] = []
  let leaked = ""
  const owned = await startOwnedServe({
    logger: { log: (message) => messages.push(message), error: (message) => messages.push(message) },
    command: [process.execPath, join(dir, "serve.ts")],
    env: { PATH: process.env.PATH ?? "" }, cwd: dir,
    write: (_stream, line) => { sizes.push(Buffer.byteLength(line)); if (line.includes("[redacted]")) leaked = line },
  })
  try {
    const failure = await owned.health.wait.catch((error: Error) => error)
    await until(() => messages.includes(newerRefusal))
    expect(Math.max(...sizes)).toBeLessThanOrEqual(16_384)
    expect(leaked).toContain("[redacted]")
    expect(leaked).not.toContain(owned.password)
    expect(String(failure)).not.toContain(owned.password)
    expect(Buffer.byteLength(String(failure))).toBeLessThan(250_000)
    expect(String(failure).split("Last server output:\n")[1]?.split("\n").length).toBeLessThanOrEqual(15)
    expect(messages).not.toContain("owned serve restarting")
  } finally { await owned.listener.stop() }
}, 30_000)
// Append to apps/desktop/src/main/omni-process.test.ts in a separate CI-only repro checkout.
// Uses that file's existing fakeServe, expectSpawn, DesktopOmni, startOwnedServe and until.
test.skipIf(!on)("owned serve: a server stable for 65 seconds restarts after a crash", async () => {
  expectSpawn(import.meta.path)
  const dir = await realpath(await mkdtemp(join(tmpdir(), "owned-serve-stable-")))
  const marker = `stable-${randomUUID()}`
  await writeFile(join(dir, "serve.ts"), `${fakeServe}\nsetTimeout(() => console.log(${JSON.stringify(marker)}), 65_000)\n`)
  const events: string[] = []
  const spawns: Array<number | undefined> = []
  const stable = Promise.withResolvers<void>()
  const stableDeadline = setTimeout(() => stable.reject(new Error("server did not emit its 65-second marker")), 80_000)
  const owned = await startOwnedServe({
    logger: { log: (message) => events.push(message), error: (message) => events.push(message) },
    command: [process.execPath, join(dir, "serve.ts")],
    env: { PATH: process.env.PATH ?? "" },
    cwd: dir,
    write: (_stream, message) => { if (message === marker) stable.resolve() },
    onSpawn: (pid) => spawns.push(pid),
  })
  try {
    await owned.health.wait
    // Synchronize on a real child marker; do not change clocks or source constants.
    await stable.promise
    const auth = { authorization: `Basic ${Buffer.from(`orchestra:${owned.password}`).toString("base64")}` }
    await fetch(`${owned.url}/crash`, { headers: auth }).catch(() => undefined)
    await until(() => events.includes("owned serve restarting") || events.includes("owned serve crash loop; not restarting"))
    expect(events).toContain("owned serve restarting")
    expect(events).not.toContain("owned serve crash loop; not restarting")
    await until(() => spawns.length >= 2)
    await until(() => fetch(`${owned.url}/api/health`, { headers: auth }).then((response) => response.ok, () => false))
  } finally {
    clearTimeout(stableDeadline)
    await owned.listener.stop()
  }
}, 100_000)

test.skipIf(!on)("owned serve: immediate crashes exhaust the budget; explicit stop cancels retry", async () => {
  expectSpawn(import.meta.path)
  const crashing = await ownedScript(`process.exit(2)`)
  try {
    const deadline = Date.now() + 85_000
    while (!crashing.messages.includes("owned serve crash loop; not restarting")) {
      if (Date.now() > deadline) throw new Error("crash budget did not stop the loop")
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(crashing.spawns).toHaveLength(7)
  } finally { await crashing.owned.listener.stop() }
  const stopped = await ownedScript(`process.exit(2)`)
  try {
    await until(() => stopped.messages.includes("owned serve restarting"))
    await stopped.owned.listener.stop()
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    expect(stopped.spawns).toHaveLength(1)
  } finally { await stopped.owned.listener.stop() }
}, 100_000)

test.skipIf(!on)("owned serve: split database refusal survives an interleaved output stream", async () => {
  expectSpawn(import.meta.path)
  const started = await ownedScript(`
process.stderr.write("x".repeat(4081) + "newer Orchestra version" + "y".repeat(80))
setTimeout(() => console.log("interleaved stdout"), 50)
setTimeout(() => process.stderr.write("\\n"), 150)
setTimeout(() => process.exit(1), 250)
`)
  try {
    await until(() => started.messages.includes(newerRefusal) || started.messages.includes("owned serve restarting"))
    expect(started.messages).toContain(newerRefusal)
    expect(started.messages).not.toContain("owned serve restarting")
    expect(started.spawns).toHaveLength(1)
  } finally { await started.owned.listener.stop() }
}, 30_000)
