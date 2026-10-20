import { expect, test } from "bun:test"
import path from "node:path"

const runner = path.join(import.meta.dir, "../../../../test/fixture/db-path-runner.ts")

test("db path prints the configured absolute database path", async () => {
  const child = Bun.spawn([process.execPath, runner], {
    env: { ...process.env, ORCHESTRA_DB: "/tmp/orchestra-cli-test.db" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect(stderr).toBe("")
  expect(stdout.trim()).toBe("/tmp/orchestra-cli-test.db")
  expect(await child.exited).toBe(0)
})

test("db path prints the in-memory database path", async () => {
  const child = Bun.spawn([process.execPath, runner], {
    env: { ...process.env, ORCHESTRA_DB: ":memory:" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(child.stdout).text()
  expect(stdout.trim()).toBe(":memory:")
  expect(await child.exited).toBe(0)
})