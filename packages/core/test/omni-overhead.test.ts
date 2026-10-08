import { expect, test } from "bun:test"
import { run, settle } from "../../omni/campaign/v7-attribution.ts"

test("V7 attribution: real Effect caller, bare binding, native exit/EOF/stop boundaries", async () => {
  expect(process.platform === "linux" || process.platform === "darwin").toBe(true)
  const { Effect } = await import("effect")
  const { ChildProcess } = await import("effect/unstable/process")
  const { Omni } = await import("../src/omni.ts")
  const { OmniSpawner } = await import("../src/omni-spawner.ts")
  const binding = await Omni.load()
  const control = await Effect.runPromise(OmniSpawner.collect(binding, ChildProcess.make("git", ["rev-parse", "HEAD"]), {}))
  expect(control.exitCode).toBe(0)
  const result = await run()
  expect(result.app.count).toBe(1000)
  expect(result.bare.count).toBe(1000)
  expect(result.staged.count).toBe(1000)
}, 900_000)

test("V7 Linux syscall attribution (unprivileged native strace)", async () => {
  if (process.platform !== "linux") return
  await run(true)
}, 900_000)

test("V7 unchanged 1000-pair quiet real AppProcess KPI", async () => {
  await settle()
  const { run } = await import("../../omni/campaign/v7-overhead.ts")
  const result = await run({ quiet: true })
  console.log("V7_KPI " + JSON.stringify(result))
  expect(result.timingKpiRun).toBe(true)
  expect(result.pass).toBe(true)
}, 900_000)
