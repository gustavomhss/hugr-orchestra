import { expect, test } from "bun:test"
import path from "node:path"
import { Process } from "../../orchestra/src/util/process"
import { Omni } from "../../core/src/omni"
import { expectSpawn } from "../../core/test/fixture/omni-expect"

const suites = ["session-list-regressions", "session-state-regressions"]

test.each(suites)("%s executes with isolated browser-conditioned Solid", async (suite) => {
  expectSpawn(import.meta.path)
  const before = Omni.snapshot()
  const result = await Process.run(
    [process.execPath, "test", "--conditions=browser", "--timeout", "20000", "--preload", "./happydom.ts", `./test-browser/${suite}.suite.ts`],
    { cwd: path.resolve(import.meta.dir, ".."), nothrow: true, deadline: 120_000 },
  )
  const output = result.stdout.toString() + result.stderr.toString()
  expect(result.code, output).toBe(0)
  expect(output).toMatch(/\b[1-9]\d* pass\b/)
  expect(output).not.toMatch(/\b[1-9]\d* skip\b/)
  expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
  expect(Omni.snapshot().delegations).toBe(before.delegations)
}, 125_000)
