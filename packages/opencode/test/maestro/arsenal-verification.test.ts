import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AppProcess } from "@opencode-ai/core/process"
import { Global } from "@opencode-ai/core/global"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ArsenalVerification } from "@/maestro/arsenal-verification"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node, Global.node, CrossSpawnSpawner.node])))

it.live("actual Bun JUnit count acquisition rejects missing counts, malformed XML and nonnumeric counters", () => Effect.gen(function* () {
  const directory = yield* tmpdirScoped()
  const report = path.join(directory, "actual.xml")
  yield* Effect.promise(() => Bun.write(path.join(directory, "probe.test.ts"), 'import { test, expect } from "bun:test"; test("real count", () => expect(2).toBe(2))'))
  const bytes = yield* Effect.promise(async () => {
    const child = Bun.spawn([process.execPath, "test", "--reporter=junit", `--reporter-outfile=${report}`], { cwd: directory, stdout: "ignore", stderr: "ignore" })
    expect(await child.exited).toBe(0)
    return Bun.file(report).text()
  })
  expect(yield* ArsenalVerification.decodeReport(bytes)).toMatchObject({ "@tests": 1, "@assertions": 1 })
  for (const name of ["tests", "failures", "skipped", "assertions"]) {
    const pattern = new RegExp(` ${name}="[^"]*"`, "g")
    expect(bytes).toMatch(pattern)
    expect((yield* ArsenalVerification.decodeReport(bytes.replace(pattern, "")).pipe(Effect.result))._tag).toBe("Failure")
  }
  expect((yield* ArsenalVerification.decodeReport(bytes.replace('tests="1"', 'tests="unknown"')).pipe(Effect.result))._tag).toBe("Failure")
  expect((yield* ArsenalVerification.decodeReport(bytes + "<invalid").pipe(Effect.result))._tag).toBe("Failure")
}), 90000)

it.live("fixed native verifier requires actual executed cases; skipped-only and empty zero exits never pass", () =>
  Effect.gen(function* () {
    const cases = [
      { name: "pass", body: 'import { test, expect } from "bun:test"; test("executed", () => expect(1).toBe(1))', status: "pass" },
      { name: "skip", body: 'import { test } from "bun:test"; test.skip("skipped", () => {})', status: "skip" },
      { name: "empty", body: 'export const empty = true', status: "missing" },
      { name: "fail", body: 'import { test, expect } from "bun:test"; test("red", () => expect(1).toBe(2))', status: "fail" },
    ] as const
    yield* Effect.forEach(cases, (entry) => Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      yield* Effect.promise(() => Bun.write(path.join(directory, "probe.test.ts"), entry.body))
      const result = yield* ArsenalVerification.run(directory, (command) => Effect.sync(() => expect(command).toContain('"--reporter=junit"')))
      expect(result.outcome.status).toBe(entry.status)
      if (entry.name === "pass") expect(result.report).toMatchObject({ executed: 1, skipped: 0, failed: 0, assertions: 1 })
      if (entry.name === "skip") expect(result.report).toMatchObject({ executed: 0, skipped: 1, failed: 0 })
      if (entry.name === "empty") expect(result.reason).toBe("RUNNER_REPORT_MISSING")
    }))
  }),
  90000,
)
