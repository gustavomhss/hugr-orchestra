import { OWN_ARTIFACT_ROOT, OWN_ARTIFACT_SCHEMA, verifyStaticOwnSet } from "./own-artifact.js"
import type { StaticOwnSetInput, StaticOwnSetVerification } from "./own-artifact.js"

export const OWN_COVERAGE_PATH = `${OWN_ARTIFACT_ROOT}/OWN-COVERAGE.json`

export interface StaticOwnCoverageReceipt {
  readonly schemaVersion: typeof OWN_ARTIFACT_SCHEMA
  readonly snapshot: string
  readonly sourceRevision: string
  readonly units: readonly string[]
}

export interface StaticOwnCoverageSetInput extends StaticOwnSetInput {
  readonly coverage: string
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort()
}

export function materializeStaticOwnCoverage(input: Omit<StaticOwnCoverageReceipt, "schemaVersion">): string {
  if (input.snapshot.length === 0 || input.sourceRevision.length === 0 || input.units.length === 0) {
    throw new Error("static Own coverage requires non-empty snapshot, sourceRevision, and units")
  }
  const units = uniqueSorted(input.units)
  if (units.length !== input.units.length || units.some((unit) => unit.length === 0)) {
    throw new Error("static Own coverage units must be unique and non-empty")
  }
  return `${JSON.stringify({ schemaVersion: OWN_ARTIFACT_SCHEMA, snapshot: input.snapshot, sourceRevision: input.sourceRevision, units })}\n`
}

export function parseStaticOwnCoverage(content: string): StaticOwnCoverageReceipt | undefined {
  try {
    const value = JSON.parse(content) as unknown
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
    const record = value as Record<string, unknown>
    const units = record.units
    if (!Array.isArray(units) || !units.every((unit): unit is string => typeof unit === "string" && unit.length > 0))
      return undefined
    if (
      record.schemaVersion !== OWN_ARTIFACT_SCHEMA ||
      typeof record.snapshot !== "string" ||
      record.snapshot.length === 0 ||
      typeof record.sourceRevision !== "string" ||
      record.sourceRevision.length === 0 ||
      units.length === 0 ||
      new Set(units).size !== units.length ||
      !units.every((unit, index) => index === 0 || units[index - 1]! < unit)
    ) {
      return undefined
    }
    return record as unknown as StaticOwnCoverageReceipt
  } catch {
    return undefined
  }
}

/** CI entry point: receipt declares coverage; independent inputs recompose every artifact from fresh facts. */
export function verifyStaticOwnCoverageSet(input: StaticOwnCoverageSetInput): StaticOwnSetVerification {
  const coverage = parseStaticOwnCoverage(input.coverage)
  if (coverage === undefined) return { status: "HOLD", issues: ["malformed Own coverage receipt"] }
  const expectedUnits = input.expected.map((item) => item.unit.id).sort()
  if (JSON.stringify(expectedUnits) !== JSON.stringify(coverage.units))
    return { status: "HOLD", issues: ["Own coverage receipt does not match recomposed units"] }
  return verifyStaticOwnSet(input)
}
