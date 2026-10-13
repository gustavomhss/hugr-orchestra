import { expect, test } from "bun:test"
import path from "node:path"

test("prompt admission ownership with the actual PromptProvider", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "--conditions=browser",
      "--preload",
      "./happydom.ts",
      "./test-browser/prompt-admission-owner.suite.ts",
      "--timeout",
      "60000",
    ],
    { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe", timeout: 120_000 },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
  ])
  expect(code, stdout + stderr).toBe(0)
}, 125_000)
