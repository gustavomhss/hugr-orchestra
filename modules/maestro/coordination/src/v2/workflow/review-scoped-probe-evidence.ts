export * as ReviewScopedProbeEvidenceV2 from "./review-scoped-probe-evidence"

import { createHash } from "node:crypto"
import { Schema } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import { PositiveInt } from "@orchestra/schema/schema"
import { ReviewScopedTypecheck } from "@orchestra/core/review-toolkit/scoped-typecheck"
import type { ReviewResultV2 } from "../governance/review-result"
import { ReviewEngagementReportV2 } from "./review-engagement-report"

const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const GitOID = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/))
const strict = { onExcessProperty: "error" } as const
const failure = (reason: string) => new Tool.Failure({ message: `engagement-evidence-corrupt: ${reason}`, metadata: { reason: "engagement-evidence-corrupt" } })

export const Reference = Schema.Struct({ proofID: Digest, artifactID: Digest })
export type Reference = typeof Reference.Type
export const Proof = Schema.Struct({
  proofID: Digest, schema: Schema.Literal("review-scoped-typecheck-proof-v1"), candidate: Schema.NonEmptyString,
  sourceSha256: Digest, path: Schema.NonEmptyString, oid: GitOID,
  input: Schema.Struct({ encoding: Schema.Literal("base64"), data: Schema.String, sha256: Digest, bytes: PositiveInt }),
  status: Schema.Literals(["pass", "fail"]), exitCode: Schema.Int, stdout: Schema.String, stderr: Schema.String,
  recipe: Schema.Struct({ template: Schema.Literal("typescript-scoped-typecheck-v1"), version: Schema.Literal("6.0.3"),
    target: Schema.Literal("linux-x64"), runtimeSha256: Digest, compilerSha256: Digest, configSha256: Digest }),
  diagnostics: Schema.Array(Schema.Struct({ line: PositiveInt, column: PositiveInt, code: Schema.String })),
})
export type Proof = typeof Proof.Type
export const command = "tsc --noEmit (scoped)"
export const uri = (proofID: string) => `review-scoped-probe:${proofID}`

export function make(candidate: string, source: ReviewEngagementReportV2.Source, path: string, bytes: Uint8Array,
  result: ReviewScopedTypecheck.Observation): Proof {
  const file = source.files.find((entry) => entry.path === path)
  if (!file) throw failure("scoped probe path is not in source")
  const value = { schema: "review-scoped-typecheck-proof-v1" as const, candidate, sourceSha256: source.sha256, path,
    oid: file.oid, input: { encoding: "base64" as const, data: Buffer.from(bytes).toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
    status: result.status, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr,
    recipe: result.recipe, diagnostics: result.diagnostics }
  const proof = { ...value, proofID: ReviewEngagementReportV2.digest(value) }
  return read(Buffer.from(ReviewEngagementReportV2.canonical(proof)), source, proof.proofID)
}

export function read(bytes: Uint8Array, source: ReviewEngagementReportV2.Source, expectedProofID: string): Proof {
  if (bytes.byteLength > 512 * 1024) throw failure("scoped proof exceeds byte bound")
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  const proof = Schema.decodeUnknownSync(Schema.fromJsonString(Proof))(text, strict)
  if (text !== ReviewEngagementReportV2.canonical(proof)) throw failure("scoped proof is not canonical")
  const { proofID, ...value } = proof
  if (proofID !== expectedProofID || proofID !== ReviewEngagementReportV2.digest(value) || source.sha256 !== proof.sourceSha256 ||
    proof.recipe.configSha256 !== ReviewScopedTypecheck.configSha256)
    throw failure("scoped proof identity mismatch")
  ReviewEngagementReportV2.validateSource(source)
  const file = source.files.filter((entry) => entry.path === proof.path)
  const input = Buffer.from(proof.input.data, "base64")
  if (!proof.path.endsWith(".ts") || proof.path.endsWith(".d.ts") || input.byteLength > 65536 || file.length !== 1 || file[0].oid !== proof.oid || file[0].size !== input.byteLength ||
    input.toString("base64") !== proof.input.data || proof.input.bytes !== input.byteLength ||
    createHash("sha256").update(input).digest("hex") !== proof.input.sha256 ||
    createHash(proof.oid.length === 40 ? "sha1" : "sha256").update(`blob ${input.byteLength}\0`).update(input).digest("hex") !== proof.oid)
    throw failure("scoped proof input mismatch")
  const diagnostics = ReviewScopedTypecheck.diagnostics(proof.stdout, proof.exitCode, proof.stderr)
  if (!diagnostics || ReviewEngagementReportV2.canonical(diagnostics) !== ReviewEngagementReportV2.canonical(proof.diagnostics) ||
    proof.status !== (proof.exitCode === 0 ? "pass" : "fail")) throw failure("scoped proof diagnostics mismatch")
  return proof
}

export function qualify(proofs: readonly Proof[], finding: ReviewResultV2.Finding): Proof {
  const evidence = finding.evidence
  if (evidence.kind !== "probe" || evidence.option !== "probe:typecheck" || evidence.command !== command || evidence.result !== "fail" || finding.class !== "logic.contract")
    throw failure("finding does not name a scoped typecheck probe")
  const matches = proofs.filter((proof) => evidence.uri === uri(proof.proofID) && proof.candidate === finding.id &&
    proof.path === finding.path && proof.status === "fail" && proof.diagnostics.some((item) =>
      item.line >= finding.line && item.line <= (finding.endLine ?? finding.line)))
  if (matches.length !== 1) throw failure("finding lacks a unique scoped typecheck proof")
  return matches[0]
}

export function observe(inputHash: string, findingID: string, prior: Proof, current: Proof) {
  if (prior.status !== "fail" || prior.candidate !== findingID || current.candidate !== findingID || prior.path !== current.path ||
    ReviewEngagementReportV2.canonical(prior.recipe) !== ReviewEngagementReportV2.canonical(current.recipe)) return undefined
  const value = { kind: "scoped-typecheck" as const, findingID, priorProofID: prior.proofID, proofID: current.proofID,
    result: current.status === "pass" ? "zero" as const : "nonzero" as const }
  return { ...value, observationID: ReviewEngagementReportV2.digest({ schema: "review-fix-observation-v1", inputHash, ...value }) }
}
