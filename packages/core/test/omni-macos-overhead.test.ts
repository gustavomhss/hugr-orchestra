import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Omni } from "../src/omni"
import { OmniSpawner } from "../src/omni-spawner"
import { ROOT } from "../../omni/campaign/lib"
import { settle } from "../../omni/campaign/v7-attribution"
import { run } from "../../omni/campaign/v7-overhead"

// Ordinary suites omit this hardware measurement; an explicit named-file request must execute on macOS.
const mac = test.skipIf(!process.argv.some((arg) => arg.endsWith("omni-macos-overhead.test.ts")))
mac("macOS V7 completes 1000 paced pairs and rejects measured caller slowdown", async () => {
  expect(process.platform).toBe("darwin")
  expect(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER).toBe("1")
  const binding = await Omni.load()
  const control = await Effect.runPromise(OmniSpawner.collect(binding, ChildProcess.make("git", ["rev-parse", "HEAD"]), {}))
  expect(control.exitCode).toBe(0)
  await settle()
  const measured = await run({ quiet: true, interPairIdleMs: 5 })
  console.log("MACOS_V7 " + JSON.stringify(measured))
  expect(measured.timingKpiRun).toBe(true)
  if (!("counts" in measured)) throw new Error("macOS V7 did not complete its sample inventory")
  expect(measured.counts.legacy.completed).toBe(1000)
  expect(measured.counts.omni.completed).toBe(1000)
  expect(measured.pass).toBe(true)
  await settle()
  const slow = await run({ quiet: true, interPairIdleMs: 5, mutation: "slow-omni" })
  console.log("MACOS_V7_SENSITIVITY " + JSON.stringify(slow))
  expect(slow.timingKpiRun).toBe(true)
  if (!("counts" in slow)) throw new Error("macOS V7 sensitivity did not complete its sample inventory")
  expect(slow.counts.legacy.completed).toBe(1000)
  expect(slow.counts.omni.completed).toBe(1000)
  expect(slow.pass).toBe(false)
}, 900_000)

test("V7 rejects malformed pacing flags before any timing acceptance", async () => {
  for (const args of [["--idle-ms"], ["--idle-ms="], ["--idle-ms= "], ["--idle-ms=NaN"], ["--idle-ms=1", "--idle-ms=2"]]) {
    const proc = Bun.spawn([process.execPath, path.join(ROOT, "packages/omni/campaign/v7-overhead.ts"), ...args], {
      cwd: ROOT, stdout: "pipe", stderr: "pipe", timeout: 10_000,
    })
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    expect(code).not.toBe(0)
    expect(stderr).toContain("V7 requires one --idle-ms=<integer> value")
    expect(stdout).not.toContain('"pass":true')
  }
}, 60_000)
