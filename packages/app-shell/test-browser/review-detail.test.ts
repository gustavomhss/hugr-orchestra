import { expect, test } from "bun:test"
import path from "node:path"

test("review detail with isolated presentation fixtures", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "--conditions=browser",
      "--preload",
      "./happydom.ts",
      "./test-browser/review-detail.suite.ts",
    ],
    {
      cwd: path.resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
  ])
  expect(code, stdout + stderr).toBe(0)
}, 65_000)
