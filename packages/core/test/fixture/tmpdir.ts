import fs from "fs/promises"
import { tmpdir as osTmpdir } from "os"
import path from "path"

export const tmpdir = async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(osTmpdir(), "orchestra-core-test-")))
  return {
    path: dir,
    async [Symbol.asyncDispose]() {
      await remove(dir)
    },
  }
}

async function remove(dir: string, retries = 30): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch (error) {
    if (retries === 0 || !error || typeof error !== "object" || !("code" in error) || error.code !== "EBUSY")
      throw error
    Bun.gc(true)
    await Bun.sleep(100)
    return remove(dir, retries - 1)
  }
}

/**
 * Removes a fixture root holding executables the test just ran. On GitHub's Windows runners, provjobd.exe<n> (started
 * from %TEMP% by GitHub's hosted-compute-agent, outside the test's process tree) opens each newly run image for a moment
 * after its process exits, so deleting it fails with EBUSY. Restart Manager named it as the only holder in all 11 holds
 * caught (10 in 1,704 runs of a fresh node.exe copy, 1 in a whole core run); each released within 152 ms. Only EBUSY is
 * retried, for at most 5 s: any other failure, or a holder that outlasts the bound, still fails the test.
 */
export async function removeExecuted(dir: string) {
  const deadline = performance.now() + 5_000
  for (;;) {
    const error = await fs.rm(dir, { recursive: true, force: true }).then(() => undefined, (error: unknown) => error)
    if (error === undefined) return
    if (performance.now() >= deadline || !error || typeof error !== "object" || !("code" in error) || error.code !== "EBUSY")
      throw error
    await Bun.sleep(25)
  }
}
