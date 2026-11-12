import { expect, test } from "bun:test"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { sidecarMode, startOwnedServe } from "./owned-serve"

test("the desktop runs its owned serve child unless the shared daemon is asked for", () => {
  expect(sidecarMode(undefined)).toBe("owned")
  expect(sidecarMode("")).toBe("owned")
  expect(sidecarMode("owned")).toBe("owned")
  // Anything but "shared" starts the owned child, old selectors included.
  expect(sidecarMode("legacy")).toBe("owned")
  expect(sidecarMode("0")).toBe("owned")
  expect(sidecarMode("1")).toBe("owned")
  expect(sidecarMode("shared")).toBe("shared")
})


const serveScript = `
const server = Bun.serve({
  hostname: "127.0.0.1", port: Number(process.argv.at(-1)),
  fetch() { console.log("health"); return new Response("ok", { status: Number(process.env.OWNED_TEST_STATUS ?? 200) }) },
})
if (process.env.OWNED_TEST_CRASH) setTimeout(() => process.exit(1), process.env.OWNED_TEST_CRASH === "loop" ? 0 : 61000)
`

async function until(check: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out")
    await Bun.sleep(10)
  }
}

test("a crash after stability starts again at the first backoff attempt, and stop cancels restart", async () => {
  expectSpawn(import.meta.path)
  const restarts: Record<string, unknown>[] = []
  const spawned: (number | undefined)[] = []
  const serve = await startOwnedServe({
    logger: { log: (message, meta) => { if (message === "owned serve restarting" && meta) restarts.push(meta) }, error: () => {} },
    command: [process.execPath, "-e", serveScript], cwd: process.cwd(),
    env: { ...process.env, OWNED_TEST_CRASH: "1" }, write: () => {}, onSpawn: (pid) => spawned.push(pid),
  })
  try {
    await serve.health.wait
    await until(() => restarts.length > 0, 70_000)
    expect(restarts[0]).toEqual({ attempt: 1, wait: 1000 })
  } finally {
    await serve.listener.stop()
  }
  await Bun.sleep(1200)
  expect(spawned.length).toBe(1)
}, 90_000)

test("startup polling ends on stop and does not contact a replacement listener", async () => {
  expectSpawn(import.meta.path)
  const state = { checks: 0, unexpected: 0 }
  const serve = await startOwnedServe({
    logger: { log: () => {}, error: () => {} },
    command: [process.execPath, "-e", serveScript], cwd: process.cwd(),
    env: { ...process.env, OWNED_TEST_STATUS: "503" },
    write: (_stream, line) => { if (line === "health") state.checks += 1 },
  })
  const health = serve.health.wait.catch((error: unknown) => error)
  await until(() => state.checks > 0)
  await serve.listener.stop()
  const replacement = Bun.serve({
    hostname: "127.0.0.1", port: Number(new URL(serve.url).port),
    fetch() { state.unexpected += 1; return new Response("ok") },
  })
  try {
    expect(await health).toBeInstanceOf(Error)
    await Bun.sleep(500)
    expect(state.unexpected).toBe(0)
  } finally {
    replacement.stop(true)
  }
})

test("a failed spawn rejects readiness promptly", async () => {
  const serve = await startOwnedServe({
    logger: { log: () => {}, error: () => {} }, command: ["/orchestra-missing-executable"],
    cwd: process.cwd(), env: {}, write: () => {},
  })
  const outcome = await Promise.race([
    serve.health.wait.catch((error: unknown) => error),
    Bun.sleep(3000).then(() => "timeout"),
  ])
  expect(outcome).toBeInstanceOf(Error)
})


test("a crash loop keeps the bounded increasing restart schedule", async () => {
  expectSpawn(import.meta.path)
  const state = { failed: false, spawned: 0 }
  const restarts: Record<string, unknown>[] = []
  const serve = await startOwnedServe({
    logger: {
      log: (message, meta) => { if (message === "owned serve restarting" && meta) restarts.push(meta) },
      error: (message) => { if (message === "owned serve crash loop; not restarting") state.failed = true },
    },
    command: [process.execPath, "-e", serveScript], cwd: process.cwd(),
    env: { ...process.env, OWNED_TEST_CRASH: "loop" }, write: () => {}, onSpawn: () => { state.spawned += 1 },
  })
  void serve.health.wait.catch(() => {})
  try {
    await until(() => state.failed, 80_000)
    expect(restarts).toEqual([1000, 2000, 4000, 8000, 16000, 30000].map((wait, index) => ({ attempt: index + 1, wait })))
    expect(state.spawned).toBe(7)
  } finally {
    await serve.listener.stop()
  }
}, 90_000)

test("startup deadline ends health requests while the unhealthy child is still alive", async () => {
  expectSpawn(import.meta.path)
  const state = { checks: 0 }
  const serve = await startOwnedServe({
    logger: { log: () => {}, error: () => {} },
    command: [process.execPath, "-e", serveScript], cwd: process.cwd(),
    env: { ...process.env, OWNED_TEST_STATUS: "503" },
    write: (_stream, line) => { if (line === "health") state.checks += 1 },
  })
  try {
    await expect(serve.health.wait).rejects.toThrow("not healthy within 120000ms")
    const checks = state.checks
    expect(checks).toBeGreaterThan(0)
    await Bun.sleep(500)
    expect(state.checks).toBe(checks)
  } finally {
    await serve.listener.stop()
  }
}, 140_000)
