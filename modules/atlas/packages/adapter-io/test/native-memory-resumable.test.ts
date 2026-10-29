// @atlas/adapter-io — test/native-memory-resumable.test.ts  (R5 / B-R5-01)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNativeMemory } from "../src/native-memory.js"
import type { AtlasBinding } from "../src/native-memory.js"
import { createDurableMemory } from "../src/memory-store.js"
import { legacyLogPath } from "../src/layout.js"
import type { MemoryRecord, TaskMemoryEntry, PrMemoryEntry } from "@atlas/memory"

let root: string
let bin: string

const taskEntry = (taskId: string, tag: string): TaskMemoryEntry => ({
  taskId,
  attempted: [`a-${tag}`],
  failedWith: [`f-${tag}`],
  stoppedAt: `s-${tag}`,
  lesson: `l-${tag}`,
})
const prEntry = (prId: string, tag = "x"): PrMemoryEntry => ({
  prId,
  decisions: [`d-${tag}`],
  reviewOutcomes: [`r-${tag}`],
  knowledgeDelta: [{ id: `k-${tag}` } as never],
  ref: `pr-ref-${tag}`,
})

function scanner(name: string, exit: number): string {
  const path = join(bin, name)
  writeFileSync(path, `#!/bin/sh\n/bin/cat >/dev/null\nexit ${exit}\n`)
  chmodSync(path, 0o755)
  return path
}

function binding(over: Partial<AtlasBinding> = {}): AtlasBinding {
  return {
    storage: { projectID: "proj", root },
    source: { worktree: root, revision: "deadbeef" },
    memoryOwner: "backend",
    execution: { actor: { memberId: "backend", projectId: "proj", sessionId: "ses_1" }, executionSessionID: "ses_1" },
    scanner: { name: "gitleaks", command: scanner("clean-gitleaks", 0) },
    ...over,
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-native-"))
  bin = mkdtempSync(join(tmpdir(), "atlas-native-bin-"))
  vi.stubEnv("PATH", "")
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
  rmSync(bin, { recursive: true, force: true })
})

describe("listResumable", () => {
  it("lists the owner's own task checkpoints, skipping PRs and foreign owners, in file order", () => {
    const mem = createNativeMemory(binding())
    const w1 = mem.write(taskEntry("T1", "a"))
    if (!w1.ok) throw new Error(w1.reason)
    const w2 = mem.write(taskEntry("T2", "b"))
    if (!w2.ok) throw new Error(w2.reason)
    mem.write(prEntry("P1"))
    createDurableMemory(root).append({ owner: "mallory", kind: "task", entry: taskEntry("T9", "m") } as MemoryRecord)
    const list = mem.listResumable()
    expect(list).toEqual({
      store: "complete",
      records: [
        { ref: w1.ref, taskId: "T1", stoppedAt: "s-a", lesson: "l-a" },
        { ref: w2.ref, taskId: "T2", stoppedAt: "s-b", lesson: "l-b" },
      ],
    })
  })

  it("folds an identical resubmission to a single record", () => {
    const mem = createNativeMemory(binding())
    mem.write(taskEntry("T1", "x"))
    mem.write(taskEntry("T1", "x"))
    const list = mem.listResumable()
    expect(list.records).toHaveLength(1)
  })

  it("lists a legacy owner's task checkpoint", () => {
    createDurableMemory(root).append({ owner: "former", kind: "task", entry: taskEntry("T3", "f") } as MemoryRecord)
    const mem = createNativeMemory(binding({ legacyOwners: ["former"] }))
    const list = mem.listResumable()
    expect(list.records[0]?.taskId).toBe("T3")
  })

  it("is partial when the log is torn, still listing what verified", () => {
    const mem = createNativeMemory(binding())
    mem.write(taskEntry("T1", "x"))
    appendFileSync(legacyLogPath(root, "memory"), '{"id":"torn","payload":\n')
    const list = mem.listResumable()
    expect(list.store).toBe("partial")
    expect(list.records).toHaveLength(1)
  })

  it("is unavailable with an empty list when the log cannot be read", () => {
    mkdirSync(legacyLogPath(root, "memory"), { recursive: true })
    const mem = createNativeMemory(binding())
    const list = mem.listResumable()
    expect(list).toEqual({ records: [], store: "unavailable" })
  })

  it("is complete and empty on an empty store", () => {
    const mem = createNativeMemory(binding())
    const list = mem.listResumable()
    expect(list).toEqual({ records: [], store: "complete" })
  })
})
