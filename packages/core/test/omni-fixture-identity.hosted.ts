// Dedicated native proof: excluded from ordinary Bun suffix discovery, selected by its exact path.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Omni } from "../src/omni"
import { alive } from "./fixture/process-tree"
import { appRuntime, effectModules } from "../../omni/campaign/delivery-fixtures.ts"
import { fileTree, LOGS, matches, table, until, win } from "../../omni/campaign/lib.ts"
import { fixture } from "../../omni/campaign/protocol-fixtures.ts"
import { WindowsInventory } from "../../omni/campaign/windows-inventory.ts"

beforeAll(async () => {
  expect(process.env.CI).toBeTruthy()
  process.env.ORCHESTRA_LOCAL_TESTS = "1"
  const { Effect, ChildProcess } = await effectModules()
  const { AppProcess } = await import("../src/process")
  const runtime = await appRuntime()
  const before = Omni.snapshot()
  try {
    const git = await runtime.runPromise(Effect.gen(function* () {
      const app = yield* AppProcess.Service
      return yield* app.run(ChildProcess.make("git", ["--version"]), { timeout: "10 seconds" })
    }))
    expect(git.exitCode).toBe(0)
    expect(git.stdout.toString()).toContain("git version")
    expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
  } finally { await runtime.dispose() }
})

afterAll(async () => { if (win) await WindowsInventory.stop() })

test("real Bun and Node fixtures publish both exact births before READY under isolated env", async () => {
  for (const runtime of ["bun", "node"] as const) {
    const launched = await launch(runtime, 1)
    try {
      await until(45_000, "both exact fixture births and READY", () => {
        if (launched.state.exit) throw new Error(`fixture exited before READY: ${launched.state.stderr}`)
        return launched.state.stdout.includes(launched.sample.ready) ? true : undefined
      })
      const recorded = records(launched.sample.nonce)
      const rows = table()
      console.log("FIXTURE_IDENTITY_CONTROL " + JSON.stringify({ runtime, os: process.platform, recorded,
        cim: rows.filter((row) => row.args?.includes(launched.sample.nonce)).map((row) => ({ pid: row.pid, startTime: row.startTime })) }))
      expect(recorded).toHaveLength(2)
      expect(recorded.every((record) => typeof record.startTime === "string" && record.startTime.length > 0)).toBe(true)
      expect(recorded.every((record) => rows.some((row) => matches(row, record)))).toBe(true)
      expect(await alive(launched.sample.nonce)).toBe(2)
    } finally { await close(launched) }
  }
}, 120_000)

test("missing real OS creation time fails before READY and never publishes undefined identity", async () => {
  const launched = await launch("bun", 0, "missing")
  try {
    await until(20_000, "missing-birth rejection or baseline false READY", () =>
      launched.state.exit || launched.state.stdout.includes(launched.sample.ready) ? true : undefined)
    console.log("FIXTURE_MISSING_BIRTH_CONTROL " + JSON.stringify({ stdout: launched.state.stdout,
      stderr: launched.state.stderr, exit: launched.state.exit, records: records(launched.sample.nonce) }))
    expect(launched.state.stdout).not.toContain(launched.sample.ready)
    expect(launched.state.stderr).toContain("fixture birth identity missing creation time")
    expect(records(launched.sample.nonce)).toHaveLength(0)
    expect(launched.state.exit?.success).toBe(false)
  } finally { await close(launched) }
}, 45_000)

if (process.platform !== "linux") test("failed real ps/CIM executable lookup fails before READY", async () => {
  const launched = await launch("bun", 0, "query-failure")
  try {
    await until(20_000, "query rejection or baseline false READY", () =>
      launched.state.exit || launched.state.stdout.includes(launched.sample.ready) ? true : undefined)
    console.log("FIXTURE_QUERY_FAILURE_CONTROL " + JSON.stringify({ stdout: launched.state.stdout,
      stderr: launched.state.stderr, exit: launched.state.exit, records: records(launched.sample.nonce) }))
    expect(launched.state.stdout).not.toContain(launched.sample.ready)
    expect(launched.state.stderr).toContain("fixture birth query failed")
    expect(records(launched.sample.nonce)).toHaveLength(0)
    expect(launched.state.exit?.success).toBe(false)
  } finally { await close(launched) }
}, 45_000)

async function launch(runtime: "bun" | "node", depth: number, fault?: "missing" | "query-failure") {
  const scratch = fixture("fixture-identity", { lsp: false })
  const sample = fileTree(scratch.home, depth)
  if (fault === "missing") {
    const rows = table()
    if (!rows.some((row) => row.pid === process.pid && row.args !== null)) throw new Error("missing-birth inventory positive control failed")
    // BSD ps rejects PIDs above its kernel range; an absent valid PID must exercise missing creation time, not syntax.
    const missing = Array.from({ length: 100 }, (_, index) => (process.platform === "darwin" ? 90000 : 2147483647) - index)
      .find((pid) => !rows.some((row) => row.pid === pid))
    if (missing === undefined) throw new Error("missing-birth control has no unallocated PID")
    const source = readFileSync(sample.args[0]!, "utf8")
    if (!source.includes("startTimes([process.pid]")) throw new Error("missing-birth fault boundary absent")
    writeFileSync(sample.args[0]!, source.replace("startTimes([process.pid]", `startTimes([${missing}]`))
  }
  const binding = await Omni.load()
  const child = binding.spawn(scratch.node, ["-e", `
const cp = require('node:child_process');
const child = cp.spawn(${JSON.stringify(runtime === "bun" ? sample.command : scratch.node)}, ${JSON.stringify(sample.args)}, {stdio: ['ignore', 'pipe', 'pipe']});
child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
child.on('error', error => {console.error(error); process.exit(1)});
child.on('exit', code => process.exit(code ?? 1));
`, sample.nonce], { cwd: scratch.project, inheritEnv: false, env: { ...scratch.env,
    TZ: "America/New_York", LC_ALL: "fr_FR.UTF-8", ...(fault === "query-failure" ? { PATH: scratch.project, Path: scratch.project } : {}) },
    text: false, backpressure: true })
  const state = { stdout: "", stderr: "", exit: undefined as Awaited<ReturnType<typeof child.wait>> | undefined }
  const pump = (async () => { for await (const item of child.output) {
    state[item.stream === "stderr" ? "stderr" : "stdout"] += Buffer.from(item.data).toString("utf8")
  } })()
  const waited = child.wait().then((exit) => { state.exit = exit })
  return { scratch, sample, child, state, pump, waited }
}

function records(nonce: string) {
  return readdirSync(path.join(os.tmpdir(), nonce)).filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(path.join(os.tmpdir(), nonce, file), "utf8")) as { pid: number; startTime: string })
}

async function close(launched: Awaited<ReturnType<typeof launch>>) {
  await launched.child.stop({ graceMs: 1000 })
  await Promise.all([launched.pump, launched.waited])
  await until(8_000, "fixture owned tree stopped", () => !table().some((row) =>
    row.args?.includes(launched.sample.nonce) && !row.state.startsWith("Z")) ? true : undefined)
  // Preserve raw records, including baseline undefined-field failure, before any cleanup can conceal it.
  writeFileSync(path.join(LOGS, `${launched.scratch.tag}.identity-control.json`), JSON.stringify({ state: launched.state,
    records: records(launched.sample.nonce), bootstrap: existsSync(path.join(os.tmpdir(), launched.sample.nonce, "identity.mjs")) }))
}
