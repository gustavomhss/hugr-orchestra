import { expect, test } from "bun:test"
import path from "node:path"

// Bun's module mocks outlive their test file. Keep the original suite in a child
// process so its SDK and context mocks cannot replace other tests' real imports.
test("prompt submit with isolated module mocks", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "--conditions=solid",
      "--preload",
      "./happydom.ts",
      "./src/components/prompt-input/submit.suite.ts",
    ],
    {
      cwd: path.resolve(import.meta.dir, "../../.."),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
  ])

  expect(code, stdout + stderr).toBe(0)
}, 35_000)
