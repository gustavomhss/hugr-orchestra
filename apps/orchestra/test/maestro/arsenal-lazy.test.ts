import { expect, test } from "bun:test"
import path from "node:path"
import { Schema } from "effect"

test("default AppRuntime boot does not load Arsenal registry; selected package acquisition engages import control", async () => {
  const cwd = path.resolve(import.meta.dir, "../..")
  const child = Bun.spawn([
    process.execPath, "test", "--preload", "@opentui/solid/preload", "--preload", "./test/preload.ts",
    "./test/maestro/fixtures/arsenal-lazy-probe.ts", "--timeout", "90000",
  ], { cwd, env: process.env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  if (exit !== 0) throw new Error(`Lazy child failed (${exit}): ${stderr}`)
  const line = stdout.split("\n").find((value) => value.startsWith('{"boot":'))
  if (!line) throw new Error("Lazy child did not produce native boot/acquisition evidence")
  const result = Schema.decodeUnknownSync(Schema.Struct({
    boot: Schema.Array(Schema.String), acquired: Schema.Array(Schema.String), capabilities: Schema.Number,
  }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(line))
  expect(result.boot).toEqual([])
  expect(result.capabilities).toBeGreaterThan(0)
  expect(result.acquired.length).toBeGreaterThan(0)
}, 90000)
