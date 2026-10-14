// Adapted from TechLead a68e7af governance + MCP contracts. Host owns authority and observation acquisition.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
import type { ArsenalContext, JsonSchema } from "../contract.ts"
export { text } from "../contract.ts"
export type GovernanceContext = ArsenalContext

export const idSchema: JsonSchema = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$", maxLength: 96 }
export const stringSchema: JsonSchema = { type: "string", minLength: 1, maxLength: 4096 }
export const countSchema: JsonSchema = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
export const namesSchema: JsonSchema = { type: "array", maxItems: 512, uniqueItems: true, items: stringSchema }
export const shaSchema: JsonSchema = { type: "string", pattern: "^(?:[a-f0-9]{40}|[a-f0-9]{64})$" }
export function isSourceRevision(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
}
export function objectSchema(properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema {
  return { type: "object", additionalProperties: false, properties, required }
}
export function id(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value)) throw new Error(`INVALID_ID: ${value}`)
  return value
}
export function requireValue(condition: unknown, name: string): asserts condition {
  if (!condition) throw new Error(name)
}

export interface Provenance {
  readonly source: "session-event" | "host-check"
  readonly projectID: string
  readonly sessionID: string
  readonly eventID: string
  readonly revision?: string
  readonly revisionKind?: "git" | "source" | "event"
  readonly revisionUnavailable?: "not-captured" | "not-applicable"
}
export interface CheckResult {
  name: string
  status: "pass" | "fail" | "skip" | "missing" | "acquisition-error"
  exitCode?: number
  provenance: Provenance
}
export interface Capture {
  complete: boolean
  results: readonly CheckResult[]
}
export const provenanceSchema: JsonSchema = { ...objectSchema({
  source: { type: "string", enum: ["session-event", "host-check"] },
  projectID: idSchema, sessionID: idSchema, eventID: stringSchema,
  revision: stringSchema, revisionKind: { enum: ["git", "source", "event"] },
  revisionUnavailable: { enum: ["not-captured", "not-applicable"] },
}, ["source", "projectID", "sessionID", "eventID"]), oneOf: [
  { required: ["revision"], not: { required: ["revisionUnavailable"] }, anyOf: [
    { properties: { revisionKind: { const: "event" } }, required: ["revisionKind"] },
    { properties: { revision: shaSchema }, not: { properties: { revisionKind: { const: "event" } }, required: ["revisionKind"] } },
  ] },
  { required: ["revisionUnavailable"], not: { anyOf: [{ required: ["revision"] }, { required: ["revisionKind"] }] } },
] }
export const checkSchema = objectSchema({
  name: stringSchema,
  status: { type: "string", enum: ["pass", "fail", "skip", "missing", "acquisition-error"] },
  exitCode: { type: "integer", minimum: 0, maximum: 255 }, provenance: provenanceSchema,
}, ["name", "status", "provenance"])
export const captureSchema = objectSchema({
  complete: { type: "boolean" }, results: { type: "array", maxItems: 2048, items: checkSchema },
})
export function validateProvenance(value: Provenance, projectID: string) {
  requireValue(value && ["session-event", "host-check"].includes(value.source), "OBSERVATION_SOURCE_INVALID")
  requireValue(value.projectID === projectID, "OBSERVATION_PROJECT_MISMATCH")
  id(value.projectID)
  id(value.sessionID)
  requireValue(typeof value.eventID === "string" && value.eventID.length > 0 && value.eventID.length <= 4096, "OBSERVATION_EVENT_ID_MISSING")
  requireValue(value.revisionKind === undefined || ["git", "source", "event"].includes(value.revisionKind), "OBSERVATION_REVISION_KIND_INVALID")
  if (value.revision === undefined) {
    requireValue(value.revisionKind === undefined && ["not-captured", "not-applicable"].includes(value.revisionUnavailable!), "OBSERVATION_REVISION_UNAVAILABLE_DIAGNOSTIC_REQUIRED")
    return
  }
  requireValue(value.revisionUnavailable === undefined, "OBSERVATION_REVISION_CONTRADICTION")
  requireValue(typeof value.revision === "string", "OBSERVATION_REVISION_INVALID")
  requireValue(value.revisionKind === "event" ? value.revision.length > 0 && value.revision.length <= 4096 : isSourceRevision(value.revision), "OBSERVATION_REVISION_INVALID")
}
export function gitRevision(value: Provenance) {
  return value.revisionKind === undefined || value.revisionKind === "git" ? value.revision : undefined
}
export function revisionDiagnostics(values: readonly Provenance[]) {
  return [...new Set(values.filter((value) => value.revision === undefined || value.revisionKind === "event").map((value) => `SOURCE_REVISION_UNAVAILABLE: ${value.sessionID}/${value.eventID}`))].sort()
}
export function validateCapture(capture: Capture, projectID: string) {
  requireValue(capture && Array.isArray(capture.results), "CHECK_ACQUISITION_MISSING")
  requireValue(capture.complete === true, "CHECK_ACQUISITION_INCOMPLETE")
  requireValue(capture.results.length > 0 && capture.results.length <= 2048, "CHECK_ACQUISITION_EMPTY_OR_OVERFLOW")
  const names = new Set<string>()
  capture.results.forEach((result) => {
    requireValue(result.name && result.name.length <= 4096, "CHECK_NAME_INVALID")
    requireValue(!names.has(result.name), `CHECK_DUPLICATE: ${result.name}`)
    names.add(result.name)
    validateProvenance(result.provenance, projectID)
    requireValue(["pass", "fail", "skip", "missing", "acquisition-error"].includes(result.status), `CHECK_STATUS_INVALID: ${result.name}`)
    if (result.status !== "pass" && result.status !== "fail") return
    requireValue(Number.isInteger(result.exitCode) && result.exitCode! >= 0 && result.exitCode! <= 255, `CHECK_EXIT_MISSING: ${result.name}`)
    requireValue((result.status === "pass") === (result.exitCode === 0), `CHECK_EXIT_CONTRADICTION: ${result.name}`)
  })
}

export interface Usage {
  readonly provider: string
  readonly model: string
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly provenance: Provenance
}
export interface Price {
  readonly provider: string
  readonly model: string
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly currency: "USD"
  readonly source: string
  readonly asOf: string
}
export interface Observations {
  readonly complete: boolean
  readonly usage: readonly Usage[]
  readonly actions: readonly { readonly tool: string; readonly outcome: "succeeded" | "failed" | "denied"; readonly provenance: Provenance }[]
  readonly checks?: Capture
}
export const usageSchema = objectSchema({ provider: stringSchema, model: stringSchema, input: countSchema, output: countSchema, cacheRead: countSchema, cacheWrite: countSchema, provenance: provenanceSchema })
export const priceSchema = objectSchema({
  provider: stringSchema, model: stringSchema,
  input: { type: "number", minimum: 0, description: "USD per million uncached input tokens" },
  output: { type: "number", minimum: 0, description: "USD per million output tokens" },
  cacheRead: { type: "number", minimum: 0, description: "USD per million cache-read input tokens" },
  cacheWrite: { type: "number", minimum: 0, description: "USD per million cache-write input tokens" },
  currency: { const: "USD" }, source: stringSchema,
  asOf: { ...stringSchema, description: "Actual pricing effective date/time or contracted rate-version identity; never invented" },
})
export const observationsSchema = objectSchema({
  complete: { type: "boolean" }, usage: { type: "array", maxItems: 2048, items: usageSchema },
  actions: { type: "array", maxItems: 2048, items: objectSchema({ tool: stringSchema, outcome: { enum: ["succeeded", "failed", "denied"] }, provenance: provenanceSchema }) },
  checks: captureSchema,
}, ["complete", "usage", "actions"])
export interface CompletionContract {
  readonly sessionID: string
  readonly label: string
  readonly retryBudget?: number
  readonly chain: readonly { readonly id: string; readonly instructions?: string; readonly checks: readonly { readonly id: string; readonly hostCheck: string }[] }[]
}
export const completionSchema = objectSchema({
  sessionID: idSchema, label: stringSchema, retryBudget: { type: "integer", minimum: 0, maximum: 32 },
  chain: { type: "array", minItems: 1, maxItems: 32, items: objectSchema({
    id: idSchema, instructions: stringSchema,
    checks: { type: "array", minItems: 1, maxItems: 64, items: objectSchema({ id: idSchema, hostCheck: idSchema }) },
  }, ["id", "checks"]) },
}, ["sessionID", "label", "chain"])
export const LEDGER_RECORDS = 256
export interface WpLedgerRecord {
  wpId: string
  model?: string
  predicted?: { costTokens?: number; gateFails?: number; retries?: number }
  actual: { gateFails: number; retries: number; offBaseline: boolean; costTokens: number; wallClockMs: number }
  events?: { dispatchedAt?: number; sealedAt?: number; mergedAt?: number }
  provenance: Provenance
}
export const ledgerRecordSchema = objectSchema({
  wpId: idSchema, model: stringSchema,
  actual: objectSchema({ gateFails: countSchema, retries: countSchema, offBaseline: { type: "boolean" }, costTokens: countSchema, wallClockMs: countSchema }),
  provenance: provenanceSchema,
  predicted: objectSchema({ costTokens: countSchema, gateFails: countSchema, retries: countSchema }, []),
  events: objectSchema({ dispatchedAt: countSchema, sealedAt: countSchema, mergedAt: countSchema }, []),
}, ["wpId", "actual", "provenance"])
