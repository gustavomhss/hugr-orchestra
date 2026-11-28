export * as ReviewEvidenceCollectorV2 from "./review-engagement-artifact-collector"

import { Effect, Schema, Scope, Semaphore } from "effect"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRouting } from "@orchestra/core/review/routing"
import type { ReviewTools } from "@orchestra/core/review/tools"
import { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import type { SessionMessage } from "@orchestra/core/session/message"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEvidenceValidationV2 } from "./review-engagement-artifact-validation"
import { ReviewChecksV2 } from "./review-checks"
import type { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"
import type { ReviewEngagementReportV2 } from "./review-engagement-report"
import type { ReviewFanoutV2 } from "./review-fanout"

export type Context = {
  readonly inputHash: string
  readonly sessionID: string
  readonly budget: ReviewEngagementReportV2.Budget
  readonly source: ReviewEngagementEvidenceV2.Prepared
  readonly active: Effect.Effect<void, Tool.Failure>
}
export type Storage = {
  readonly publish: (bytes: Uint8Array, mime: string) => Effect.Effect<string, Tool.Failure>
  readonly read: (sha256: string, bytes: number, mime: string) => Effect.Effect<Uint8Array, Tool.Failure>
}
export type Host = Pick<Extract<ReviewFanoutV2.Result, { readonly status: "ran" }>, "routing" | "checkFacts" | "outcomes">
export type Collector = {
  readonly analysis: (input: { readonly routing: ReviewRouting.Record; readonly catalog: ReviewCatalog.Catalog }) => Effect.Effect<ReviewAnalyze.Evidence, Tool.Failure>
  readonly code: (capture: ReviewTools.CodeCapture) => Effect.Effect<void, Tool.Failure>
  readonly acknowledge: (sessionID: string, messages: readonly SessionMessage.Message[]) => Effect.Effect<void, Tool.Failure>
  readonly gaps: () => Effect.Effect<ReviewEngagementReportV2.Result["notExamined"], Tool.Failure>
  readonly seal: (report: ReviewEngagementReportV2.Stored, host: Host) => Effect.Effect<ReviewEvidenceSchemaV2.Receipt, Tool.Failure>
}
type Prepared = Extract<ReviewAnalyze.EvidenceEvent, { readonly phase: "prepared" }>
type Analysis = {
  readonly id: string
  readonly ordinal: number
  readonly routing: ReviewRouting.Record
  readonly catalog: ReviewCatalog.Catalog
  readonly routingDigest: string
  readonly catalogDigest: string
  readonly prepared: Map<string, Prepared>
  readonly proofs: ReviewEvidenceSchemaV2.Proof[]
  result?: ReviewEvidenceSchemaV2.AnalysisResult
}

/** A single permit serializes receipt admission and aggregate quotas across concurrent real lens Sessions. */
export function make(context: Context, storage: Storage): Effect.Effect<Collector, never, Scope.Scope> {
  return Effect.gen(function* () {
    const permit = yield* Semaphore.make(1)
    let open = true
    let sealed = false
    let failed: Tool.Failure | undefined
    let total = 0
    const artifacts = new Map<string, ReviewEvidenceSchemaV2.Artifact>()
    const operations = new Map<string, ReviewEvidenceSchemaV2.CodeOperation | ReviewEvidenceSchemaV2.AnalysisOperation>()
    const order: string[] = []
    const analyses: Analysis[] = []
    const proofs: ReviewEvidenceSchemaV2.Proof[] = []
    const codeInputs = new Map<string, string>()
    const settlements = new Set<string>()
    const gaps: ReviewEngagementReportV2.Result["notExamined"][number][] = []
    yield* Effect.addFinalizer(() => Effect.sync(() => { open = false }))
    const checked = <A>(body: Effect.Effect<A, Tool.Failure>) => permit.withPermit(Effect.gen(function* () {
      if (failed) return yield* failed
      if (!open || sealed) return yield* ReviewEvidenceSchemaV2.failure("unavailable", "collector-closed")
      yield* context.active
      const value = yield* body
      yield* context.active
      return value
    }).pipe(Effect.tapError((error) => Effect.sync(() => { failed ??= error }))))
    const attempt = <A>(body: () => A) => Effect.try({ try: body,
      catch: (error) => error instanceof Tool.Failure ? error : ReviewEvidenceSchemaV2.failure("corrupt", String(error)) })
    const add = (kind: ReviewEvidenceSchemaV2.Artifact["kind"], raw: Uint8Array, mime: string, uri?: string, complete = true) => Effect.gen(function* () {
      const bytes = Uint8Array.from(raw)
      if (bytes.byteLength > ReviewEvidenceSchemaV2.limits.body) return yield* ReviewEvidenceSchemaV2.failure("bound-exceeded", "body")
      const descriptor = { kind, sha256: ReviewEvidenceSchemaV2.hash(bytes), bytes: bytes.byteLength, mime, complete, ...(uri === undefined ? {} : { uri }) }
      const artifactID = ReviewEvidenceSchemaV2.digest(descriptor)
      const existing = artifacts.get(artifactID)
      if (existing) return existing
      if (artifacts.size >= ReviewEvidenceSchemaV2.limits.artifacts || total + bytes.byteLength > ReviewEvidenceSchemaV2.limits.total)
        return yield* ReviewEvidenceSchemaV2.failure("bound-exceeded", artifacts.size >= ReviewEvidenceSchemaV2.limits.artifacts ? "artifacts" : "total")
      const hash = yield* storage.publish(bytes, mime)
      if (hash !== descriptor.sha256) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "publication digest differs")
      const artifact: ReviewEvidenceSchemaV2.Artifact = { artifactID, ...descriptor }
      artifacts.set(artifactID, artifact)
      total += bytes.byteLength
      return artifact
    })
    const addJSON = (kind: ReviewEvidenceSchemaV2.Artifact["kind"], value: unknown, uri?: string) => Effect.gen(function* () {
      const text = yield* attempt(() => ReviewEvidenceSchemaV2.canonical(value))
      return yield* add(kind, Buffer.from(text), "application/json", uri)
    })
    const capture = (kind: "code-result" | "code-snapshot", value: ReviewTools.CodeCapture["evidence"]) => Effect.gen(function* () {
      if (ReviewEvidenceSchemaV2.hash(value.text) !== value.sha256) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "CODE capture digest differs")
      const artifact = yield* add(kind, Buffer.from(value.text), "application/json", value.uri)
      return { uri: value.uri, sha256: value.sha256, artifactID: artifact.artifactID }
    })
    const native = (analysis: Analysis, event: Extract<ReviewAnalyze.EvidenceEvent, { readonly phase: "outcome" }>) => Effect.gen(function* () {
      const prepared = analysis.prepared.get(event.invocationID)
      if (!prepared || prepared.side !== event.side || analysis.proofs.some((proof) => proof.invocationID === event.invocationID))
        return yield* ReviewEvidenceSchemaV2.failure("corrupt", "native outcome has no unique preparation")
      const inputs = yield* addJSON("analyzer-inputs", { schema: "review-engagement-analyzer-inputs-v1", sourceSha256: prepared.sourceSha256,
        files: prepared.inputs.map((file) => ({ path: file.path, oid: file.oid, sha256: file.sha256,
          bytes: file.data.byteLength, encoding: "base64", data: Buffer.from(file.data).toString("base64") })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) })
      const config = yield* add("analyzer-config", prepared.config, "application/json")
      const recipe = yield* addJSON("analyzer-recipe", prepared.recipe)
      const pathMap = yield* add("analyzer-path-map", prepared.pathMap, "application/json", event.pathMapURI)
      const stdout = yield* add("analyzer-stdout", event.outcome.stdout.data, "application/octet-stream", event.stdoutURI,
        !event.outcome.stdout.truncated && !event.outcome.overflow)
      const stderr = yield* add("analyzer-stderr", event.outcome.stderr.data, "application/octet-stream", undefined,
        !event.outcome.stderr.truncated && !event.outcome.overflow)
      const outcome = event.outcome
      const payload = { kind: "oxlint" as const, analysisOperationID: analysis.id, invocationID: event.invocationID,
        side: event.side, sourceSha256: prepared.sourceSha256, runtime: prepared.runtime,
        inputsArtifactID: inputs.artifactID, configArtifactID: config.artifactID, recipeArtifactID: recipe.artifactID,
        pathMapArtifactID: pathMap.artifactID, stdoutArtifactID: stdout.artifactID, stderrArtifactID: stderr.artifactID,
        outcome: { exitCode: outcome.exitCode, durationMs: outcome.durationMs, timedOut: outcome.timedOut,
          overflow: outcome.overflow, memoryExceeded: outcome.memoryExceeded, ...(outcome.failure === undefined ? {} : { failure: outcome.failure }),
          stdout: { bytes: outcome.stdout.bytes, retainedBytes: outcome.stdout.data.byteLength, truncated: outcome.stdout.truncated },
          stderr: { bytes: outcome.stderr.bytes, retainedBytes: outcome.stderr.data.byteLength, truncated: outcome.stderr.truncated } } }
      const proof = yield* attempt(() => Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.Proof)({ proofID: ReviewEvidenceSchemaV2.digest(payload), ...payload }, ReviewEvidenceSchemaV2.strict))
      analysis.proofs.push(proof)
      proofs.push(proof)
      analysis.prepared.delete(event.invocationID)
    })
    const observe = (analysis: Analysis, event: ReviewAnalyze.EvidenceEvent) => checked(Effect.gen(function* () {
      if (event.analysisID !== analysis.id || analysis.result) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "analysis event identity or lifecycle differs")
      if (event.phase === "prepared") {
        if (event.sourceSha256 !== context.source.sha256 || analysis.prepared.has(event.invocationID) ||
          proofs.some((proof) => proof.invocationID === event.invocationID)) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "native preparation identity differs")
        // Provisional preparations remain unreachable until paired with an actual process outcome.
        analysis.prepared.set(event.invocationID, { ...event, inputs: event.inputs.map((file) => ({ ...file, data: Uint8Array.from(file.data) })),
          config: Uint8Array.from(event.config), pathMap: Uint8Array.from(event.pathMap) })
      } else if (event.phase === "outcome") yield* native(analysis, event)
      else {
        if (event.sourceSha256 !== context.source.sha256) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "analysis source differs")
        const wrapped = yield* attempt(() => Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.AnalysisResult)(JSON.parse(JSON.stringify({
          schema: "review-engagement-analysis-result-v1", operationID: analysis.id,
          routing: analysis.routing, catalog: analysis.catalog, result: event.result,
        })), ReviewEvidenceSchemaV2.strict))
        if (event.retained.uri !== wrapped.result.retained.uri || event.debt.uri !== wrapped.result.debt.uri)
          return yield* ReviewEvidenceSchemaV2.failure("corrupt", "analysis retained identities differ")
        const result = yield* addJSON("analysis-result", wrapped)
        const retained = yield* add("analysis-retained", event.retained.data, "application/json", event.retained.uri)
        const debt = yield* add("analysis-debt", event.debt.data, "application/json", event.debt.uri)
        const checks = wrapped.result.checks.map((check) => {
          const related = check.pack === "oxlint" ? analysis.proofs : []
          if (check.status === "not-run" || check.status === "acquisition-error") {
            const gap = { item: `analyze:${check.id}`, reason: check.reason ?? check.status }
            if (!gaps.some((existing) => ReviewEvidenceSchemaV2.same(existing, gap))) gaps.push(gap)
          }
          return { ...check, artifactIDs: [...new Set(related.flatMap(ReviewEvidenceValidationV2.proofArtifacts))], proofIDs: related.map((proof) => proof.proofID) }
        })
        const operation: ReviewEvidenceSchemaV2.AnalysisOperation = { operationID: analysis.id, kind: "analysis", status: "completed", ordinal: analysis.ordinal,
          sourceSha256: context.source.sha256, routingDigest: analysis.routingDigest, catalogDigest: analysis.catalogDigest,
          resultArtifactID: result.artifactID, retainedArtifactID: retained.artifactID, debtArtifactID: debt.artifactID, checks }
        operations.set(analysis.id, operation)
        analysis.result = wrapped
        analysis.prepared.clear()
      }
    })).pipe(Effect.mapError((error) => new ReviewAnalyze.Failed({ reason:
      typeof error.metadata?.reason === "string" ? error.metadata.reason : error.message })))
    const collector: Collector = {
      analysis: (input) => checked(Effect.gen(function* () {
        const routing = yield* attempt(() => Schema.decodeUnknownSync(ReviewRouting.Record)(JSON.parse(JSON.stringify(input.routing)), ReviewEvidenceSchemaV2.strict))
        const catalog = yield* attempt(() => Schema.decodeUnknownSync(ReviewCatalog.Catalog)(JSON.parse(JSON.stringify(input.catalog)), ReviewEvidenceSchemaV2.strict))
        const identity = { ordinal: analyses.length + 1, sourceSha256: context.source.sha256,
          routingDigest: ReviewEvidenceSchemaV2.digest(routing), catalogDigest: ReviewEvidenceSchemaV2.digest(catalog) }
        const analysis: Analysis = { id: ReviewEvidenceSchemaV2.analysisID(context.inputHash, identity), ...identity, routing, catalog, prepared: new Map(), proofs: [] }
        analyses.push(analysis)
        order.push(analysis.id)
        return { analysisID: analysis.id, source: { sha256: context.source.sha256, files: context.source.files },
          observe: (event: ReviewAnalyze.EvidenceEvent) => observe(analysis, event) }
      })),
      code: (value) => checked(Effect.gen(function* () {
        if (value.sourceSha256 !== context.source.sha256) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "CODE source differs")
        const identity = ReviewEvidenceSchemaV2.codeID(context.inputHash, value)
        const signature = yield* attempt(() => ReviewEvidenceSchemaV2.canonical(JSON.parse(JSON.stringify(value))))
        const previous = codeInputs.get(identity)
        if (previous !== undefined) {
          if (previous !== signature) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "CODE identity was reused with different bytes")
          return
        }
        if (codeInputs.size >= ReviewEvidenceSchemaV2.limits.code) return yield* ReviewEvidenceSchemaV2.failure("bound-exceeded", "code-operations")
        const evidence = yield* capture("code-result", value.evidence)
        const snapshots = yield* Effect.forEach(value.snapshots, (snapshot) => capture("code-snapshot", snapshot))
        const operation = yield* attempt(() => Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.CodeOperation)({ operationID: identity, kind: "code", status: "captured",
          sessionID: value.sessionID, assistantMessageID: value.assistantMessageID, toolCallID: value.toolCallID, name: value.name,
          input: JSON.parse(JSON.stringify(value.input)), sourceSha256: value.sourceSha256, evidence, snapshots,
          nativeSettlement: settlements.has(identity) ? { status: "completed", messageID: value.assistantMessageID } : { status: "not-observed" } }, ReviewEvidenceSchemaV2.strict))
        codeInputs.set(identity, signature)
        operations.set(identity, operation)
        order.push(identity)
      })),
      acknowledge: (sessionID, messages) => checked(Effect.sync(() => {
        for (const message of messages) {
          if (message.type !== "assistant") continue
          for (const part of message.content) {
            if (part.type !== "tool" || part.state.status !== "completed" || part.provider?.executed === true ||
              part.name !== "code_search" && part.name !== "code_query" && part.name !== "code_locate") continue
            const identity = ReviewEvidenceSchemaV2.codeID(context.inputHash, { sessionID, assistantMessageID: message.id, toolCallID: part.id,
              name: part.name, sourceSha256: context.source.sha256 })
            settlements.add(identity)
            const operation = operations.get(identity)
            if (operation?.kind === "code") operations.set(identity, { ...operation,
              nativeSettlement: { status: "completed", messageID: message.id } })
          }
        }
      })),
      gaps: () => checked(Effect.sync(() => [...gaps])),
      seal: (report, host) => checked(Effect.gen(function* () {
        const final = analyses.at(-1)
        if (!final?.result || analyses.some((analysis) => !analysis.result)) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "analysis did not complete")
        yield* attempt(() => {
          ReviewEvidenceSchemaV2.require(report.value.inputHash === context.inputHash && report.value.sessionID === context.sessionID &&
            ReviewEvidenceSchemaV2.same(report.value.budget, context.budget) && report.value.source?.sha256 === context.source.sha256, "report differs from active collection")
          // Entry may add lens/coverage metadata without rerunning unchanged packs. Bind the actual final analysis
          // to its executed pack selection and final host facts, while retaining its original routing bytes.
          ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(final.result?.routing.packs, JSON.parse(JSON.stringify(host.routing.packs))), "final host packs differ from observed analysis")
          if (!report.value.report) throw ReviewEvidenceSchemaV2.failure("corrupt", "completed card missing")
          ReviewChecksV2.validate(report.value.report, host.checkFacts)
        })
        const citations = yield* Effect.forEach(report.value.citations, (citation) => Effect.gen(function* () {
          const artifact = yield* add("citation", Buffer.from(citation.text), "text/plain", citation.uri)
          return { uri: citation.uri, artifactID: artifact.artifactID }
        }))
        const receipt: ReviewEvidenceSchemaV2.Receipt = { schema: "review-engagement-evidence-v1", reportID: report.value.reportID,
          inputHash: context.inputHash, sessionID: context.sessionID, sourceSha256: context.source.sha256,
          budget: context.budget, finalAnalysisOperationID: final.id,
          operations: order.map((id) => { const operation = operations.get(id); if (!operation) throw ReviewEvidenceSchemaV2.failure("corrupt", "operation did not complete"); return operation }),
          artifacts: [...artifacts.values()].sort((a, b) => a.artifactID < b.artifactID ? -1 : a.artifactID > b.artifactID ? 1 : 0),
          citations, hostProofs: [...proofs], notExamined: report.value.notExamined }
        const bytes = yield* attempt(() => Buffer.from(ReviewEvidenceSchemaV2.canonical(receipt)))
        if (bytes.byteLength > ReviewEvidenceSchemaV2.limits.receipt) return yield* ReviewEvidenceSchemaV2.failure("bound-exceeded", "receipt")
        const validated = yield* attempt(() => ReviewEvidenceValidationV2.read(bytes, report))
        // Re-read required immutable blobs: in-memory capture is not durable evidence after deletion or replacement.
        const bodies = new Map(yield* Effect.forEach(receipt.artifacts, (artifact) => storage.read(artifact.sha256, artifact.bytes, artifact.mime)
          .pipe(Effect.map((body) => [artifact.artifactID, body] as const))))
        yield* attempt(() => ReviewEvidenceValidationV2.validate(validated, report, bodies))
        sealed = true
        return validated
      })),
    }
    return collector
  })
}
