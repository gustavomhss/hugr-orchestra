import { expect, test } from "bun:test"
import path from "node:path"

// The suite renders real Solid DOM; test-ci forces the `solid` condition, so it runs in a browser-condition child.
test("agent schedules section renders in the browser condition", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "--conditions=browser",
      "--preload",
      "./happydom.ts",
      "./test-browser/orchestra/schedule-agents.suite.ts",
    ],
    {
      cwd: path.resolve(import.meta.dir, "../.."),
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
