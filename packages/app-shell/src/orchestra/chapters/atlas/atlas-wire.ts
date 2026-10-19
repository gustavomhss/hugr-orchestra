import type { AtlasMemoryPr, AtlasMemoryTask, AtlasOwnPack } from "./atlas-model"
import type { AtlasSnapshot } from "./atlas-types"

// The snapshot's loosely typed wire parts (OWN-SNAPSHOT.json units, memory entries) read into the model's shapes.

type AtlasMemoryWire = AtlasSnapshot["memory"][string][number]

// OWN-SNAPSHOT.json units ({ unit, sourceBlobs, pack: OwnPackPlus }) arrive as plain JSON (`unknown` on the wire),
// so each field is read defensively; a unit with no string id is skipped.
export function ownPacks(units: readonly unknown[]): Record<string, AtlasOwnPack> {
  return Object.fromEntries(
    units.flatMap((entry) => {
      const unit = record(record(entry).unit)
      const pack = record(record(entry).pack)
      const shape = record(pack.shape)
      if (typeof unit.id !== "string") return []
      const own: AtlasOwnPack = {
        summary: text(pack.unit),
        owner: text(shape.owner),
        tier: tierOf(shape.tier),
        invariants: list(pack.invariants).map((row) => {
          const item = record(row)
          return { nodeId: text(item.nodeId), tier: tierOf(item.tier), claim: text(item.claim), freshness: text(item.freshness) }
        }),
        advisory: list(pack.advisory).length,
        dependents: list(record(pack.edges).dependents).length,
        tokenEstimate: typeof pack.tokenEstimate === "number" ? pack.tokenEstimate : 0,
        sourceFiles: Object.keys(record(record(entry).sourceBlobs)).length,
      }
      return [[unit.id, own] as const]
    }),
  )
}

export function taskOf(r: AtlasMemoryWire): AtlasMemoryTask {
  const entry = record(r.entry)
  return {
    taskId: text(entry.taskId),
    attempted: strings(entry.attempted),
    failedWith: strings(entry.failedWith),
    stoppedAt: text(entry.stoppedAt),
    lesson: r.text,
    ref: r.refs[0] ?? "",
    source: ".atlas/memory.jsonl",
  }
}

// A PR record has no title, and its knowledge delta is a list of facts, not per-unit counts: both stay empty.
export function prOf(r: AtlasMemoryWire): AtlasMemoryPr {
  const entry = record(r.entry)
  return {
    prId: text(entry.prId),
    title: "",
    decisions: strings(entry.decisions),
    reviewOutcomes: strings(entry.reviewOutcomes),
    knowledgeDelta: [],
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function strings(value: unknown) {
  return list(value).filter((item): item is string => typeof item === "string")
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

export function tierOf(value: unknown): "T0" | "T1" | "T2" {
  return value === "T0" || value === "T1" ? value : "T2"
}
