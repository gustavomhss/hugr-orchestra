// Dedicated hosted proof: excluded from ordinary Bun suffix discovery, selected by its exact path.
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { appRuntime } from "../delivery-fixtures.ts"
import { run } from "../v10-natural-exit.ts"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"

test("V10 core process disposal over omni releases the Bun event loop", async () => {
  expectSpawn(import.meta.path)
  expect(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER).toBe("strict")
  // The parent's strict positive control uses real AppProcess.run, never counter edits.
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
  const result = await run()
  expect({ pass: result.pass, error: result.error }).toEqual({ pass: true, error: "" })
}, 300_000)

test("V10 held timer mutation is red after actual disposal within unchanged bounds", async () => {
  expectSpawn(import.meta.path)
  const result = await run({ mutation: "timer" })
  expect(result.pass).toBe(false)
  expect(result.error).toContain("natural code-zero unsignalled host close and owned inventory zero")
  expect(result.output).toContain('"event":"disposed"')
  expect(result.output).toContain("NATURAL_RETAINED ")
  expect(result.observation.disposed).toBe(true)
  expect(result.observation.closed).toBe(false)
  expect(result.observation.exitCode).toBeNull()
  expect(result.observation.signalCode).toBeNull()
  expect(result.observation.left.some((row) => row.pid === result.hostPID)).toBe(true)
  // Restore only the mutation input; the same source and deadlines must return green.
  expect((await run()).pass).toBe(true)
}, 300_000)
