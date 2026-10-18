import { expect, test } from "bun:test"
import path from "node:path"

test.each(["./test-browser/subagent-policy.suite.ts", "./src/components/prompt-input/submit-policy.suite.ts"])(
  "policy journey with isolated browser fixtures: %s", async (file) => {
    const child = Bun.spawn([process.execPath, "test", "--conditions=browser", "--preload", "./happydom.ts", file], {
      cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe", timeout: 180_000,
    })
    const [code, stdout, stderr] = await Promise.all([child.exited, Bun.readableStreamToText(child.stdout), Bun.readableStreamToText(child.stderr)])
    expect(code, stdout + stderr).toBe(0)
  }, 185_000,
)
