import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// A real-path scratch directory removed on dispose; `init` seeds it and its result is returned as `extra`.
export async function tmpdir<T = undefined>(options?: { init?: (dir: string) => Promise<T> }) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "orchestra-maestro-test-")))
  const extra = await options?.init?.(directory)
  return {
    path: directory,
    extra: extra as T,
    async [Symbol.asyncDispose]() {
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}
