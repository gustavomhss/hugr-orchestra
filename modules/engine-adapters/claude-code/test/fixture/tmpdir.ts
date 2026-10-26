import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export async function tmpdir() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "orchestra-claude-code-test-")))
  return {
    path: directory,
    async [Symbol.asyncDispose]() {
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}
