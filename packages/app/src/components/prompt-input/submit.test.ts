import { expect, test } from "bun:test"
import path from "node:path"

// Bun's module mocks outlive their test file. The suite entry imports dispatch,
// admission, delivery and policy domains plus one shared harness inside this child process.
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
  if (condition === "browser") {
    ;[
      "reactive owner ABA during ACK permanently expires attempt; deliberate retry adopts same Session",
      "reactive owner disposal during ACK expires attempt without consuming draft",
      "reactive owner ABA after queued clear cannot revive captured queued send",
    ].forEach((name) => expect(stdout + stderr).toContain(`(pass) ${name}`))
  }
}, 35_000)
