// Authoritative D descriptors. Pure schema data: no handler, filesystem or process imports.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import type { Descriptor, JsonSchema } from "../contract.ts"
import { objectSchema, stringSchema, idSchema, namesSchema, countSchema, shaSchema, captureSchema, observationsSchema, priceSchema, completionSchema, ledgerRecordSchema, LEDGER_RECORDS } from "./contracts.ts"
import { profileProperties } from "../onboard/profile.ts"

export const profileToolDescriptor: Descriptor = {
  name: "profile", description: "Read/update project governance preferences; preferences never grant permissions.", effects: ["read", "write"],
  inputSchema: objectSchema({ sourceRoot: stringSchema, action: { enum: ["get", "set"] }, patch: objectSchema(profileProperties, []) }, []),
}
export const relayArmToolDescriptor: Descriptor = {
  name: "relay-arm", description: "Persist named completion contracts. Native host executes compiled checks through runCompletion; no hook installation.", effects: ["read", "write"],
  inputSchema: objectSchema({ sourceRoot: stringSchema, action: { enum: ["arm", "read"] }, token: idSchema, contract: completionSchema }, ["action"]),
}
export const waveLedgerToolDescriptor: Descriptor = {
  name: "wave-ledger", description: "Bounded project wave outcome evidence, predicted/actual totals, barrier tax and explicit compaction receipts.", effects: ["read", "write"],
  inputSchema: objectSchema({ sourceRoot: stringSchema, action: { enum: ["record", "read", "compact"] }, wave: idSchema, now: countSchema, record: ledgerRecordSchema, retain: { type: "integer", minimum: 0, maximum: LEDGER_RECORDS } }, ["action", "wave"]),
}
export const waveSchedulerToolDescriptor: Descriptor = {
  name: "wave-scheduler", description: "Replay readiness and one serial DAG merge recommendation; never dispatches or merges.", effects: [],
  inputSchema: objectSchema({
    wps: { type: "array", maxItems: 512, items: objectSchema({ id: idSchema, writes: namesSchema, reads: namesSchema, appendOnly: namesSchema, deps: namesSchema, hardDeps: namesSchema, blastRadius: { type: "number", minimum: 0 } }, ["id"]) },
    events: { type: "array", maxItems: 8192, items: objectSchema({ type: { enum: ["dispatched", "sealed", "failed", "merged"] }, wp: idSchema }) }, cap: { type: "integer", minimum: 0, maximum: 512 },
  }, ["wps", "events"]),
}
export const operatorRequestSchema = objectSchema({
  requestID: idSchema,
  action: { enum: ["run-release-recipe", "apply-ruleset", "write-changelog"] },
  expectedHead: shaSchema,
})
const optional = (properties: Record<string, JsonSchema>, required: string[] = []) => ({ properties, required })
const metricCapture = objectSchema({ files: { type: "array", minItems: 1, maxItems: 2048, items: objectSchema({ path: stringSchema, loc: countSchema }) } })
const prices: JsonSchema = { type: "array", maxItems: 512, items: priceSchema }
const estimateRecord = objectSchema({ provider: stringSchema, model: stringSchema, input: countSchema, output: countSchema, cacheRead: countSchema, cacheWrite: countSchema })
const policy = objectSchema({ ownedPaths: namesSchema, denyPaths: namesSchema, allowedDomains: namesSchema })
export const GOVERNANCE_DEFINITIONS = {
  audit: optional({ observations: observationsSchema }, ["observations"]),
  usage: optional({ observations: observationsSchema, prices }, ["observations"]),
  status: optional({ observations: observationsSchema, prices }, ["observations"]),
  "cost-estimate": optional({ estimates: { type: "array", minItems: 1, maxItems: 2048, items: estimateRecord }, prices, budgetUSD: { type: "number", minimum: 0 } }, ["estimates", "prices"]),
  acceptance: optional({ baseline: captureSchema, final: captureSchema, acceptance: { type: "array", minItems: 1, maxItems: 512, items: objectSchema({ name: stringSchema, mode: { enum: ["red-green", "preserve-source-green"] } }) } }, ["baseline", "final", "acceptance"]),
  "completion-check": optional({ contract: completionSchema, checks: captureSchema, bindings: namesSchema }, ["contract", "checks", "bindings"]),
  "change-budget": optional({ base: stringSchema, soft: { type: "integer", minimum: 1 }, hard: { type: "integer", minimum: 1 }, reviewerCap: { type: "integer", minimum: 1 }, excludedPaths: namesSchema }),
  "ci-select": optional({ base: stringSchema, groups: { type: "array", minItems: 1, maxItems: 128, items: objectSchema({ prefix: stringSchema, group: idSchema }) }, universal: namesSchema }, ["groups", "universal"]),
  "metrics-snapshot": optional({ paths: namesSchema, threshold: { type: "integer", minimum: 1 } }, ["paths"]),
  "metrics-report": optional({ metricsBaseline: metricCapture, metricsFinal: metricCapture }, ["metricsBaseline", "metricsFinal"]),
  "loc-cap": optional({ paths: namesSchema, threshold: { type: "integer", minimum: 1 } }, ["paths"]),
  "changelog-check": optional({ packagePath: stringSchema, changelogPath: stringSchema }, ["packagePath", "changelogPath"]),
  "changelog-propose": optional({ version: stringSchema, title: stringSchema, date: stringSchema }, ["version", "title", "date"]),
  "changelog-write": optional({ operatorRequest: operatorRequestSchema, changelogPath: stringSchema, expectedDigest: { type: "string", pattern: "^[a-f0-9]{64}$" }, version: stringSchema, title: stringSchema, date: stringSchema }, ["operatorRequest", "changelogPath", "expectedDigest", "version", "title", "date"]),
  "release-propose": optional({ packagePath: stringSchema, changelogPath: stringSchema, checks: captureSchema, requiredChecks: namesSchema, branch: stringSchema }, ["packagePath", "changelogPath", "checks", "requiredChecks"]),
  "release-run": optional({ operatorRequest: operatorRequestSchema, recipePath: stringSchema, recipeDigest: { type: "string", pattern: "^[a-f0-9]{64}$" }, recipeArgs: namesSchema, tag: stringSchema, branch: stringSchema }, ["operatorRequest", "recipePath", "recipeDigest", "tag"]),
  "ruleset-propose": optional({ repository: stringSchema, branch: stringSchema, requiredStatusChecks: namesSchema }, ["repository"]),
  "ruleset-run": optional({ operatorRequest: operatorRequestSchema, repository: stringSchema, branch: stringSchema, requiredStatusChecks: namesSchema }, ["operatorRequest", "repository"]),
  commitlint: optional({ base: stringSchema }),
  "policy-propose": optional({ policy }, ["policy"]), "sandbox-propose": optional({ policy }, ["policy"]),
  "preflight-arm": optional({ wave: idSchema, checks: captureSchema, requiredChecks: namesSchema }, ["wave", "checks", "requiredChecks"]),
  "preflight-check": optional({ wave: idSchema }, ["wave"]), "preflight-disarm": optional({ wave: idSchema }, ["wave"]),
  "recovery-begin": optional({ wave: idSchema, ownedPaths: namesSchema }, ["wave", "ownedPaths"]),
  "recovery-prepare": optional({ wave: idSchema }, ["wave"]), "recovery-restore": optional({ token: idSchema }, ["token"]),
  "recovery-status": optional({ wave: idSchema }, ["wave"]), "recovery-replay": optional({ checks: captureSchema, requiredChecks: namesSchema }, ["checks", "requiredChecks"]),
} as const
export const GOVERNANCE_OPERATIONS = Object.keys(GOVERNANCE_DEFINITIONS) as (keyof typeof GOVERNANCE_DEFINITIONS)[]
export const operationSchema: JsonSchema = { type: "string", enum: GOVERNANCE_OPERATIONS }
// Full field schemas appear once. Branches retain exact allowed-field sets and required fields.
// Non-null branch constraints are sound because every shared field schema already excludes null.
const fields = Object.assign({}, ...Object.values(GOVERNANCE_DEFINITIONS).map((definition) => definition.properties)) as Record<string, JsonSchema>
export const governanceToolDescriptor: Descriptor = {
  name: "governance",
  description: "Scoped repository governance, host evidence and explicit authorized operator actions. Supplied captures are advice; compiled host checks own completion authority.",
  effects: ["read", "write", "process"],
  inputSchema: {
    ...objectSchema({ operation: operationSchema, sourceRoot: stringSchema, ...fields }, ["operation"]),
    oneOf: GOVERNANCE_OPERATIONS.map((operation) => objectSchema({
      operation: { const: operation }, sourceRoot: { not: { const: null } },
      ...Object.fromEntries(Object.keys(GOVERNANCE_DEFINITIONS[operation].properties).map((name) => [name, { not: { const: null } }])),
      ...(["release-run", "ruleset-run", "changelog-write"].includes(operation) ? {
        operatorRequest: { properties: { action: { const: operation === "release-run" ? "run-release-recipe" : operation === "ruleset-run" ? "apply-ruleset" : "write-changelog" } }, required: ["action"] },
      } : {}),
    }, ["operation", ...GOVERNANCE_DEFINITIONS[operation].required])),
  },
}
export const governanceToolDescriptors = {
  profile: profileToolDescriptor, "relay-arm": relayArmToolDescriptor, "wave-ledger": waveLedgerToolDescriptor,
  "wave-scheduler": waveSchedulerToolDescriptor, governance: governanceToolDescriptor,
} as const
