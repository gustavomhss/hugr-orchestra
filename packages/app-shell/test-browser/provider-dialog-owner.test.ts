import { expect, test } from "bun:test"
import path from "node:path"

test("provider replacement dialogs retain their captured runtime owner", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "--conditions=browser",
      "--preload",
      "./happydom.ts",
      "./test-browser/provider-dialog-owner.suite.ts",
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
  console.log(stdout + stderr)
  expect(code, stdout + stderr).toBe(0)
}, 125_000)
