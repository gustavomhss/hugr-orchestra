import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { appRuntime } from "../../omni/campaign/delivery-fixtures.ts"
import { buildHosts, run } from "../../omni/campaign/v10-natural-exit.ts"

test("V10 real AppRuntime LSP/MCP disposal releases Bun and built Node event loops", async () => {
  expect(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER).toBe("strict")
  // Production parent's strict positive control uses real AppProcess.run, never counter edits.
  const parent = await appRuntime()
  try {
    const output = await parent.runPromise(Effect.gen(function* () {
      const app = yield* AppProcess.Service
      return yield* app.run(ChildProcess.make(Bun.which("node")!, ["-e", "process.stdout.write('PARENT_APP_PROCESS_READY')"]))
    }))
    expect(output.exitCode).toBe(0)
    expect(output.stdout.toString()).toBe("PARENT_APP_PROCESS_READY")
  } finally {
    await parent.dispose()
  }
  const build = await buildHosts()
  const results = []
  for (const runtime of ["bun", "node"] as const) {
    results.push(await run({ runtime, build }))
  }
  expect(results.map((result) => ({ runtime: result.runtime, pass: result.pass, error: result.error }))).toEqual([
    { runtime: "bun", pass: true, error: "" }, { runtime: "node", pass: true, error: "" },
  ])
}, 300_000)

test("V10 held timer mutation is red after actual disposal within unchanged bounds", async () => {
  const build = await buildHosts()
  for (const runtime of ["bun", "node"] as const) {
    const result = await run({ runtime, build, mutation: "timer" })
    expect(result.pass).toBe(false)
    expect(result.error).toContain("natural code-zero unsignalled host close and owned inventory zero")
    expect(result.error).not.toContain("failed cleanup")
    expect(result.output).toContain('"event":"disposed"')
    expect(result.output).toContain("NATURAL_RETAINED ")
    expect(result.observation.disposed).toBe(true)
    expect(result.observation.closed).toBe(false)
    expect(result.observation.exitCode).toBeNull()
    expect(result.observation.signalCode).toBeNull()
    expect(result.observation.left.some((row) => row.pid === result.hostPID)).toBe(true)
    expect(result.observation.fixtures).toHaveLength(4)
    expect(result.observation.fixtures.every((fixture) => fixture.members.length + fixture.wrappers.length === 0)).toBe(true)
    // Restore only mutation input; same source and same deadlines must return green.
    expect((await run({ runtime, build })).pass).toBe(true)
  }
}, 300_000)
