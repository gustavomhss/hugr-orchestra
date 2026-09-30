import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { OWN_CAP } from "@opencode-ai/atlas-boundary"
import type { MaestroContext } from "@opencode-ai/schema/maestro-context"
import type { Schema } from "effect"
import type { ManifestPointer, VerifiedHostContext, VerifiedOwnUnit } from "@opencode-ai/atlas-boundary"
import type { ComposedActor } from "./approval"
import { lookupRosterMember } from "./roster"

export type ContextToolPlan = Schema.Schema.Type<typeof MaestroContext.ToolPlan>

type Input = {
  actor: ComposedActor
  revision: { id: string; hash: string; projectId: string; sessionId: string }
  territories: readonly string[]
  units: readonly string[]
  context: VerifiedHostContext
}

type Hold = { status: "HOLD"; reason: string; evidence: readonly string[] }

export function compileContextToolPlan(input: Input): { status: "READY"; plan: ContextToolPlan } | Hold {
  const invalid = validateBinding(input)
  if (invalid) return invalid

  const selected = input.units.flatMap((unit) => input.context.units.filter((candidate) => candidate.unit === unit))
  const issues = selected.flatMap((unit) => {
    const issue = validateUnit(unit, input.context)
    return issue ? [issue] : []
  })
  if (issues[0]) return issues[0]

  const actor = {
    memberId: input.actor.memberId,
    projectId: input.actor.projectId,
    sessionId: input.actor.sessionId,
  }
  const plan = {
    version: "context-tool-plan-v1" as const,
    actor,
    actorBytes: JSON.stringify({ ...actor, version: "maestro-actor-v1" }),
    planRevision: { id: input.revision.id, hash: input.revision.hash },
    catalogVersion: input.context.catalogVersion,
    headSnapshot: input.context.snapshot,
    sourceRevision: input.context.sourceRevision,
    territories: [...input.territories],
    actions: selected.map((unit) => ({
      unit: unit.unit,
      skillName: unit.skillName,
      operation: "load-skill" as const,
      path: unit.path,
      contentHash: unit.receipt.contentHash,
      receiptHash: sha256(stableJSON(unit.receipt)),
    })),
    pointers: selected.map((unit) => ({
      unit: unit.unit,
      drillUnits: [...unit.receipt.drillUnits],
      manifest: unit.pointers.map((pointer) => ({
        kind: pointer.kind,
        name: pointer.name,
        digest: pointer.digest,
        pull: pointer.pull,
        hits: pointer.hits,
      })),
      pullReachable: [...unit.pullReachable],
    })),
  }
  return { status: "READY", plan: { ...plan, hash: sha256(stableJSON(plan)) } }
}

function validateBinding(input: Input): Hold | undefined {
  if (
    ![input.actor.memberId, input.actor.projectId, input.actor.sessionId].every(validName) ||
    lookupRosterMember(input.actor.memberId).status !== "FOUND"
  ) {
    return hold("actor-invalid", [JSON.stringify(input.actor)])
  }
  if (
    ![input.revision.id, input.revision.projectId, input.revision.sessionId].every(validName) ||
    typeof input.revision.hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.revision.hash)
  ) {
    return hold("revision-invalid", [JSON.stringify(input.revision)])
  }
  if (
    input.actor.projectId !== input.revision.projectId ||
    input.actor.sessionId !== input.revision.sessionId ||
    input.actor.projectId !== input.context.projectId
  ) {
    return hold("actor-binding-mismatch", [
      JSON.stringify(input.actor),
      JSON.stringify(input.revision),
      input.context.projectId,
    ])
  }
  if (
    input.context.version !== 1 ||
    ![input.context.projectId, input.context.snapshot, input.context.catalogVersion].every(validName) ||
    typeof input.context.sourceRevision !== "string" ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.context.sourceRevision)
  ) {
    return hold("context-identity-invalid", [
      JSON.stringify({
        version: input.context.version,
        projectId: input.context.projectId,
        snapshot: input.context.snapshot,
        catalogVersion: input.context.catalogVersion,
        sourceRevision: input.context.sourceRevision,
      }),
    ])
  }
  if (!validNames(input.territories, true) || !validNames(input.units, true)) {
    return hold("selection-invalid", [JSON.stringify({ territories: input.territories, units: input.units })])
  }
  const territories = input.context.territories.map((territory) => territory.name)
  const units = input.context.units.map((unit) => unit.unit)
  if (!validNames(territories, true) || !validNames(units, true)) {
    return hold("context-availability-invalid", [JSON.stringify({ territories, units })])
  }
  const unknownTerritories = input.territories.filter((territory) => !territories.includes(territory))
  if (unknownTerritories.length) return hold("territory-unavailable", unknownTerritories)
  const unknownUnits = input.units.filter((unit) => !units.includes(unit))
  if (unknownUnits.length) return hold("unit-unavailable", unknownUnits)
}

function validateUnit(unit: VerifiedOwnUnit, context: VerifiedHostContext): Hold | undefined {
  const encoded = Buffer.from(unit.unit, "utf8").toString("base64url")
  if (unit.skillName !== `own_${encoded}` || unit.path !== `.opencode/skills/own/${encoded}/SKILL.md`) {
    return holdUnit("unit-skill-identity-mismatch", unit)
  }
  if (
    !unit.receipt ||
    unit.receipt.schemaVersion !== 1 ||
    unit.receipt.unit !== unit.unit ||
    unit.receipt.skillName !== unit.skillName ||
    unit.receipt.snapshot !== context.snapshot ||
    unit.receipt.sourceRevision !== context.sourceRevision ||
    !validName(unit.receipt.contentHash) ||
    typeof unit.content !== "string" ||
    unit.content.length === 0
  ) {
    return holdUnit("unit-receipt-mismatch", unit)
  }
  if (unit.receipt.graphCoverage !== "COMPLETE") return holdUnit("unit-coverage-incomplete", unit)
  if (
    !validNames(unit.receipt.drillUnits) ||
    !validNames(unit.pullReachable) ||
    !validNames(unit.receipt.factIds) ||
    !unit.receipt.sourceBlobs ||
    Array.isArray(unit.receipt.sourceBlobs) ||
    typeof unit.receipt.sourceBlobs !== "object" ||
    !Object.entries(unit.receipt.sourceBlobs).every(([path, hash]) => validName(path) && validName(hash)) ||
    !Array.isArray(unit.pointers) ||
    !Array.from(unit.pointers).every(
      (pointer) =>
        pointer &&
        ["pack", "memory", "knowledge", "drill"].includes(pointer.kind) &&
        [pointer.name, pointer.digest, pointer.pull].every(validName) &&
        Number.isSafeInteger(pointer.hits) &&
        pointer.hits >= 0,
    )
  ) {
    return holdUnit("unit-pointers-invalid", unit)
  }
  const unavailable = [
    ...unit.receipt.drillUnits.filter((drill) => !context.units.some((candidate) => candidate.unit === drill)),
    ...unit.pointers
      .filter(
        (pointer) =>
          pointer.kind === "drill" &&
          !context.units.some(
            (candidate) =>
              candidate.skillName === pointer.name &&
              pointer.name === `own_${Buffer.from(candidate.unit, "utf8").toString("base64url")}`,
          ),
      )
      .map((pointer) => pointer.name),
  ]
  if (unavailable.length) return holdUnit("drill-unit-unavailable", unit, unavailable)
  if (!Number.isSafeInteger(unit.tokenEstimate) || unit.tokenEstimate < 0 || unit.tokenEstimate > OWN_CAP) {
    return holdUnit("unit-over-cap-or-invalid-estimate", unit)
  }
  // A bounded projection with any omitted tail is not sufficient to authorize execution.
  if (
    unit.truncated !== false ||
    unit.pullReachable.length > 0 ||
    !Number.isSafeInteger(unit.advisoryDropped) ||
    unit.advisoryDropped !== 0
  ) {
    return holdUnit("unit-tail-insufficient", unit)
  }
}

function hold(reason: string, evidence: readonly string[]): Hold {
  return { status: "HOLD", reason, evidence }
}

function holdUnit(reason: string, unit: VerifiedOwnUnit, extra: readonly string[] = []) {
  return hold(reason, [
    unit.unit,
    JSON.stringify({
      receipt: unit.receipt,
      skillName: unit.skillName,
      path: unit.path,
      tokenEstimate: unit.tokenEstimate,
      manifest: unit.pointers,
      pullReachable: unit.pullReachable,
      advisoryDropped: unit.advisoryDropped,
      truncated: unit.truncated,
    }),
    ...extra,
  ])
}

function validName(value: unknown): value is string {
  // Lone surrogates collapse to replacement characters under UTF-8, breaking injective unit names.
  return typeof value === "string" && value.trim().length > 0 && !/[\p{Cc}\p{Cs}]/u.test(value)
}

function validNames(values: readonly string[], required = false) {
  return (
    Array.isArray(values) &&
    (!required || values.length > 0) &&
    Array.from(values).every(validName) &&
    new Set(values).size === values.length
  )
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJSON(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}
