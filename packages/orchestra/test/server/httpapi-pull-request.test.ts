import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

// Exercise the same CLI that gates the public route surface, including auth and real Effect handlers.
// Its environment owns isolated Git fixtures, database and XDG roots; missing remotes prevent host CLI calls.
test.each(["coverage", "auth", "effect"])("pull-request routes have executable %s scenarios", async (mode) => {
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(new URL("../../script/httpapi-exercise.ts", import.meta.url)),
      "--mode", mode,
      "--include", "pull-request",
      "--fail-on-missing",
      "--fail-on-skip",
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 90_000, env: { ...process.env, ORCHESTRA_PRINT_LOGS: "1", ORCHESTRA_LOG_LEVEL: "ERROR" } },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(exitCode, stdout + stderr).toBe(0)
  expect(stdout).toContain("selected=2")
  expect(stdout).toContain("summary pass=2 fail=0 skip=0 missing=0 extra=0")
}, 100_000)
