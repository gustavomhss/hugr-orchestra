import { expect, test } from "bun:test"
import path from "node:path"

// Bun's module mocks outlive their test file. The suite entry imports dispatch,
// admission and delivery domains plus one shared harness inside this child process.
// Its SDK and context fixtures cannot replace other test files' real imports.
test.each(["solid", "browser"])("prompt submit with isolated module mocks (%s)", async (condition) => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      `--conditions=${condition}`,
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
