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
  ;[
    ...["create", "rules", "draft-before-sdk"].map((phase) => `real PromptProvider preserves A's unsent draft on owner change during ${phase}`),
    "real PromptProvider fresh A admission promotes coherently and sends once",
    "real PromptProvider owner ABA permanently holds old attempt until deliberate retry",
  ].forEach((name) => expect(stdout + stderr).toContain(`(pass) ${name}`))
}, 125_000)
