import { materializeStaticOwn } from "./own-artifact.js"
import { materializeStaticOwnCoverage, OWN_COVERAGE_PATH } from "./own-coverage.js"
import type { StaticOwnFile, StaticOwnInput } from "./own-artifact.js"
import type { OwnPackPlus } from "./own-model.js"
import type { OwnUnit } from "./types.js"

export const OWN_SNAPSHOT_SCHEMA = 1
export const OWN_SNAPSHOT_PATH = "OWN-SNAPSHOT.json"

export interface OwnSnapshotUnit {
  readonly unit: OwnUnit
  readonly sourceBlobs: Readonly<Record<string, string>>
  readonly pack: OwnPackPlus
}

export interface OwnSnapshot {
  readonly schemaVersion: typeof OWN_SNAPSHOT_SCHEMA
  readonly snapshot: string
  readonly sourceRevision: string
  readonly units: readonly OwnSnapshotUnit[]
}

export interface OwnSnapshotExport {
  readonly snapshot: string
  readonly sourceRevision: string
  readonly units: readonly OwnSnapshotUnit[]
}

export interface StaticOwnSnapshot {
  readonly skills: readonly StaticOwnFile[]
  readonly coverage: StaticOwnFile
}

export type OwnSnapshotVerification =
  | { readonly status: "READY" }
  | { readonly status: "HOLD"; readonly issues: readonly string[] }

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isBlob(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
}

function isPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.split("/").some((part) => part === "" || part === "." || part === "..")
  )
}

function isFreshness(value: unknown): boolean {
  return value === "FRESH" || value === "DRIFTED" || value === "STALE"
}

function isPackInvariant(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.nodeId === "string" &&
    typeof value.claim === "string" &&
    ["T0", "T1", "T2"].includes(String(value.tier)) &&
    isFreshness(value.freshness)
  )
}

function isFact(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !["T0", "T1", "T2"].includes(String(value.tier)) ||
    !isFreshness(value.freshness)
  )
    return false
  if (value.kind === "advisory") return typeof value.claimNorm === "string"
  if (value.kind === "predicate")
    return isRecord(value.check) && (typeof value.check.expr === "string" || typeof value.check.query === "string")
  return ["relation", "negation", "transition", "test-vacuity"].includes(String(value.kind))
}

function isUnit(value: unknown): value is OwnUnit {
  return (
    isRecord(value) &&
    ["crate", "module", "service", "feature"].includes(String(value.level)) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    "grounding" in value
  )
}

function isPack(value: unknown): value is OwnPackPlus {
  if (
    !isRecord(value) ||
    typeof value.unit !== "string" ||
    !isRecord(value.shape) ||
    !isRecord(value.edges) ||
    !isRecord(value.drill) ||
    !isRecord(value.manifest)
  )
    return false
  const arrays = ["invariants", "gotchas", "advisory", "pullReachable"] as const
  if (!arrays.every((key) => Array.isArray(value[key]))) return false
  const invariants = value.invariants as unknown[]
  const advisory = value.advisory as unknown[]
  const gotchas = value.gotchas as unknown[]
  if (
    invariants.length + advisory.length + gotchas.length === 0 ||
    !invariants.every(isPackInvariant) ||
    !advisory.every(isPackInvariant) ||
    !gotchas.every(isFact)
  )
    return false
  return (
    Array.isArray(value.shape.contents) &&
    value.shape.contents.every((node) => typeof node === "string") &&
    typeof value.shape.owner === "string" &&
    ["T0", "T1", "T2"].includes(String(value.shape.tier)) &&
    Array.isArray(value.edges.dependents) &&
    value.edges.dependents.every((node) => typeof node === "string") &&
    Array.isArray(value.edges.dependencies) &&
    value.edges.dependencies.every((node) => typeof node === "string") &&
    Array.isArray(value.drill.finer) &&
    value.drill.finer.every(isUnit) &&
    isRecord(value.drill.refresh) &&
    typeof value.drill.refresh.pull === "string" &&
    isRecord(value.drill.complement) &&
    typeof value.drill.complement.pull === "string" &&
    typeof value.grounding === "object" &&
    value.grounding !== null &&
    ["tree", "manifest", "goal"].includes(String((value.grounding as Record<string, unknown>).source)) &&
    typeof value.tokenEstimate === "number" &&
    Array.isArray(value.manifest.pointers) &&
    typeof value.manifest.truncated === "boolean" &&
    (value.pullReachable as unknown[]).every((node) => typeof node === "string") &&
    typeof value.advisoryDropped === "number"
  )
}

function isSnapshotUnit(value: unknown): value is OwnSnapshotUnit {
  if (!isRecord(value) || !isUnit(value.unit) || !isPack(value.pack) || !isRecord(value.sourceBlobs)) return false
  const blobs = Object.entries(value.sourceBlobs)
  return blobs.length > 0 && blobs.every(([path, blob]) => isPath(path) && isBlob(blob))
}

/** Parse persisted Genesis oracle. Empty or ambiguous coverage never becomes a valid snapshot. */
export function parseOwnSnapshot(content: string): OwnSnapshot | undefined {
  try {
    const value = JSON.parse(content) as unknown
    if (
      !isRecord(value) ||
      value.schemaVersion !== OWN_SNAPSHOT_SCHEMA ||
      typeof value.snapshot !== "string" ||
      value.snapshot.length === 0 ||
      !isBlob(value.sourceRevision) ||
      !Array.isArray(value.units) ||
      value.units.length === 0 ||
      !value.units.every(isSnapshotUnit)
    )
      return undefined
    const ids = value.units.map((unit) => unit.unit.id)
    if (new Set(ids).size !== ids.length) return undefined
    return value as unknown as OwnSnapshot
  } catch {
    return undefined
  }
}

/** Build persisted oracle only from already-reviewed, freshly composed Own packs. Candidate staging is not input. */
export function exportOwnSnapshot(input: OwnSnapshotExport): OwnSnapshot {
  const snapshot: OwnSnapshot = { schemaVersion: OWN_SNAPSHOT_SCHEMA, ...input }
  if (parseOwnSnapshot(JSON.stringify(snapshot)) === undefined) {
    throw new Error("Own snapshot export requires non-empty, unique units with fresh packs and source blobs")
  }
  if (
    snapshot.units.some(
      (entry) =>
        entry.pack.invariants.some((fact) => fact.freshness !== "FRESH") ||
        entry.pack.advisory.some((fact) => fact.freshness !== "FRESH") ||
        entry.pack.gotchas.some((fact) => fact.freshness !== "FRESH"),
    )
  ) {
    throw new Error("Own snapshot export requires fresh reviewed packs")
  }
  return snapshot
}

/** Deterministic static Own projection. Snapshot is oracle; receipts are only output evidence. */
export function materializeStaticOwnSnapshot(snapshot: OwnSnapshot): StaticOwnSnapshot {
  const expected = snapshot.units.map<StaticOwnInput>((entry) => ({
    unit: entry.unit,
    snapshot: snapshot.snapshot,
    sourceRevision: snapshot.sourceRevision,
    graphCoverage: "COMPLETE",
    sourceBlobs: entry.sourceBlobs,
    pack: entry.pack,
  }))
  const skills = expected.map((input) => materializeStaticOwn(input))
  return {
    skills,
    coverage: {
      path: OWN_COVERAGE_PATH,
      content: materializeStaticOwnCoverage({
        snapshot: snapshot.snapshot,
        sourceRevision: snapshot.sourceRevision,
        units: expected.map((input) => input.unit.id),
      }),
    },
  }
}

/** Check committed projection against snapshot and current source blobs. */
export function verifyStaticOwnSnapshot(
  snapshot: OwnSnapshot,
  files: readonly StaticOwnFile[],
  currentBlob: (path: string) => string | undefined,
): OwnSnapshotVerification {
  const expected = materializeStaticOwnSnapshot(snapshot)
  const wanted = new Map<string, string>(
    [...expected.skills, expected.coverage].map((file) => [file.path, file.content]),
  )
  const actual = new Map<string, string>()
  const issues: string[] = []
  for (const file of files) {
    if (actual.has(file.path)) issues.push(`duplicate static Own file: ${file.path}`)
    actual.set(file.path, file.content)
    if (!wanted.has(file.path)) issues.push(`unexpected static Own file: ${file.path}`)
  }
  for (const [path, content] of wanted) {
    if (!actual.has(path)) issues.push(`missing static Own file: ${path}`)
    else if (actual.get(path) !== content) issues.push(`static Own drift: ${path}`)
  }
  for (const entry of snapshot.units) {
    for (const [path, blob] of Object.entries(entry.sourceBlobs)) {
      if (currentBlob(path) !== blob) issues.push(`source blob drift: ${entry.unit.id} -> ${path}`)
    }
  }
  return issues.length === 0 ? { status: "READY" } : { status: "HOLD", issues: uniqueSorted(issues) }
}
