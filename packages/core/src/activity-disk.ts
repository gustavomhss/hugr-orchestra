export * as ActivityDisk from "./activity-disk"

import fs from "node:fs/promises"
import path from "node:path"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"

// Budgets are cooperative between filesystem calls, not an OS I/O timeout.
export async function measure(
  directory: string,
  limits: { maxEntries?: number; maxMs?: number; maxDepth?: number } = {},
): Promise<ActivityMonitor.DiskAttempt> {
  const startedAt = Date.now()
  const start = performance.now()
  const issues: ActivityMonitor.DiskIssue[] = []
  const canonical = await fs.realpath(directory).catch(() => undefined)
  const initial = await fs.lstat(directory).catch(() => undefined)
  const pending = [{ path: canonical ?? directory, depth: 0 }]
  let issueCount = 0
  let observedBytes = 0
  let entries = 0
  const expired = () => performance.now() - start >= (limits.maxMs ?? 2000)
  function unread(value: string, reason: ActivityMonitor.DiskIssue["reason"]) {
    issueCount++
    if (issues.length < 32) issues.push({ path: value, reason })
  }
  if (initial?.isSymbolicLink()) {
    unread(directory, "symlink")
    pending.length = 0
  }
  if (initial && !initial.isDirectory() && !initial.isSymbolicLink()) {
    unread(directory, "unsupported")
    pending.length = 0
  }
  while (pending.length) {
    if (entries >= (limits.maxEntries ?? 10_000) || expired()) {
      unread(directory, "limit")
      break
    }
    const item = pending.pop()!
    entries++
    const stat = await fs.lstat(item.path, { bigint: true }).catch(() => undefined)
    if (expired()) {
      unread(directory, "limit")
      break
    }
    if (!stat) {
      unread(item.path, "unavailable")
      continue
    }
    if (stat.isSymbolicLink()) {
      unread(item.path, "symlink")
      continue
    }
    // Reject a replaced ancestor before reading metadata through its new target.
    if ((await fs.realpath(item.path).catch(() => undefined)) !== item.path) {
      unread(item.path, "changed")
      continue
    }
    if (expired()) {
      unread(directory, "limit")
      break
    }
    if (stat.isFile()) {
      const bytes = Number(stat.size)
      if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(observedBytes + bytes)) {
        unread(item.path, "overflow")
        continue
      }
      observedBytes += bytes
      continue
    }
    if (!stat.isDirectory()) {
      unread(item.path, "unsupported")
      continue
    }
    if (item.depth >= (limits.maxDepth ?? 64)) {
      unread(item.path, "limit")
      continue
    }
    const handle = await fs.opendir(item.path).catch(() => undefined)
    if (!handle) {
      unread(item.path, "unavailable")
      continue
    }
    // Streaming enumeration bounds memory even when one directory has millions of entries.
    try {
      for await (const child of handle) {
        if (pending.length + entries >= (limits.maxEntries ?? 10_000) || expired()) {
          unread(directory, "limit")
          break
        }
        pending.push({ path: path.join(item.path, child.name), depth: item.depth + 1 })
      }
    } catch {
      unread(item.path, "unavailable")
    }
    if (expired()) {
      unread(directory, "limit")
      break
    }
    const after = await fs.lstat(item.path, { bigint: true }).catch(() => undefined)
    if (
      !after ||
      after.isSymbolicLink() ||
      after.ino !== stat.ino ||
      after.dev !== stat.dev ||
      after.mtimeNs !== stat.mtimeNs
    )
      unread(item.path, "changed")
  }
  const final = await fs.lstat(directory).catch(() => undefined)
  if (initial && (!final || final.isSymbolicLink() || final.ino !== initial.ino || final.dev !== initial.dev))
    unread(directory, "changed")
  if (expired()) unread(directory, "limit")
  return {
    startedAt,
    sampledAt: Date.now(),
    state: issueCount ? "partial" : "complete",
    observedBytes,
    entries,
    issueCount,
    issues,
  }
}

export function make(roots: readonly { id: ActivityMonitor.DiskRootID; path: string }[]) {
  const instanceID = crypto.randomUUID()
  const rows = new Map<string, ActivityMonitor.DiskRoot>(roots.map((root) => [root.id, { ...root }]))
  const inflight = new Map<string, Promise<boolean>>()
  return {
    snapshot(): ActivityMonitor.DiskSnapshot {
      return structuredClone({ instanceID, readAt: Date.now(), source: "node.fs.lstat", roots: [...rows.values()] })
    },
    read(id: string): Promise<boolean> {
      const active = inflight.get(id)
      if (active) return active
      const root = rows.get(id)
      if (!root) return Promise.resolve(false)
      const request = measure(root.path)
        .then((attempt) => {
          rows.set(id, {
            ...root,
            attempt,
            ...(attempt.state === "complete"
              ? { logical: { bytes: attempt.observedBytes, sampledAt: attempt.sampledAt } }
              : {}),
          })
          return true
        })
        .finally(() => inflight.delete(id))
      inflight.set(id, request)
      return request
    },
  }
}
