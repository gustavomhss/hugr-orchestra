import { execFile } from "node:child_process"
import assert from "node:assert/strict"
import { promisify } from "node:util"

export const label = "io.orchestra.app-dock"
const exec = promisify(execFile)
export const cases = [
  "startup-invalidation",
  "authenticated-xterm",
  "console-privacy",
  "browser-boundary",
  "browser-login-bridge",
  "installed-gtk",
  "visibility",
  "owner-visibility",
  "reuse-recovery",
  "browser-popup",
  "foreign-origin",
  "persistence",
  "unrelated-view-close",
]
export type Metadata = { owner: string; containerID?: string; dockerContext: string; password: string }

export async function docker(context: string, args: string[]) {
  return exec("docker", ["--context", context, ...args], {
    timeout: 60_000,
    killSignal: "SIGKILL",
    maxBuffer: 2 * 1024 * 1024,
  })
}

export async function wait(predicate: () => Promise<boolean>, phase: string) {
  const deadline = Date.now() + 20_000
  while (!(await predicate())) {
    assert(Date.now() < deadline, `Timed out waiting for ${phase}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
