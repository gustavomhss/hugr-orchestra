import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../../../")
const proof = "packages/orchestra/script/maestro-restart-proof.ts"

test("persists Maestro durable event across process restart", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "orchestra-maestro-restart-"))
  const db = path.join(dir, "restart.db")

  try {
    const write = await run("write", db)
    expect(write.code, write.stderr).toBe(0)
    expect(write.stdout).toContain("MAESTRO_RESTART_WRITE_OK")

    const read = await run("read", db)
    expect(read.code, read.stderr).toBe(0)
    expect(read.stdout).toContain("MAESTRO_RESTART_READ_OK")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

async function run(mode: "write" | "read", db: string) {
  const child = Bun.spawn([process.execPath, proof, mode], {
    cwd: root,
    env: { ...process.env, ORCHESTRA_DB: db },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
  ])
  return { code, stdout, stderr }
}
