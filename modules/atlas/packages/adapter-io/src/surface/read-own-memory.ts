// @atlas/adapter-io — src/surface/read-own-memory.ts  (the Atlas UI surface: committed Own, Memory and territories)
//
// The snapshot keys lead decision D3b adds: `own`, `memory`, `orientation` and `territories`.
//   own          — `OWN-SNAPSHOT.json` through `parseOwnSnapshot`, `.orchestra/skills/own/OWN-COVERAGE.json` through
//                  `parseStaticOwnCoverage` (both `@atlas/retrieval`, the parsers Orchestra's own read relies on),
//                  and the first 4 KB of every published `SKILL.md`. Read from the repository root, where
//                  Orchestra's Atlas source reads them.
//   memory       — `.atlas/memory.jsonl` through the durable memory store (`../memory-store.ts`), grouped by member.
//   orientation  — `.atlas/orientation.jsonl` through the durable orientation store (`../orientation-store.ts`).
//   territories  — `TERRITORY-CATALOG.json` through `parseTerritoryCatalog` (`@atlas/index`).
//
// TOTAL: an absent or malformed file reads as null / {} / [] as each field documents, never a throw. Nothing here
// verifies the committed Own bytes against the source tree; that check stays Orchestra's, at the moment it serves them.

import { readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"
import { parseTerritoryCatalog } from "@atlas/index"
import type { MemoryRecord, Ref } from "@atlas/memory"
import { OWN_ARTIFACT_ROOT, OWN_COVERAGE_PATH, OWN_SNAPSHOT_PATH, parseOwnSnapshot, parseStaticOwnCoverage } from "@atlas/retrieval"
import { createDurableMemory } from "../memory-store.js"
import { createDurableOrientation } from "../orientation-store.js"
import type { AtlasMemoryRecord, AtlasOrientationEvent, AtlasOwnSkill, AtlasOwnSnapshot, AtlasTerritory } from "./types-memory.js"

const SKILL_FILE = "SKILL.md"
const SKILL_HEAD_BYTES = 4096
const TERRITORY_CATALOG = "TERRITORY-CATALOG.json"

/** The committed Own snapshot; null when `OWN-SNAPSHOT.json` is absent. */
export function readOwn(repoPath: string): AtlasOwnSnapshot | null {
  const content = readText(join(repoPath, OWN_SNAPSHOT_PATH))
  if (content === undefined) return null
  const parsed = parseOwnSnapshot(content)
  const coverageText = readText(join(repoPath, OWN_COVERAGE_PATH))
  const coverage = coverageText === undefined ? undefined : parseStaticOwnCoverage(coverageText)
  return {
    status: parsed === undefined ? "HOLD" : "READY",
    reason: parsed === undefined ? "snapshot-invalid" : null,
    snapshot: parsed?.snapshot ?? null,
    sourceRevision: parsed?.sourceRevision ?? null,
    sourcePaths: [...new Set((parsed?.units ?? []).flatMap((entry) => Object.keys(entry.sourceBlobs)))].sort(),
    units: parsed?.units ?? [],
    coverage:
      coverage === undefined
        ? null
        : { snapshot: coverage.snapshot, sourceRevision: coverage.sourceRevision, units: coverage.units },
    skills: readSkills(repoPath),
  }
}

/** `.atlas/memory.jsonl` records grouped by member, each group in log order. */
export function readMemory(repoPath: string): Readonly<Record<string, readonly AtlasMemoryRecord[]>> {
  const records = [...createDurableMemory(repoPath).read().log.values()].flatMap((event) => {
    const record = memoryRecord(event.payload)
    return record === undefined ? [] : [{ ...display(record), eventId: String(event.id), seq: event.seq }]
  })
  return records.reduce<Record<string, AtlasMemoryRecord[]>>(
    (groups, record) => ({ ...groups, [record.member]: [...(groups[record.member] ?? []), record] }),
    {},
  )
}

/** `.atlas/orientation.jsonl` events in log order. */
export function readOrientation(repoPath: string): readonly AtlasOrientationEvent[] {
  return [...createDurableOrientation(repoPath).read().log.values()].map((event) => {
    const payload = isRecord(event.payload) ? event.payload : {}
    return {
      eventId: String(event.id),
      seq: event.seq,
      channel: typeof payload.channel === "string" ? payload.channel : "",
      label: typeof payload.label === "string" ? payload.label : "",
      supersedes: event.supersedes.map(String),
    }
  })
}

/** `TERRITORY-CATALOG.json` territories; [] when the file is absent or `parseTerritoryCatalog` refuses it. */
export function readTerritories(repoPath: string): readonly AtlasTerritory[] {
  const content = readText(join(repoPath, TERRITORY_CATALOG))
  if (content === undefined) return []
  try {
    return parseTerritoryCatalog(JSON.parse(content) as unknown).territories.map((territory) => ({
      name: territory.name,
      owner: territory.owner,
      tier: territory.tier,
      globs: [...territory.globs],
    }))
  } catch {
    return []
  }
}

/** The display fields of one record, by kind (see `AtlasMemoryRecord`). */
function display(record: MemoryRecord): Omit<AtlasMemoryRecord, "eventId" | "seq"> {
  const base = { member: record.owner, kind: record.kind, entry: record.entry, scope: null, at: null }
  const entry = record.entry
  if ("rule" in entry) return { ...base, text: entry.rule, scope: entry.scope, refs: refList([entry.grounding]) }
  if ("lesson" in entry) return { ...base, text: entry.lesson, refs: refList([entry.ref]) }
  if ("shipped" in entry) return { ...base, text: entry.shipped, at: entry.at, refs: refList(entry.links) }
  return { ...base, text: entry.decisions.join("; "), refs: refList([entry.ref]) }
}

function refList(refs: readonly (Ref | undefined)[]): readonly string[] {
  return refs.flatMap((ref) => {
    if (ref === undefined) return []
    return [typeof ref === "string" ? ref : `${ref.qualifiedPath}@${ref.subtreeHash}`]
  })
}

/** A log payload shaped like a `MemoryRecord`; the store's own fold casts it, this guards it first. */
function memoryRecord(payload: unknown): MemoryRecord | undefined {
  if (!isRecord(payload) || typeof payload.owner !== "string" || typeof payload.kind !== "string") return undefined
  return isRecord(payload.entry) ? (payload as unknown as MemoryRecord) : undefined
}

function readSkills(repoPath: string): readonly AtlasOwnSkill[] {
  const root = join(repoPath, OWN_ARTIFACT_ROOT)
  return listTree(root)
    .filter((rel) => rel.split(sep).at(-1) === SKILL_FILE)
    .map((rel) => `${OWN_ARTIFACT_ROOT}/${rel.split(sep).join("/")}`)
    .sort()
    .flatMap((path) => {
      const bytes = readBytes(join(repoPath, path))
      return bytes === undefined ? [] : [{ path, size: bytes.length, head: bytes.subarray(0, SKILL_HEAD_BYTES).toString("utf8") }]
    })
}

function listTree(dir: string): readonly string[] {
  try {
    return readdirSync(dir, { recursive: true, encoding: "utf8" })
  } catch {
    return []
  }
}

function readBytes(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}

function readText(path: string): string | undefined {
  return readBytes(path)?.toString("utf8")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
