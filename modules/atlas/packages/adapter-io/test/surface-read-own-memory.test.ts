// @atlas/adapter-io — test/surface-read-own-memory.test.ts  (the Atlas UI surface: D3b's Own, Memory, territories)
//
// Own: this repository's own committed `OWN-SNAPSHOT.json` and `.orchestra/skills/own/` tree, copied into a temp
// root, then a malformed snapshot. Memory and orientation: records appended through the real durable stores.
// Territories: a hand-written catalog, then a refused one.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import type { MemoryRecord } from "@atlas/memory"
import { createDurableMemory } from "../src/memory-store.js"
import { createDurableOrientation } from "../src/orientation-store.js"
import { readMemory, readOrientation, readOwn, readTerritories } from "../src/surface/read-own-memory.js"

/** modules/atlas — the tree whose committed Own files the first case copies. */
const ATLAS_ROOT = fileURLToPath(new URL("../../../", import.meta.url))

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-surface-own-"))
  dirs.push(dir)
  mkdirSync(join(dir, ".atlas"), { recursive: true })
  return dir
}

describe("surface read-own-memory — the committed Own snapshot", () => {
  it("reads a committed snapshot, its coverage and every published skill's first 4 KB", () => {
    const dir = tempRepo()
    cpSync(join(ATLAS_ROOT, "OWN-SNAPSHOT.json"), join(dir, "OWN-SNAPSHOT.json"))
    cpSync(join(ATLAS_ROOT, ".orchestra"), join(dir, ".orchestra"), { recursive: true })
    const committed = JSON.parse(readFileSync(join(dir, "OWN-SNAPSHOT.json"), "utf8")) as {
      snapshot: string
      sourceRevision: string
      units: unknown[]
    }
    const skill = ".orchestra/skills/own/cGFja2FnZXMvZ2VuZXNpcw/SKILL.md"
    const bytes = readFileSync(join(dir, skill))
    const own = readOwn(dir)
    expect(own?.status).toBe("READY")
    expect(own?.reason).toBeNull()
    expect(own?.snapshot).toBe(committed.snapshot)
    expect(own?.sourceRevision).toBe(committed.sourceRevision)
    expect(own?.units.length).toBe(committed.units.length)
    expect(own?.coverage?.units).toEqual(["packages/genesis"])
    expect(own?.skills).toEqual([{ path: skill, size: bytes.length, head: bytes.subarray(0, 4096).toString("utf8") }])
  })

  it("answers HOLD for a snapshot that does not parse, and null when there is none", () => {
    const dir = tempRepo()
    expect(readOwn(dir)).toBeNull()
    writeFileSync(join(dir, "OWN-SNAPSHOT.json"), "{}")
    expect(readOwn(dir)).toEqual({
      status: "HOLD",
      reason: "snapshot-invalid",
      snapshot: null,
      sourceRevision: null,
      sourcePaths: [],
      units: [],
      coverage: null,
      skills: [],
    })
  })
})

describe("surface read-own-memory — memory, orientation and territories", () => {
  it("groups memory records by member, in log order, with each kind's display fields", () => {
    const dir = tempRepo()
    const store = createDurableMemory(dir)
    const records: MemoryRecord[] = [
      { owner: "backend", kind: "project", entry: { rule: "Always run the gate.", scope: "packages/x", grounding: "PR#1", frecency: 1 } },
      { owner: "jimmy", kind: "task", entry: { taskId: "t1", attempted: [], failedWith: [], stoppedAt: "phase 2", lesson: "Read the brief." } },
      { owner: "backend", kind: "pr", entry: { prId: "7", decisions: ["a", "b"], reviewOutcomes: [], knowledgeDelta: [] } },
    ]
    records.forEach((record) => store.append(record))
    const memory = readMemory(dir)
    expect(Object.keys(memory).sort()).toEqual(["backend", "jimmy"])
    expect(memory.backend?.map((r) => [r.kind, r.text, r.scope, r.at, r.refs])).toEqual([
      ["project", "Always run the gate.", "packages/x", null, ["PR#1"]],
      ["pr", "a; b", null, null, []],
    ])
    expect(memory.jimmy?.map((r) => [r.kind, r.text, r.member, r.entry])).toEqual([["task", "Read the brief.", "jimmy", records[1]?.entry]])
    expect(memory.backend?.every((r) => r.eventId.length > 0)).toBe(true)
  })

  it("reads orientation events in log order, and empty logs as empty", () => {
    const dir = tempRepo()
    expect(readMemory(dir)).toEqual({})
    expect(readOrientation(dir)).toEqual([])
    const log = createDurableOrientation(dir)
    log.append("milestone", "M1 shipped")
    log.append("state", "green")
    expect(readOrientation(dir).map((e) => [e.channel, e.label, e.supersedes])).toEqual([
      ["milestone", "M1 shipped", []],
      ["state", "green", []],
    ])
  })

  it("reads the territory catalog, and answers [] for an absent or refused one", () => {
    const dir = tempRepo()
    expect(readTerritories(dir)).toEqual([])
    const territory = { name: "billing", owner: "backend", tier: "T1", globs: ["src/**"] }
    writeFileSync(join(dir, "TERRITORY-CATALOG.json"), JSON.stringify({ projectId: "p", catalogVersion: "v", territories: [territory] }))
    expect(readTerritories(dir)).toEqual([territory])
    writeFileSync(join(dir, "TERRITORY-CATALOG.json"), JSON.stringify({ projectId: "p", catalogVersion: "v", territories: [{ ...territory, tier: "BAD" }] }))
    expect(readTerritories(dir)).toEqual([])
  })
})
