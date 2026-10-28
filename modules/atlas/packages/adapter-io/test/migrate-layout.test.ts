// @atlas/adapter-io — test/migrate-layout.test.ts  (the one-shot move of the single-file logs into the `.atlas/` tree)
//
// The legacy files are built from lines the real stores wrote, moved back to the old paths, so the test checks the
// migration against the exact bytes an older checkout committed.

import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { MemoryEntry } from "@atlas/memory"
import { legacyLogPath, memberMemoryPath, membersDir, projectLogPath } from "../src/layout.js"
import { createDurableMemory } from "../src/memory-store.js"
import { migrateLayout } from "../src/migrate-layout.js"
import { createDurableOrientation } from "../src/orientation-store.js"
import { appendReview, readReview } from "../src/review-log.js"

const rule = (text: string): MemoryEntry => ({ rule: text, scope: "*", frecency: 1 })
const task = (taskId: string): MemoryEntry => ({ taskId, attempted: ["a"], failedWith: [], stoppedAt: "s", lesson: "l" })

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-migrate-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

/** Write through the stores, then fold every member file back into the single legacy memory file. */
function seedLegacy(): void {
  const memory = createDurableMemory(repo)
  memory.append({ owner: "backend", kind: "project", entry: rule("one") })
  memory.append({ owner: "backend", kind: "task", entry: task("T1") })
  memory.append({ owner: "frontend", kind: "project", entry: rule("two") })
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    )
  files(membersDir(repo))
    .sort()
    .forEach((file) => appendFileSync(legacyLogPath(repo, "memory"), readFileSync(file)))
  rmSync(membersDir(repo), { recursive: true })

  createDurableOrientation(repo).append("milestone", "W1 landed")
  renameSync(projectLogPath(repo, "orientation"), legacyLogPath(repo, "orientation"))
  appendReview(repo, { kind: "hold", nodeKey: "nk-a", at: "2026-10-18T10:00:00.000Z", by: "alice" })
  renameSync(projectLogPath(repo, "review"), legacyLogPath(repo, "review"))
}

describe("migrateLayout", () => {
  it("splits memory by seat and kind and moves orientation and review, keeping every id", () => {
    seedLegacy()
    const before = {
      memory: [...createDurableMemory(repo).read().log.keys()].sort(),
      orientation: createDurableOrientation(repo).orientation(),
      review: readReview(repo).records,
    }

    expect(migrateLayout(repo)).toEqual({ memory: 3, orientation: 1, review: 1, kept: 0 })

    expect(existsSync(legacyLogPath(repo, "memory"))).toBe(false)
    expect(existsSync(legacyLogPath(repo, "orientation"))).toBe(false)
    expect(existsSync(legacyLogPath(repo, "review"))).toBe(false)
    expect(existsSync(memberMemoryPath(repo, { owner: "backend", kind: "project", entry: rule("one") }))).toBe(true)
    expect(existsSync(memberMemoryPath(repo, { owner: "backend", kind: "task", entry: task("T1") }))).toBe(true)
    expect(existsSync(memberMemoryPath(repo, { owner: "frontend", kind: "project", entry: rule("two") }))).toBe(true)

    const read = createDurableMemory(repo).read()
    expect(read.rejected).toBe(0)
    expect([...read.log.keys()].sort()).toEqual(before.memory)
    expect(createDurableOrientation(repo).orientation()).toEqual(before.orientation)
    expect(readReview(repo).records).toEqual(before.review)
  })

  it("keeps a memory line that names no owner and kind in the legacy file, still counted as rejected", () => {
    seedLegacy()
    appendFileSync(legacyLogPath(repo, "memory"), '{"torn":\n')

    expect(migrateLayout(repo).kept).toBe(1)
    expect(readFileSync(legacyLogPath(repo, "memory"), "utf8")).toBe('{"torn":\n')
    expect(createDurableMemory(repo).read().rejected).toBe(1)
  })

  it("is a no-op on a repository with nothing to move, and on a second run", () => {
    expect(migrateLayout(repo)).toEqual({ memory: 0, orientation: 0, review: 0, kept: 0 })
    seedLegacy()
    migrateLayout(repo)
    const ids = [...createDurableMemory(repo).read().log.keys()].sort()
    expect(migrateLayout(repo)).toEqual({ memory: 0, orientation: 0, review: 0, kept: 0 })
    expect([...createDurableMemory(repo).read().log.keys()].sort()).toEqual(ids)
  })
})
