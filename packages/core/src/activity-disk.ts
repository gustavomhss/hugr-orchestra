export * as ActivityDisk from "./activity-disk"

import fs from "node:fs/promises"
import path from "node:path"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"

// Budgets are cooperative between filesystem calls, not an OS I/O timeout.
export async function measure(
  directory: string,
  limits: { maxEntries?: number; maxMs?: number; maxDepth?: number; expectedRoot?: { canonical: string; device: bigint; inode: bigint } } = {},
): Promise<ActivityMonitor.DiskAttempt> {
  const startedAt = Date.now()
  const start = performance.now()
  const issues: ActivityMonitor.DiskIssue[] = []
  const seen = new Set<string>()
  // A terminal slash or "." makes lstat follow a symlink. Keep the declared spelling for reports.
  const volume = path.parse(directory).root
  const isSeparator = process.platform === "win32"
    ? (value: string) => value === "/" || value === "\\"
    : (value: string) => value === "/"
  let end = directory.length
  while (end > volume.length && isSeparator(directory[end - 1]!)) end--
  while (
    end - volume.length >= 2 &&
    directory[end - 1] === "." &&
    end - 2 >= volume.length &&
    isSeparator(directory[end - 2]!)
  ) {
    end -= 2
    while (end > volume.length && isSeparator(directory[end - 1]!)) end--
  }
  const root = volume + directory.slice(volume.length, end)
  const initial = await fs.lstat(root, { bigint: true }).catch(() => undefined)
  const pending: { path: string; depth: number }[] = []
  let issueCount = 0
  let observedBytes = 0
  let entries = 0
  const expired = () => performance.now() - start >= (limits.maxMs ?? 2000)
  function unread(value: string, reason: ActivityMonitor.DiskIssue["reason"]) {
    const key = `${reason}\0${value}`
    if (seen.has(key)) return
    seen.add(key)
    issueCount++
    if (issues.length < 32) issues.push({ path: value, reason })
  }
  async function queueRoot() {
    if (!initial) return unread(directory, "unavailable")
    if (limits.expectedRoot && (initial.dev !== limits.expectedRoot.device || initial.ino !== limits.expectedRoot.inode))
      return unread(directory, "changed")
    if (initial.isSymbolicLink()) return unread(directory, "symlink")
    if (!initial.isDirectory()) return unread(directory, "unsupported")

    const canonical = await fs.realpath(root).catch(() => undefined)
    const verified =
      canonical === undefined ? undefined : await fs.lstat(canonical, { bigint: true }).catch(() => undefined)
    if (
      canonical === undefined ||
      (limits.expectedRoot !== undefined && canonical !== limits.expectedRoot.canonical) ||
      !verified?.isDirectory() ||
      verified.dev !== initial.dev ||
      verified.ino !== initial.ino
    )
      return unread(directory, "changed")
    pending.push({ path: canonical, depth: 0 })
  }

  await queueRoot()
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
    if (item.depth === 0 && (stat.ino !== initial?.ino || stat.dev !== initial?.dev)) {
      unread(directory, "changed")
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
    // Delay admission until the directory identity is rechecked below.
    const firstChild = pending.length
    const names = new Set<string>()
    try {
      for await (const child of handle) {
        if (pending.length + entries >= (limits.maxEntries ?? 10_000) || expired()) {
          unread(directory, "limit")
          break
        }
        if (names.has(child.name)) {
          // Invalid UTF-8 names can decode to the same string as another entry.
          unread(item.path, "unavailable")
          continue
        }
        names.add(child.name)
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
    ) {
      pending.length = firstChild
      unread(item.path, "changed")
    }
  }
  if (initial?.isDirectory()) {
    const final = await fs.lstat(root, { bigint: true }).catch(() => undefined)
    if (!final?.isDirectory() || final.ino !== initial.ino || final.dev !== initial.dev) unread(directory, "changed")
  }
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
