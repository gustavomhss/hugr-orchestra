export * as ReviewEvidenceValidationV2 from "./review-engagement-artifact-validation"

import { createHash } from "node:crypto"
import { Schema } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { ReviewItem } from "@orchestra/core/review-toolkit/item"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import type { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"
import type { ReviewEngagementReportV2 } from "./review-engagement-report"

const Retained = Schema.Struct({ total: ReviewEvidenceSchemaV2.Count, unread: Schema.Record(Schema.String, ReviewEvidenceSchemaV2.Count), items: Schema.Array(ReviewItem.ToolItem) })
const PathMap = Schema.Struct({ version: Schema.Literal("oxlint-projection-v1"),
  paths: Schema.Array(Schema.Struct({ file: Schema.NonEmptyString, path: Schema.NonEmptyString })) })
const Source = Schema.Struct({ worktree: Schema.NonEmptyString, tree: Schema.NonEmptyString,
  commit: Schema.NonEmptyString, scope: Schema.Struct({ sha256: ReviewEvidenceSchemaV2.Digest, files: Schema.Array(Schema.NonEmptyString) }) })
const CodeBody = Schema.Struct({ source: Source, result: Schema.Unknown, snapshot: Schema.optional(Schema.String) })
const Snapshot = Schema.Struct({ source: Source, snapshot: Schema.String })

export type AnalysisInput = {
  readonly inputHash: string
  readonly source: ReviewEngagementEvidenceV2.Prepared
  readonly finalAnalysisOperationID: string
  readonly operations: ReadonlyArray<ReviewEvidenceSchemaV2.CodeOperation | ReviewEvidenceSchemaV2.AnalysisOperation>
  readonly artifacts: ReadonlyArray<ReviewEvidenceSchemaV2.Artifact>
  readonly hostProofs: ReadonlyArray<ReviewEvidenceSchemaV2.Proof>
}
export type AnalysisContext = {
  readonly source: ReviewEngagementEvidenceV2.Prepared
  readonly final: ReviewEvidenceSchemaV2.AnalysisResult
  readonly operation: ReviewEvidenceSchemaV2.AnalysisOperation
  readonly retained: typeof Retained.Type
  readonly artifacts: ReadonlyArray<ReviewEvidenceSchemaV2.Artifact>
  readonly proofs: ReadonlyArray<ReviewEvidenceSchemaV2.Proof>
  readonly recipes: ReadonlyMap<string, typeof ReviewEvidenceSchemaV2.Recipe.Type>
}

export function read(bytes: Uint8Array, report: ReviewEngagementReportV2.Stored): ReviewEvidenceSchemaV2.Receipt {
  ReviewEvidenceSchemaV2.require(bytes.byteLength <= ReviewEvidenceSchemaV2.limits.receipt, "receipt exceeds byte bound")
  const receipt = Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.Receipt)(ReviewEvidenceSchemaV2.json(bytes), ReviewEvidenceSchemaV2.strict)
  ReviewEvidenceSchemaV2.require(Buffer.from(ReviewEvidenceSchemaV2.canonical(receipt)).equals(Buffer.from(bytes)), "receipt bytes are not canonical")
  const value = report.value
  ReviewEvidenceSchemaV2.require(value.status === "completed" && value.source && value.report, "receipt has no completed source report")
  ReviewEvidenceSchemaV2.require(receipt.reportID === value.reportID && receipt.inputHash === value.inputHash && receipt.sessionID === value.sessionID &&
    receipt.sourceSha256 === value.source.sha256 && ReviewEvidenceSchemaV2.same(receipt.budget, value.budget) && ReviewEvidenceSchemaV2.same(receipt.notExamined, value.notExamined),
  "receipt differs from its durable report")
  ReviewEvidenceSchemaV2.require(receipt.artifacts.length <= ReviewEvidenceSchemaV2.limits.artifacts && receipt.artifacts.reduce((sum, item) => sum + item.bytes, 0) <= ReviewEvidenceSchemaV2.limits.total &&
    receipt.operations.filter((operation) => operation.kind === "code").length <= ReviewEvidenceSchemaV2.limits.code, "receipt exceeds aggregate bounds")
  const sorted = receipt.artifacts.map((item) => item.artifactID)
  ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(sorted, [...new Set(sorted)].sort()), "artifact identities are not unique and sorted")
  ReviewEvidenceSchemaV2.require(new Set(receipt.operations.map((item) => item.operationID)).size === receipt.operations.length, "duplicate operation identity")
  ReviewEvidenceSchemaV2.require(new Set(receipt.hostProofs.map((item) => item.proofID)).size === receipt.hostProofs.length &&
    new Set(receipt.hostProofs.map((item) => item.invocationID)).size === receipt.hostProofs.length, "duplicate native invocation")
  const used = new Set<string>()
  const artifact = (id: string, kind: ReviewEvidenceSchemaV2.Artifact["kind"]) => {
    const found = receipt.artifacts.find((item) => item.artifactID === id)
    ReviewEvidenceSchemaV2.require(found && found.kind === kind, "artifact reference or kind differs")
    used.add(id)
    return found
  }
  for (const item of receipt.artifacts) {
    const { artifactID, ...descriptor } = item
    ReviewEvidenceSchemaV2.require(artifactID === ReviewEvidenceSchemaV2.digest(descriptor), "artifact descriptor digest differs")
    ReviewEvidenceSchemaV2.require(item.mime === (item.kind === "analyzer-stdout" || item.kind === "analyzer-stderr" ? "application/octet-stream"
      : item.kind === "citation" ? "text/plain" : "application/json"), "artifact MIME differs from its kind")
    if (item.kind !== "analyzer-stdout" && item.kind !== "analyzer-stderr") ReviewEvidenceSchemaV2.require(item.complete, "required producer body is incomplete")
  }
  let ordinal = 0
  const proofReferences = new Set<string>()
  for (const operation of receipt.operations) {
    ReviewEvidenceSchemaV2.require(operation.sourceSha256 === receipt.sourceSha256, "operation source differs")
    if (operation.kind === "code") {
      ReviewEvidenceSchemaV2.require(operation.operationID === ReviewEvidenceSchemaV2.codeID(receipt.inputHash, operation), "CODE operation digest differs")
      const decoded = operation.name === "code_query" ? Schema.decodeUnknownSync(CodeIndex.CodeQuery)(operation.input, ReviewEvidenceSchemaV2.strict)
        : operation.name === "code_search" ? Schema.decodeUnknownSync(CodeIndex.SearchInput)(operation.input, ReviewEvidenceSchemaV2.strict)
        : Schema.decodeUnknownSync(CodeIndex.LocateInput)(operation.input, ReviewEvidenceSchemaV2.strict)
      ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(decoded, operation.input), "CODE input differs from its schema")
      ReviewEvidenceSchemaV2.require(operation.nativeSettlement.status !== "completed" || operation.nativeSettlement.messageID === operation.assistantMessageID,
        "native settlement belongs to another assistant message")
      for (const [index, evidence] of [operation.evidence, ...operation.snapshots].entries()) {
        const descriptor = artifact(evidence.artifactID, index === 0 ? "code-result" : "code-snapshot")
        ReviewEvidenceSchemaV2.require(descriptor.uri === evidence.uri && descriptor.sha256 === evidence.sha256, "CODE retained reference differs")
      }
      ReviewEvidenceSchemaV2.require(operation.name === "code_locate" ? operation.snapshots.length <= 1 : operation.snapshots.length === 0, "unexpected CODE snapshots")
    } else {
      ReviewEvidenceSchemaV2.require(operation.ordinal === ++ordinal && operation.operationID === ReviewEvidenceSchemaV2.analysisID(receipt.inputHash, operation), "analysis admission order differs")
      artifact(operation.resultArtifactID, "analysis-result")
      artifact(operation.retainedArtifactID, "analysis-retained")
      artifact(operation.debtArtifactID, "analysis-debt")
      const invoked = receipt.hostProofs.filter((proof) => proof.analysisOperationID === operation.operationID)
      for (const check of operation.checks) {
        ReviewEvidenceSchemaV2.require(new Set(check.artifactIDs).size === check.artifactIDs.length && new Set(check.proofIDs).size === check.proofIDs.length,
          "duplicate check references")
        if (check.pack !== "oxlint") ReviewEvidenceSchemaV2.require(check.status === "not-run" && check.reason === "engagement-evidence-scope-unqualified" &&
          !check.workspaceExecuted && check.uri === undefined && check.artifactIDs.length === 0 && check.proofIDs.length === 0,
        "an unqualified analyzer produced evidence")
        for (const id of check.proofIDs) {
          const proof = invoked.find((proof) => proof.proofID === id)
          ReviewEvidenceSchemaV2.require(proof && check.pack === "oxlint", "check refers to another native analysis")
          proofReferences.add(id)
        }
        for (const id of check.artifactIDs) {
          const found = receipt.artifacts.find((item) => item.artifactID === id)
          ReviewEvidenceSchemaV2.require(found && found.kind.startsWith("analyzer-"), "check artifact is not native output")
          ReviewEvidenceSchemaV2.require(invoked.some((proof) => proofArtifacts(proof).includes(id)), "check artifact belongs to another invocation")
          used.add(id)
        }
        if (check.uri) ReviewEvidenceSchemaV2.require(check.artifactIDs.some((id) => receipt.artifacts.find((item) => item.artifactID === id)?.uri === check.uri), "check raw URI was not captured")
        if (check.status !== "pass" && check.status !== "fail") ReviewEvidenceSchemaV2.require(receipt.notExamined.some((gap) =>
          gap.item === `analyze:${check.id}` && gap.reason === (check.reason ?? check.status)), "producer limitation is missing from host coverage")
      }
    }
  }
  const analyses = receipt.operations.filter((operation) => operation.kind === "analysis")
  ReviewEvidenceSchemaV2.require(analyses.length > 0 && analyses.at(-1)?.operationID === receipt.finalAnalysisOperationID, "final analysis binding differs")
  for (const proof of receipt.hostProofs) {
    const { proofID, ...payload } = proof
    ReviewEvidenceSchemaV2.require(proofID === ReviewEvidenceSchemaV2.digest(payload) && proof.sourceSha256 === receipt.sourceSha256 && proofReferences.has(proofID), "unbound native proof")
    artifact(proof.inputsArtifactID, "analyzer-inputs")
    artifact(proof.configArtifactID, "analyzer-config")
    artifact(proof.recipeArtifactID, "analyzer-recipe")
    artifact(proof.pathMapArtifactID, "analyzer-path-map")
    for (const stream of ["stdout", "stderr"] as const) {
      const descriptor = artifact(stream === "stdout" ? proof.stdoutArtifactID : proof.stderrArtifactID, stream === "stdout" ? "analyzer-stdout" : "analyzer-stderr")
      const capture = proof.outcome[stream]
      ReviewEvidenceSchemaV2.require(capture.retainedBytes === descriptor.bytes && capture.bytes >= capture.retainedBytes &&
        capture.truncated === (capture.bytes > capture.retainedBytes), "native byte accounting differs")
      ReviewEvidenceSchemaV2.require(descriptor.complete === (!capture.truncated && !proof.outcome.overflow), "native output completeness differs")
    }
  }
  ReviewEvidenceSchemaV2.require(receipt.citations.length === value.citations.length, "citation count differs")
  for (const [index, citation] of receipt.citations.entries()) {
    const expected = value.citations[index]
    const descriptor = artifact(citation.artifactID, "citation")
    ReviewEvidenceSchemaV2.require(citation.uri === expected.uri && descriptor.uri === expected.uri && descriptor.sha256 === expected.sha256 &&
      descriptor.bytes === Buffer.byteLength(expected.text), "citation reference differs")
  }
  ReviewEvidenceSchemaV2.require(used.size === receipt.artifacts.length, "receipt has unused artifacts")
  return receipt
}

export function validate(receipt: ReviewEvidenceSchemaV2.Receipt, report: ReviewEngagementReportV2.Stored, bodies: ReviewEvidenceSchemaV2.Bodies) {
  const source = report.value.source
  const card = report.value.report
  ReviewEvidenceSchemaV2.require(source && card, "completed source report is absent")
  const body = bodyReader(receipt.artifacts, bodies)
  for (const descriptor of receipt.artifacts) body(descriptor.artifactID)
  const context = analysisContext({ ...receipt, source }, bodies)
  validateCode(receipt.operations, source, body)
  const final = context.final
  ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(final.routing.packs, card.routing.packs), "final analysis differs from report routing")
  for (const check of final.result.checks) {
    const actual = card.checks.find((item) => item.id === check.id && item.pack === check.pack && item.lane === check.lane)
    ReviewEvidenceSchemaV2.require(actual && actual.version === check.version && actual.workspaceExecuted === check.workspaceExecuted && actual.reason === check.reason &&
      (actual.status === check.status || check.status === "not-run" && actual.status === "check-unavailable"), "final report check differs from host analysis")
  }
  for (const [index, citation] of receipt.citations.entries())
    ReviewEvidenceSchemaV2.require(Buffer.from(body(citation.artifactID)).equals(Buffer.from(report.value.citations[index].text)), "citation bytes differ")
  for (const finding of card.findings) if (finding.evidence.kind === "tool") qualifiedTool(context, finding)
  return context
}

export function validateCode(operations: ReviewEvidenceSchemaV2.ReceiptV1["operations"],
  source: ReviewEngagementReportV2.Source, body: (id: string) => Uint8Array) {
  const allowed = new Map(source.files.map((file) => [file.path, file]))
  const captured = (value: typeof Source.Type) => ReviewEvidenceSchemaV2.require(value.commit === source.commit && value.scope.sha256 === source.sha256 &&
    ReviewEvidenceSchemaV2.same(value.scope.files, source.files.map((file) => file.path)), "CODE captured source scope differs")
  for (const operation of operations) {
    if (operation.kind === "code") {
      const result = Schema.decodeUnknownSync(CodeBody)(ReviewEvidenceSchemaV2.json(body(operation.evidence.artifactID)), ReviewEvidenceSchemaV2.strict)
      captured(result.source)
      validatePaths(result.result, allowed)
      for (const evidence of operation.snapshots) {
        const snapshot = Schema.decodeUnknownSync(Snapshot)(ReviewEvidenceSchemaV2.json(body(evidence.artifactID)), ReviewEvidenceSchemaV2.strict)
        captured(snapshot.source)
        ReviewEvidenceSchemaV2.require(snapshot.snapshot === result.snapshot, "locate snapshot differs from the enclosing capture")
      }
    }
  }
}

/** The same immutable analysis/proof boundary is available before a final card exists. */
export function analysisContext(input: AnalysisInput, bodies: ReviewEvidenceSchemaV2.Bodies): AnalysisContext {
  const allowed = new Map(input.source.files.map((file) => [file.path, file]))
  const body = bodyReader(input.artifacts, bodies)
  const analyses = new Map<string, { operation: ReviewEvidenceSchemaV2.AnalysisOperation;
    result: ReviewEvidenceSchemaV2.AnalysisResult; retained: typeof Retained.Type }>()
  let ordinal = 0
  for (const operation of input.operations) {
    if (operation.kind !== "analysis") continue
    ReviewEvidenceSchemaV2.require(operation.sourceSha256 === input.source.sha256 && operation.ordinal === ++ordinal &&
      operation.operationID === ReviewEvidenceSchemaV2.analysisID(input.inputHash, operation) && !analyses.has(operation.operationID),
    "analysis admission identity differs")
    const resultBytes = body(operation.resultArtifactID, "analysis-result")
    const wrapped = Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.AnalysisResult)(ReviewEvidenceSchemaV2.json(resultBytes), ReviewEvidenceSchemaV2.strict)
    ReviewEvidenceSchemaV2.require(Buffer.from(ReviewEvidenceSchemaV2.canonical(wrapped)).equals(Buffer.from(resultBytes)) && wrapped.operationID === operation.operationID &&
      ReviewEvidenceSchemaV2.digest(wrapped.routing) === operation.routingDigest && ReviewEvidenceSchemaV2.digest(wrapped.catalog) === operation.catalogDigest,
    "analysis routing or catalog differs")
    ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(wrapped.result.checks, operation.checks.map(({ artifactIDs, proofIDs, ...check }) => check)), "analysis checks differ")
    const retained = Schema.decodeUnknownSync(Retained)(ReviewEvidenceSchemaV2.json(body(operation.retainedArtifactID, "analysis-retained")), ReviewEvidenceSchemaV2.strict)
    const debt = Schema.decodeUnknownSync(Schema.Array(ReviewItem.ToolItem))(ReviewEvidenceSchemaV2.json(body(operation.debtArtifactID, "analysis-debt")), ReviewEvidenceSchemaV2.strict)
    ReviewEvidenceSchemaV2.require(retained.total === wrapped.result.retained.total && debt.length === wrapped.result.debt.total &&
      ReviewEvidenceSchemaV2.same(retained.unread, wrapped.result.retained.unread), "analysis retention counts differ")
    ReviewEvidenceSchemaV2.require(input.artifacts.find((item) => item.artifactID === operation.retainedArtifactID)?.uri === wrapped.result.retained.uri &&
      input.artifacts.find((item) => item.artifactID === operation.debtArtifactID)?.uri === wrapped.result.debt.uri, "analysis retained reference differs")
    for (const item of [...Object.values(wrapped.result.items).flat(), ...retained.items, ...debt])
      ReviewEvidenceSchemaV2.require(allowed.has(item.path), "analysis item escapes captured files")
    analyses.set(operation.operationID, { operation, result: wrapped, retained })
  }
  const final = analyses.get(input.finalAnalysisOperationID)
  ReviewEvidenceSchemaV2.require(final && [...analyses.keys()].at(-1) === input.finalAnalysisOperationID, "final analysis binding differs")
  const seen = new Set<string>()
  const invocations = new Set<string>()
  const recipes = new Map<string, typeof ReviewEvidenceSchemaV2.Recipe.Type>()
  for (const proof of input.hostProofs) {
    const { proofID, ...payload } = proof
    const analysis = analyses.get(proof.analysisOperationID)
    ReviewEvidenceSchemaV2.require(analysis && proof.sourceSha256 === input.source.sha256 && proofID === ReviewEvidenceSchemaV2.digest(payload) &&
      !seen.has(proofID) && !invocations.has(proof.invocationID), "native proof identity differs")
    seen.add(proofID)
    invocations.add(proof.invocationID)
    ReviewEvidenceSchemaV2.require(analysis.operation.checks.some((check) => check.pack === "oxlint" && check.proofIDs.includes(proofID)), "native proof has no captured check")
    for (const [id, kind] of [[proof.inputsArtifactID, "analyzer-inputs"], [proof.configArtifactID, "analyzer-config"],
      [proof.recipeArtifactID, "analyzer-recipe"], [proof.pathMapArtifactID, "analyzer-path-map"],
      [proof.stdoutArtifactID, "analyzer-stdout"], [proof.stderrArtifactID, "analyzer-stderr"]] as const) body(id, kind)
    for (const stream of ["stdout", "stderr"] as const) {
      const descriptor = input.artifacts.find((item) => item.artifactID === (stream === "stdout" ? proof.stdoutArtifactID : proof.stderrArtifactID))
      const capture = proof.outcome[stream]
      ReviewEvidenceSchemaV2.require(descriptor && capture.retainedBytes === descriptor.bytes && capture.bytes >= capture.retainedBytes &&
        capture.truncated === (capture.bytes > capture.retainedBytes) && descriptor.complete === (!capture.truncated && !proof.outcome.overflow),
      "native output byte accounting differs")
    }
    recipes.set(proof.proofID, validateProof(proof, body, allowed, analysis.result.catalog))
    if (proof.outcome.timedOut || proof.outcome.overflow || proof.outcome.memoryExceeded || proof.outcome.failure)
      ReviewEvidenceSchemaV2.require(analysis.result.result.checks.every((check) => check.pack !== "oxlint" || check.status !== "pass"),
        "native failure was represented as a passing check")
  }
  return { source: input.source, final: final.result, operation: final.operation, retained: final.retained,
    artifacts: input.artifacts, proofs: input.hostProofs, recipes }
}

/** A model URI qualifies only through the observed final analysis, item and native invocation. */
export function qualifiedTool(context: AnalysisContext, finding: Pick<NonNullable<ReviewEngagementReportV2.Result["report"]>["findings"][number],
  "path" | "line" | "class" | "evidence">): ReviewEvidenceSchemaV2.Proof {
  const evidence = finding.evidence
  const check = evidence.kind === "tool" ? context.final.result.checks.find((item) =>
    item.pack === evidence.pack && item.version === evidence.version && item.uri === evidence.uri) : undefined
  const item = evidence.kind === "tool" ? [...Object.values(context.final.result.items).flat(), ...context.retained.items].find((item) =>
    item.pack === evidence.pack && item.rule === evidence.rule && item.path === finding.path && item.line === finding.line && item.class === finding.class) : undefined
  const proof = context.proofs.find((proof) => proof.analysisOperationID === context.operation.operationID && evidence.kind === "tool" &&
    context.artifacts.find((artifact) => artifact.artifactID === proof.stdoutArtifactID)?.uri === evidence.uri)
  if (evidence.kind !== "tool" || !evidence.uri || !check || !item || !proof)
    throw new Tool.Failure({ message: "engagement-report-invalid: tool evidence has no qualified host observation",
      metadata: { reason: "engagement-report-invalid" } })
  return proof
}

function bodyReader(artifacts: ReadonlyArray<ReviewEvidenceSchemaV2.Artifact>, bodies: ReviewEvidenceSchemaV2.Bodies) {
  return (id: string, kind?: ReviewEvidenceSchemaV2.Artifact["kind"]) => {
    const bytes = bodies.get(id)
    const descriptor = artifacts.find((item) => item.artifactID === id)
    ReviewEvidenceSchemaV2.require(bytes && descriptor && (kind === undefined || descriptor.kind === kind) &&
      bytes.byteLength === descriptor.bytes && ReviewEvidenceSchemaV2.hash(bytes) === descriptor.sha256, "required body is unavailable or corrupt")
    return bytes
  }
}

function validateProof(proof: ReviewEvidenceSchemaV2.Proof, body: (id: string) => Uint8Array,
  allowed: ReadonlyMap<string, NonNullable<ReviewEngagementReportV2.Result["source"]>["files"][number]>,
  catalog: ReviewEvidenceSchemaV2.AnalysisResult["catalog"]) {
  const inputBytes = body(proof.inputsArtifactID)
  const inputs = Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.Inputs)(ReviewEvidenceSchemaV2.json(inputBytes), ReviewEvidenceSchemaV2.strict)
  const recipeBytes = body(proof.recipeArtifactID)
  const recipe = Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.Recipe)(ReviewEvidenceSchemaV2.json(recipeBytes), ReviewEvidenceSchemaV2.strict)
  ReviewEvidenceSchemaV2.require(Buffer.from(ReviewEvidenceSchemaV2.canonical(inputs)).equals(Buffer.from(inputBytes)) &&
    Buffer.from(ReviewEvidenceSchemaV2.canonical(recipe)).equals(Buffer.from(recipeBytes)), "native manifest is not canonical")
  ReviewEvidenceSchemaV2.require(inputs.sourceSha256 === proof.sourceSha256 && recipe.sourceSha256 === proof.sourceSha256 &&
    recipe.analysisOperationID === proof.analysisOperationID && recipe.invocationID === proof.invocationID && recipe.side === proof.side &&
    ReviewEvidenceSchemaV2.same(recipe.runtime, proof.runtime), "native recipe identity differs")
  const paths = inputs.files.map((file) => file.path)
  ReviewEvidenceSchemaV2.require(paths.length > 0 && ReviewEvidenceSchemaV2.same(paths, [...new Set(paths)].sort()), "native input paths are not unique and sorted")
  for (const file of inputs.files) {
    const bytes = Buffer.from(file.data, "base64")
    const captured = allowed.get(file.path)
    ReviewEvidenceSchemaV2.require(captured && /\.(?:[cm]?[jt]sx?)$/i.test(file.path) && captured.oid === file.oid && captured.size === file.bytes &&
      bytes.byteLength === file.bytes && bytes.toString("base64") === file.data && ReviewEvidenceSchemaV2.hash(bytes) === file.sha256 &&
      createHash(file.oid.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex") === file.oid,
    "native input bytes differ from captured Git")
  }
  ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(recipe.files, inputs.files.map(({ path, oid, sha256, bytes }) => ({ path, oid, sha256, bytes }))), "recipe files differ from staged inputs")
  const config = body(proof.configArtifactID)
  ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.hash(config) === recipe.config.sha256 && config.byteLength === recipe.config.bytes, "native config digest differs")
  const rules = [{ id: "eslint(no-debugger)", config: "eslint/no-debugger" },
    { id: "typescript(no-explicit-any)", config: "typescript/no-explicit-any" }].filter((rule) =>
    !catalog.rules.some((entry) => entry.pack === "oxlint" && entry.status === "dropped" && (entry.rule === "*" || entry.rule === rule.id)))
  ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(recipe.rules, rules.map((rule) => rule.id)) &&
    ReviewEvidenceSchemaV2.same(ReviewEvidenceSchemaV2.json(config), { plugins: ["eslint", "typescript"],
      rules: Object.fromEntries(rules.map((rule) => [rule.config, "error"])) }), "native rules or config differ from the qualified catalog")
  const mapping = Schema.decodeUnknownSync(PathMap)(ReviewEvidenceSchemaV2.json(body(proof.pathMapArtifactID)), ReviewEvidenceSchemaV2.strict)
  ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(mapping.paths, paths.map((path) => ({ file: path, path }))), "native path map differs")
  const expected = [{ kind: "runtime" }, { kind: "literal", value: "--config" }, { kind: "config", path: ".host/oxlint.json" },
    ...["--disable-nested-config", "--no-ignore", "--allow", "all", ...rules.flatMap((rule) => ["--deny", rule.config]),
      "--format", "sarif", "--"].map((value) => ({ kind: "literal", value })), ...paths.map((path) => ({ kind: "source", path }))]
  ReviewEvidenceSchemaV2.require(ReviewEvidenceSchemaV2.same(recipe.invocation.argv, expected), "native argv differs from the qualified recipe")
  ReviewEvidenceSchemaV2.require(proof.outcome.stdout.retainedBytes <= recipe.limits.maxBytes &&
    proof.outcome.stderr.retainedBytes <= recipe.limits.maxBytes, "native capture exceeded its recipe bound")
  return recipe
}

function validatePaths(value: unknown, allowed: ReadonlyMap<string, unknown>) {
  if (Array.isArray(value)) { for (const item of value) validatePaths(item, allowed); return }
  if (typeof value !== "object" || value === null) return
  for (const [key, item] of Object.entries(value)) {
    if (key === "path" && typeof item === "string") ReviewEvidenceSchemaV2.require(item === "." || allowed.has(item) ||
      [...allowed.keys()].some((file) => file.startsWith(item + "/")), "CODE result path escapes captured scope")
    validatePaths(item, allowed)
  }
}

export function proofArtifacts(proof: ReviewEvidenceSchemaV2.Proof) {
  return [proof.inputsArtifactID, proof.configArtifactID, proof.recipeArtifactID,
    proof.pathMapArtifactID, proof.stdoutArtifactID, proof.stderrArtifactID]
}
