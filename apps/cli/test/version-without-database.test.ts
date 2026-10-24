import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const entry = path.join(import.meta.dir, "../src/index.ts")

test("--version neither opens nor migrates the local database", async () => {
  const database = path.join(await mkdtemp(path.join(tmpdir(), "orchestra-cli-version-")), "orchestra.db")
  const child = Bun.spawn([process.execPath, entry, "--version"], {
    env: { ...process.env, ORCHESTRA_DB: database },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, exit] = await Promise.all([new Response(child.stdout).text(), child.exited])
  expect(exit).toBe(0)
  expect(stdout.trim()).not.toBe("")
  expect(existsSync(database)).toBe(false)
})
