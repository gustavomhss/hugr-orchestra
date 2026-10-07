// ── REFERENCE MODEL — EXTERNAL STATIC HOST BOUNDARY
// Declared in harness/gates/reference-model-guard.mjs.
// Installed consumers are outside Atlas's packages/*/src scan. The host builds this exact entry into
// @orchestra/atlas-boundary; no Atlas-local runtime composes it. Ledger classification states scan reach.
import type { Territory } from "@atlas/contracts"
import { createTerritoryCatalog, parseTerritoryCatalog } from "@atlas/index"
import type { TerritoryCatalog } from "@atlas/index"
import { id } from "@atlas/kernel"
import { OWN_CAP } from "./own.js"
import { parseOwnSnapshot, verifyStaticOwnSnapshot } from "./own-snapshot.js"
import { OWN_COVERAGE_PATH } from "./own-coverage.js"
import { parseStaticOwnReceipt, staticOwnArtifactPath, staticOwnSkillName } from "./own-artifact.js"
import type { StaticOwnFile, StaticOwnReceipt } from "./own-artifact.js"
import type { ManifestPointer } from "./own-model.js"

export type { Territory, TerritoryCatalog, StaticOwnFile, StaticOwnReceipt, ManifestPointer }
export { OWN_CAP }

export const HOST_CONTEXT_VERSION = 1

export interface VerifiedOwnUnit {
  readonly unit: string
  readonly skillName: string
  readonly path: string
  readonly content: string
  readonly receipt: StaticOwnReceipt
  readonly tokenEstimate: number
  readonly pointers: readonly ManifestPointer[]
  readonly pullReachable: readonly string[]
  readonly advisoryDropped: number
  readonly truncated: boolean
}

export interface VerifiedHostContext {
  readonly version: typeof HOST_CONTEXT_VERSION
  readonly projectId: string
  readonly catalogVersion: string
  readonly snapshot: string
  readonly sourceRevision: string
  readonly territories: readonly Territory[]
  readonly units: readonly VerifiedOwnUnit[]
}

export interface HostContextInput {
  readonly projectId: string
  readonly catalog: unknown
  readonly snapshotContent: string
  readonly files: readonly StaticOwnFile[]
  readonly currentBlobs: Readonly<Record<string, string | undefined>>
}

export type HostContextResult =
  | { readonly status: "READY"; readonly context: VerifiedHostContext }
  | { readonly status: "HOLD"; readonly reason: string; readonly evidence: readonly string[] }

/** Atlas owns the Territory definition, validation, and content-addressed version. */
export function publishTerritoryCatalog(projectId: string, territories: readonly Territory[]): TerritoryCatalog {
  const catalog = createTerritoryCatalog([
    {
      projectId,
      catalogVersion: String(id({ projectId, territories })),
      territories,
    },
  ]).territoryCatalog(projectId)
  requireCanonicalCatalog(catalog)
  return catalog
}

/** Static, explicit project read. No runtime retrieval or project inference. */
export function territoryCatalog(projectId: string, value: unknown): TerritoryCatalog {
  if (typeof projectId !== "string" || !projectId.trim()) throw new Error("missing project identity")
  const catalog = parseTerritoryCatalog(value)
  requireCanonicalCatalog(catalog)
  if (catalog.projectId !== projectId) throw new Error("catalog project mismatch")
  if (catalog.catalogVersion !== String(id({ projectId, territories: catalog.territories }))) {
    throw new Error("catalog version mismatch")
  }
  return catalog
}

/** The host can enumerate declared files without reimplementing Atlas snapshot parsing. */
export function inspectOwnSnapshot(content: string) {
  const snapshot = parseOwnSnapshot(content)
  if (!snapshot) return { status: "HOLD" as const, reason: "snapshot-invalid", evidence: [] as readonly string[] }
  return {
    status: "READY" as const,
    snapshot: snapshot.snapshot,
    sourceRevision: snapshot.sourceRevision,
    sourcePaths: [...new Set(snapshot.units.flatMap((entry) => Object.keys(entry.sourceBlobs)))].sort(),
    artifactPaths: [OWN_COVERAGE_PATH, ...snapshot.units.map((entry) => staticOwnArtifactPath(entry.unit.id))],
  }
}

/** Verify committed static Own bytes against the canonical oracle and current source anchors. */
export function verifyHostContext(input: HostContextInput): HostContextResult {
  try {
    const catalog = territoryCatalog(input.projectId, input.catalog)
    const snapshot = parseOwnSnapshot(input.snapshotContent)
    if (!snapshot) return { status: "HOLD", reason: "snapshot-invalid", evidence: [] }
    const verification = verifyStaticOwnSnapshot(snapshot, input.files, (file) => input.currentBlobs[file])
    if (verification.status === "HOLD") {
      return { status: "HOLD", reason: "artifacts-invalid", evidence: verification.issues }
    }
    const units = snapshot.units.map((entry): VerifiedOwnUnit => {
      const path = staticOwnArtifactPath(entry.unit.id)
      const file = input.files.find((candidate) => candidate.path === path)
      const receipt = file ? parseStaticOwnReceipt(file.content) : undefined
      if (!file || !receipt) throw new Error(`missing artifact receipt: ${entry.unit.id}`)
      if (receipt.graphCoverage !== "COMPLETE") throw new Error(`under-approximate coverage: ${entry.unit.id}`)
      if (
        !Number.isSafeInteger(entry.pack.tokenEstimate) ||
        entry.pack.tokenEstimate < 0 ||
        entry.pack.tokenEstimate > OWN_CAP
      ) {
        throw new Error(`ownership cap exceeded: ${entry.unit.id}`)
      }
      if (!Number.isSafeInteger(entry.pack.advisoryDropped) || entry.pack.advisoryDropped < 0) {
        throw new Error(`malformed advisory-drop receipt: ${entry.unit.id}`)
      }
      if (entry.pack.manifest.pointers.some((pointer) => !validPointer(pointer))) {
        throw new Error(`malformed ownership pointer: ${entry.unit.id}`)
      }
      if (receipt.drillUnits.some((unit) => !snapshot.units.some((candidate) => candidate.unit.id === unit))) {
        throw new Error(`unavailable drill unit: ${entry.unit.id}`)
      }
      return {
        unit: entry.unit.id,
        skillName: staticOwnSkillName(entry.unit.id),
        path,
        content: file.content,
        receipt,
        tokenEstimate: entry.pack.tokenEstimate,
        pointers: entry.pack.manifest.pointers,
        pullReachable: entry.pack.pullReachable.map(String),
        advisoryDropped: entry.pack.advisoryDropped,
        truncated: entry.pack.manifest.truncated,
      }
    })
    return {
      status: "READY",
      context: {
        version: HOST_CONTEXT_VERSION,
        projectId: input.projectId,
        catalogVersion: catalog.catalogVersion,
        snapshot: snapshot.snapshot,
        sourceRevision: snapshot.sourceRevision,
        territories: catalog.territories,
        units,
      },
    }
  } catch (error) {
    return {
      status: "HOLD",
      reason: "boundary-invalid",
      evidence: [error instanceof Error ? error.message : String(error)],
    }
  }
}

function requireCanonicalCatalog(catalog: TerritoryCatalog) {
  if (!catalog.territories.length) throw new Error("empty territory catalog")
  if (
    catalog.territories.some(
      (territory) =>
        !territory.name.trim() || !territory.owner.trim() || territory.name !== territory.name.normalize("NFC"),
    )
  ) {
    throw new Error("non-canonical territory catalog")
  }
}

function validPointer(pointer: ManifestPointer) {
  return (
    pointer &&
    ["pack", "memory", "knowledge", "drill"].includes(pointer.kind) &&
    typeof pointer.name === "string" &&
    pointer.name.length > 0 &&
    typeof pointer.digest === "string" &&
    pointer.digest.length > 0 &&
    typeof pointer.pull === "string" &&
    pointer.pull.length > 0 &&
    Number.isSafeInteger(pointer.hits) &&
    pointer.hits >= 0
  )
}
