// @atlas/adapter-io — src/migrate-layout.ts  (the one-shot move of the single-file logs into the `.atlas/` tree)
//
// `.atlas/memory.jsonl` splits by each record's owner and kind into `members/<seat>/memory/**`;
// `.atlas/orientation.jsonl` and `.atlas/review.jsonl` move unchanged to `project/`. Lines are copied as their
// original bytes, so every event keeps its id. The stores already read the legacy files first, so running this is
// never required for correctness: it only stops new branches from touching the old shared files.
//
// A crash part way leaves some lines in both places, which the content-keyed fold reads once. A memory line that
// names no owner and kind (a torn or hand-edited line) has no file to go to: it stays in the legacy file, which is
// rewritten with only those lines, so the stores still count it as rejected.
//
// The local projection (`.atlas/cas`, untracked) is also EXPORTED: each current row not yet in the knowledge logs is
// appended, with its CAS bytes, under the seat the policy names as the row's scope's only actor, else `maestro`. A
// clone replays these lines under the replay trust rule (`knowledge-replay.ts`), so exporting grants nothing.

import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Hash } from "@atlas/contracts"
import type { MemoryRecord } from "@atlas/memory"
import { appendKnowledge, readKnowledge } from "./knowledge-log.js"
import { legacyLogPath, memberMemoryPath, projectLogPath } from "./layout.js"
import { CAS_REL } from "./okf-store.js"
import { loadPolicy } from "./policy.js"
import { headSha } from "./run-git.js"
import { createDiskStore, rehydrateProjection } from "./store.js"
import { gitSidecarTrust } from "./store-provenance.js"

/** How many lines each legacy log moved, how many memory lines stayed because they name no owner and kind, and how
 *  many projection rows were exported to the knowledge logs. */
export interface LayoutMigration {
  readonly memory: number
  readonly orientation: number
  readonly review: number
  readonly kept: number
  readonly knowledge: number
}

export function migrateLayout(repoPath: string): LayoutMigration {
  const memory = migrateMemory(repoPath)
  return {
    memory: memory.moved,
    orientation: moveWhole(legacyLogPath(repoPath, "orientation"), projectLogPath(repoPath, "orientation")),
    review: moveWhole(legacyLogPath(repoPath, "review"), projectLogPath(repoPath, "review")),
    kept: memory.kept,
    knowledge: exportKnowledge(repoPath),
  }
}

function exportKnowledge(repoPath: string): number {
  const disk = createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), gitSidecarTrust(repoPath))
  const logged = readKnowledge(repoPath).rows
  const scopes = loadPolicy(repoPath).authz.scopes
  const at = new Date().toISOString()
  const rows = [...rehydrateProjection(disk).current.values()].filter(
    (row) => JSON.stringify(logged.get(row.nodeKey)?.row) !== JSON.stringify(row),
  )
  rows.forEach((row) => {
    const actors = row.scope !== undefined && Object.prototype.hasOwnProperty.call(scopes, row.scope) ? scopes[row.scope] : undefined
    const seat = actors?.length === 1 && actors[0] !== undefined ? actors[0] : "maestro"
    appendKnowledge(repoPath, { seat, row, at, source: { migrated: true } }, disk.get(row.contentHash as Hash))
  })
  return rows.length
}

function migrateMemory(repoPath: string): { readonly moved: number; readonly kept: number } {
  const legacy = legacyLogPath(repoPath, "memory")
  const lines = readLines(legacy)
  if (lines === undefined) return { moved: 0, kept: 0 }
  const routed = lines.map((line) => ({ line, target: memoryTarget(repoPath, line) }))
  routed.forEach((r) => r.target !== undefined && appendLine(r.target, r.line))
  const kept = routed.filter((r) => r.target === undefined).map((r) => r.line)
  if (kept.length === 0) rmSync(legacy)
  if (kept.length > 0) writeFileSync(legacy, kept.map((line) => `${line}\n`).join(""))
  return { moved: lines.length - kept.length, kept: kept.length }
}

function moveWhole(legacy: string, target: string): number {
  const lines = readLines(legacy)
  if (lines === undefined) return 0
  lines.forEach((line) => appendLine(target, line))
  rmSync(legacy)
  return lines.length
}

/** The legacy file's non-empty lines, or `undefined` when it does not exist. Any other read error throws. */
function readLines(path: string): readonly string[] | undefined {
  const text = (() => {
    try {
      return readFileSync(path, "utf8")
    } catch (e) {
      if ((e as { code?: unknown } | null)?.code === "ENOENT") return undefined
      throw e
    }
  })()
  return text?.split("\n").filter((line) => line.trim().length > 0)
}

function memoryTarget(repoPath: string, line: string): string | undefined {
  const record = (() => {
    try {
      return (JSON.parse(line) as { payload?: unknown } | null)?.payload
    } catch {
      return undefined
    }
  })() as Partial<MemoryRecord> | undefined
  if (typeof record?.owner !== "string" || typeof record.kind !== "string" || record.entry === undefined) return undefined
  if (record.kind === "task" && typeof (record.entry as { taskId?: unknown }).taskId !== "string") return undefined
  if (record.kind === "pr" && typeof (record.entry as { prId?: unknown }).prId !== "string") return undefined
  return memberMemoryPath(repoPath, record as MemoryRecord)
}

function appendLine(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${line}\n`)
}
