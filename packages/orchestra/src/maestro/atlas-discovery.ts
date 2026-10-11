import { Buffer } from "node:buffer"
import type { VerifiedOwnUnit } from "@orchestra/atlas-boundary"
import { Effect } from "effect"
import type { Session } from "@/session/session"
import { AtlasContextHeld, loadAtlasSkill, readAtlasSource } from "./atlas-source"

type Placement = Pick<Session.Info, "id" | "projectID" | "directory">

// Ordinary context reads reuse the same verification door as grounded dispatch; no authorization is minted here.
export const catalog = Effect.fn("AtlasDiscovery.catalog")(function* (session: Placement) {
  const source = yield* readAtlasSource(session)
  const units = boundedRows(source.context.units.map((unit) => ({
    unit: unit.unit,
    skillName: unit.skillName,
    graphCoverage: unit.receipt.graphCoverage,
    tokenEstimate: unit.tokenEstimate,
    complete: complete(unit),
  })))
  const territories = boundedRows(source.context.territories.map((territory) => ({
    name: territory.name,
    owner: territory.owner,
    tier: territory.tier,
    globs: territory.globs,
  })))
  return {
    projectID: session.projectID,
    sourceIdentity: source.identityHash,
    sourceRevision: source.context.sourceRevision,
    catalogVersion: source.context.catalogVersion,
    units,
    territories,
    coverage: {
      state: units.length === source.context.units.length && territories.length === source.context.territories.length
        ? "complete" as const
        : "partial" as const,
      scope: "verified-own-catalog" as const,
      units: { returned: units.length, total: source.context.units.length },
      territories: { returned: territories.length, total: source.context.territories.length },
      bodiesLoaded: false,
    },
  }
})

export const unit = Effect.fn("AtlasDiscovery.unit")(function* (session: Placement, id: string) {
  const source = yield* readAtlasSource(session)
  const loaded = yield* loadAtlasSkill(session, source, id)
  const selected = source.context.units.find((candidate) => candidate.unit === loaded.unit)
  if (!selected) return yield* new AtlasContextHeld({ reason: "unit-missing-or-ambiguous", evidence: [id] })
  return {
    projectID: session.projectID,
    sourceIdentity: source.identityHash,
    sourceRevision: source.context.sourceRevision,
    ...loaded,
    receipt: selected.receipt,
    coverage: {
      state: "complete" as const,
      scope: "verified-own-unit" as const,
      graphCoverage: selected.receipt.graphCoverage,
      freshness: "FRESH" as const,
      currentBlobsChecked: true,
      truncated: false,
      // COMPLETE is Atlas's declared graph coverage, not universal semantic-language support.
      note: "Verified Atlas Own coverage; no additional semantic-language coverage is claimed.",
    },
  }
})

function complete(unit: VerifiedOwnUnit) {
  return unit.truncated === false && unit.pullReachable.length === 0 && unit.advisoryDropped === 0 &&
    unit.receipt.graphCoverage === "COMPLETE"
}

// Each metadata list is bounded independently; omitted rows remain explicit in coverage, never an absence claim.
function boundedRows<T>(rows: readonly T[]) {
  return rows.reduce<{ rows: T[]; bytes: number }>((result, row) => {
    const bytes = Buffer.byteLength(JSON.stringify(row), "utf8") + 1
    if (result.rows.length === 50 || result.bytes + bytes > 6 * 1024) return result
    return { rows: [...result.rows, row], bytes: result.bytes + bytes }
  }, { rows: [], bytes: 2 }).rows
}

export * as AtlasDiscovery from "./atlas-discovery"
