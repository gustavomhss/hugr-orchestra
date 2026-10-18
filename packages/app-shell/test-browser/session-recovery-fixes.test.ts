import { expect, test } from "bun:test"
import path from "node:path"

test("cold-review recovery regressions with isolated browser/service fixtures", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "--conditions=browser",
      "--timeout",
      "20000",
      "--preload",
      "./happydom.ts",
      "./test-browser/session-recovery-fixes.suite.ts",
    ],
    { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe", timeout: 120_000 },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
  ])
  expect(code, stdout + stderr).toBe(0)
  console.log(stdout + stderr)
}, 125_000)
