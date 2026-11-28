export * as ActivityObjectCwd from "./activity-object-cwd"

import { lstat, opendir, stat } from "node:fs/promises"
import path from "node:path"
import type { ActivityObjectProof } from "./activity-object-proof"

export async function readCwd(input: {
  objectID: string
  directory: string
  procRoot?: string
  maxProcesses?: number
}): Promise<ActivityObjectProof.Check> {
  const result = (outcome: ActivityObjectProof.Check["outcome"]): ActivityObjectProof.Check => ({
    objectID: input.objectID,
    method: "cwd",
    outcome,
  })
  if (process.platform !== "linux") return result("unavailable")
  if (!input.objectID || !path.isAbsolute(input.directory)) return result("failed")
  const initial = await lstat(input.directory, { bigint: true }).catch(() => undefined)
  if (!initial?.isDirectory()) return result("failed")
  const procRoot = input.procRoot ?? "/proc"
  const proc = await opendir(procRoot).catch(() => undefined)
  if (!proc) return result("unavailable")
  const max = input.maxProcesses !== undefined && Number.isFinite(input.maxProcesses)
    ? Math.max(0, Math.min(512, Math.floor(input.maxProcesses)))
    : 512
  const deadline = performance.now() + 500
  let count = 0
  let started = false
  try {
    for await (const entry of proc) {
      started = true
      if (!/^\d+$/.test(entry.name)) continue
      if (count >= max || performance.now() >= deadline) return result("partial")
      count++
      const cwd = await stat(path.join(procRoot, entry.name, "cwd"), { bigint: true }).catch(() => undefined)
      if (!cwd || cwd.dev !== initial.dev || cwd.ino !== initial.ino) continue
      const current = await lstat(input.directory, { bigint: true }).catch(() => undefined)
      if (!current?.isDirectory() || current.dev !== initial.dev || current.ino !== initial.ino) return result("failed")
      return result("holder")
    }
  } catch {
    return result(started ? "partial" : "unavailable")
  }
  return result("partial")
}
