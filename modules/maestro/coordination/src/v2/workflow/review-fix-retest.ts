export * as ReviewFixRetestV2 from "./review-fix-retest"

import { Effect, Option, Schema } from "effect"
import type { GitCli } from "@orchestra/core/git-cli"
import type { ReviewCatalog } from "@orchestra/core/review/catalog"
import type { ReviewRouting } from "@orchestra/core/review/routing"
import type { SessionSchema } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import type { ReviewAnalysisV2 } from "../tools/review-analysis"
import type { ReviewEvidenceCollectorV2 } from "./review-engagement-artifact-collector"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"
import type { ReviewFanoutV2 } from "./review-fanout"
import { ReviewFanoutSupportV2 } from "./review-fanout-support"
import type { ReviewFixSchemaV2 } from "./review-fix-schema"

export function capture(git: GitCli.Interface, input: { readonly worktree: string; readonly revision?: string; readonly paths?: readonly string[]; readonly requiredFiles: readonly string[] }): Effect.Effect<ReviewEngagementEvidenceV2.Prepared, Tool.Failure> {
  return ReviewEngagementEvidenceV2.prepare(git, input)
}

export function run(input: { readonly analyze: ReviewAnalysisV2.Analyze; readonly collector: Pick<ReviewEvidenceCollectorV2.Collector, "analysis">; readonly worktree: string; readonly source: ReviewEngagementEvidenceV2.Prepared; readonly sessionID: SessionSchema.ID; readonly cache: string; readonly routing: ReviewRouting.Record; readonly tier: ReviewCatalog.Catalog["route"]["tiers"][number]; readonly catalog: ReviewCatalog.Catalog }): Effect.Effect<ReviewFanoutV2.Analysis, Tool.Failure> {
  return Effect.gen(function* () {
    const evidence = yield* input.collector.analysis({ routing: input.routing, catalog: input.catalog })
    const files = input.source.files.map((file) => file.path)
    return yield* input.analyze({ worktree: input.worktree, base: input.source.commit, head: input.source.commit,
      sessionID: input.sessionID, cache: input.cache, routing: input.routing, packs: ReviewFanoutSupportV2.routable(input.routing.packs),
      executionTier: input.tier.id, catalog: input.catalog, files, repositoryFiles: files, evidence })
  })
}

export function observe(input: { readonly inputHash: string; readonly findingID: string; readonly priorProof: ReviewEvidenceSchemaV2.Proof; readonly priorRecipe: typeof ReviewEvidenceSchemaV2.Recipe.Type; readonly analysis: ReviewEvidenceSchemaV2.AnalysisOperation; readonly hostProofs: readonly ReviewEvidenceSchemaV2.Proof[]; readonly bodies: ReadonlyMap<string, Uint8Array> }): ReviewFixSchemaV2.ToolObservation | "native-runtime-unqualified" | "runtime-unavailable" | "recipe-incompatible" {
  const checks = input.analysis.checks.filter((item) => item.pack === "oxlint")
  if (checks.length > 1) throw new Tool.Failure({ message: "engagement-evidence-corrupt: ambiguous analyzer check", metadata: { reason: "engagement-evidence-corrupt" } })
  const check = checks[0]
  if (!check || check.status === "not-run" || check.status === "acquisition-error") return check?.reason?.includes("native-runtime-unqualified") ? "native-runtime-unqualified" : "runtime-unavailable"
  const proofs = input.hostProofs.filter((proof) => proof.analysisOperationID === input.analysis.operationID && check.proofIDs.includes(proof.proofID))
  const head = proofs.filter((proof) => proof.side === "head")
  const base = proofs.filter((proof) => proof.side === "base")
  if (head.length !== 1 || base.length !== 1) return "runtime-unavailable"
  if (proofs.length !== 2 || proofs.some((proof) => proof.sourceSha256 !== input.analysis.sourceSha256 || !check.artifactIDs.includes(proof.stdoutArtifactID))) throw new Tool.Failure({ message: "engagement-evidence-corrupt: inconsistent analyzer proof", metadata: { reason: "engagement-evidence-corrupt" } })
  const projection = (recipe: typeof ReviewEvidenceSchemaV2.Recipe.Type) => ({ pack: recipe.pack, template: recipe.template, runtime: recipe.runtime, files: recipe.files.map((file) => file.path), rules: recipe.rules, config: recipe.config, invocation: recipe.invocation, limits: recipe.limits })
  const recipeSha256 = ReviewEvidenceSchemaV2.digest(projection(input.priorRecipe))
  const inspect = (proof: ReviewEvidenceSchemaV2.Proof) => {
    const body = (id: string) => {
      const value = input.bodies.get(id)
      if (!value) throw new Tool.Failure({ message: "engagement-evidence-corrupt: missing analyzer body", metadata: { reason: "engagement-evidence-corrupt" } })
      return value
    }
    const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(ReviewEvidenceSchemaV2.Recipe), ReviewEvidenceSchemaV2.strict)(new TextDecoder().decode(body(proof.recipeArtifactID)))
    if (Option.isNone(decoded)) throw new Tool.Failure({ message: "engagement-evidence-corrupt: invalid analyzer recipe", metadata: { reason: "engagement-evidence-corrupt" } })
    const recipe = decoded.value
    if (ReviewEvidenceSchemaV2.digest(projection(recipe)) !== recipeSha256) return "recipe-incompatible" as const
    const config = body(proof.configArtifactID)
    if (config.byteLength !== recipe.config.bytes || ReviewEvidenceSchemaV2.hash(config) !== recipe.config.sha256 || recipe.analysisOperationID !== proof.analysisOperationID || recipe.invocationID !== proof.invocationID || recipe.side !== proof.side || recipe.sourceSha256 !== proof.sourceSha256 || ReviewEvidenceSchemaV2.digest(recipe.runtime) !== ReviewEvidenceSchemaV2.digest(proof.runtime)) throw new Tool.Failure({ message: "engagement-evidence-corrupt: inconsistent analyzer recipe", metadata: { reason: "engagement-evidence-corrupt" } })
    const stdout = body(proof.stdoutArtifactID)
    const stderr = body(proof.stderrArtifactID)
    const outcome = proof.outcome
    if (outcome.timedOut || outcome.overflow || outcome.memoryExceeded || outcome.failure || outcome.stdout.truncated || outcome.stderr.truncated || outcome.stdout.bytes !== stdout.byteLength || outcome.stdout.retainedBytes !== stdout.byteLength || outcome.stderr.bytes !== stderr.byteLength || outcome.stderr.retainedBytes !== stderr.byteLength || new TextDecoder().decode(stderr).trim() !== "" || ![0, 1].includes(outcome.exitCode ?? -1)) return "runtime-unavailable" as const
    const text = decode(stdout)
    if (text === undefined || decode(stderr) === undefined) throw new Tool.Failure({ message: "engagement-evidence-corrupt: invalid analyzer UTF-8", metadata: { reason: "engagement-evidence-corrupt" } })
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
    const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
    const corrupt = () => { throw new Tool.Failure({ message: "engagement-evidence-corrupt: invalid native SARIF", metadata: { reason: "engagement-evidence-corrupt" } }) }
    if (Option.isNone(parsed) || !record(parsed.value)) return corrupt()
    const data = parsed.value
    if (data.version !== "2.1.0" || !Array.isArray(data.runs) || data.runs.length !== 1 || !record(data.runs[0])) return corrupt()
    const run = data.runs[0]
    if (!record(run.tool) || !record(run.tool.driver) || run.tool.driver.name !== recipe.pack || run.tool.driver.version !== recipe.runtime.pinnedVersion || (run.tool.driver.semanticVersion !== undefined && run.tool.driver.semanticVersion !== recipe.runtime.pinnedVersion) || !Array.isArray(run.results)) return corrupt()
    if (run.invocations !== undefined && (!Array.isArray(run.invocations) || run.invocations.some((invocation) =>
      !record(invocation) || (invocation.executionSuccessful !== undefined && typeof invocation.executionSuccessful !== "boolean") || invocation.executionSuccessful === false ||
      [invocation.toolExecutionNotifications, invocation.toolConfigurationNotifications].some((notifications) => notifications !== undefined &&
        (!Array.isArray(notifications) || notifications.some((notification) => !record(notification) ||
          (notification.level !== undefined && (typeof notification.level !== "string" || !["none", "note", "warning", "error"].includes(notification.level))) || notification.level === "error")))))) return corrupt()
    const rows = run.results
    if (rows.some((row) => {
      if (!record(row) || (row.kind !== undefined && row.kind !== "fail" && !(row.kind === "review" && row.level === "note")) || typeof row.ruleId !== "string" || !recipe.rules.includes(row.ruleId) || !record(row.message) || typeof row.message.text !== "string" || !Array.isArray(row.locations) || row.locations.length !== 1 || (row.level !== undefined && (typeof row.level !== "string" || !["error", "warning", "note"].includes(row.level)))) return true
      const location = row.locations[0]
      if (!record(location) || !record(location.physicalLocation) || !record(location.physicalLocation.artifactLocation) || typeof location.physicalLocation.artifactLocation.uri !== "string" || !location.physicalLocation.artifactLocation.uri || !record(location.physicalLocation.region)) return true
      const region = location.physicalLocation.region
      if (typeof region.startLine !== "number" || !Number.isSafeInteger(region.startLine) || region.startLine < 1 || (region.endLine !== undefined && (typeof region.endLine !== "number" || !Number.isSafeInteger(region.endLine) || region.endLine < region.startLine))) return true
      if ([region.startColumn, region.endColumn].some((column) => column !== undefined && (typeof column !== "number" || !Number.isSafeInteger(column) || column < 1))) return true
      return typeof region.startColumn === "number" && typeof region.endColumn === "number" && (region.endLine ?? region.startLine) === region.startLine && region.endColumn < region.startColumn
    })) return corrupt()
    const errors = rows.filter((row) => record(row) && row.level === "error").length
    if (!((outcome.exitCode === 0 && errors === 0) || (outcome.exitCode === 1 && errors > 0))) return "runtime-unavailable" as const
    return rows.length ? "nonzero" as const : "zero" as const
  }
  const a = inspect(head[0])
  const b = inspect(base[0])
  if (a === "recipe-incompatible" || b === "recipe-incompatible") return "recipe-incompatible"
  if (a === "runtime-unavailable" || b === "runtime-unavailable" || (a === "zero" && b === "zero" && check.status !== "pass")) return "runtime-unavailable"
  const value = { findingID: input.findingID, priorProofID: input.priorProof.proofID, analysisOperationID: input.analysis.operationID, headProofID: head[0].proofID, baseProofID: base[0].proofID, recipeSha256, result: a === "zero" && b === "zero" ? "zero" as const : "nonzero" as const }
  return { observationID: ReviewEvidenceSchemaV2.digest({ schema: "review-fix-observation-v1", inputHash: input.inputHash, ...value }), ...value }
}

function decode(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}
