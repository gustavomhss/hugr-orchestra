export * as ReviewVariantSearchV2 from "./review-variant-search"

import { Option, Schema } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import type { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"
import { ReviewVariantSchemaV2 } from "./review-variant-schema"

const Count = ReviewVariantSchemaV2.Count
const Positive = ReviewVariantSchemaV2.Positive
const Text = Schema.NonEmptyString
const Range = Schema.Struct({ path: Text, startLine: Positive, endLine: Positive })
const Symbol = Schema.Struct({ symbol: Text, name: Text, kind: Text, range: Range,
  nameLine: Positive, exported: Schema.Boolean })
const Match = Schema.Struct({ path: Text, line: Positive, text: Schema.String,
  before: Schema.optional(Schema.Array(Schema.String)), after: Schema.optional(Schema.Array(Schema.String)),
  enclosing: Schema.optional(Symbol) })
const Result = Schema.Struct({ matches: Schema.Array(Match), next: Schema.optional(Count), basis: Schema.Struct({
  basis: Schema.Struct({ commit: Text, dirtyDigest: Schema.optional(Text), shards: Schema.Array(Schema.Struct({
    id: Text, language: Text, project: Text, indexer: Text, version: Text })) }),
  execution: Schema.Struct({ op: Text, ms: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
    semantic: Schema.optional(Schema.Literals(["absent", "present"])) }),
  coverage: Schema.Struct({ documents: Count, skipped: Schema.Array(Schema.Struct({ path: Text, reason: Text })),
    languagesMissing: Schema.Array(Text), opaqueSites: Count, complete: Schema.Boolean,
    ignoreRespected: Schema.optional(Schema.Boolean), binariesSkipped: Schema.optional(Count), discarded: Schema.optional(Count) }),
  freshness: Schema.Literals(["fresh", "stale", "dirty-overlay"]), bounds: Schema.Struct({ limit: Positive, truncated: Schema.Boolean }),
}) })
const Body = Schema.Struct({ source: Schema.Struct({ worktree: Text, tree: ReviewVariantSchemaV2.Oid,
  commit: ReviewVariantSchemaV2.Oid, scope: Schema.Struct({ sha256: ReviewVariantSchemaV2.Digest, files: Schema.Array(Text) }) }), result: Result })

export type Search = { readonly input: CodeIndex.SearchInput; readonly result: CodeIndex.SearchResult;
  readonly fullAuthority: boolean; readonly complete: boolean }
export type Capture = { readonly operation: ReviewEvidenceSchemaV2.CodeOperation; readonly body: Uint8Array }
export type Anchor = Pick<ReviewVariantSchemaV2.SeedFinding, "class" | "path" | "line">
export type Accounting = { readonly rawMatches: number; readonly distinctMatches: number;
  readonly excluded: ReviewVariantSchemaV2.AcceptedSearch["excluded"];
  readonly matches: ReadonlyArray<ReviewVariantSchemaV2.MatchBase> }

/** Decode the original retained body; an invalid trusted capture is never an absence claim. */
export function inspectSearch(operation: ReviewEvidenceSchemaV2.CodeOperation, bytes: Uint8Array,
  source: ReviewEngagementEvidenceV2.Prepared): Search {
  ReviewEvidenceSchemaV2.require(operation.name === "code_search" && operation.sourceSha256 === source.sha256 &&
    ReviewEvidenceSchemaV2.hash(bytes) === operation.evidence.sha256, "variant search capture identity differs")
  const input = Option.getOrUndefined(Schema.decodeUnknownOption(CodeIndex.SearchInput)(operation.input, ReviewVariantSchemaV2.strict))
  const body = Option.getOrUndefined(Schema.decodeUnknownOption(Body)(readJSON(bytes), ReviewVariantSchemaV2.strict))
  ReviewEvidenceSchemaV2.require(input && body, "variant search capture does not decode")
  const result = body.result
  ReviewEvidenceSchemaV2.require(body.source.commit === source.commit && body.source.scope.sha256 === source.sha256 &&
    ReviewEvidenceSchemaV2.same(body.source.scope.files, source.files.map((file) => file.path)) &&
    result.basis.basis.commit === source.commit, "variant search captured source differs")
  const files = new Set(source.files.map((file) => file.path))
  for (const match of result.matches) {
    ReviewEvidenceSchemaV2.require(files.has(match.path) && (match.before?.length ?? 0) <= (input.context ?? 0) &&
      (match.after?.length ?? 0) <= (input.context ?? 0), "variant search match escapes its captured authority")
    if (match.enclosing) ReviewEvidenceSchemaV2.require(files.has(match.enclosing.range.path) &&
      match.enclosing.range.endLine >= match.enclosing.range.startLine, "variant search symbol escapes captured authority")
  }
  ReviewEvidenceSchemaV2.require(result.matches.length <= result.basis.bounds.limit &&
    result.basis.bounds.limit === (input.limit ?? 50) &&
    (result.next === undefined || result.next > (input.offset ?? 0)), "variant search page counters differ")
  const fullAuthority = ReviewEvidenceSchemaV2.same(input.paths ?? [], ["**"]) && (input.offset ?? 0) === 0 &&
    input.limit === 200 && (input.context ?? 0) === 0
  const complete = result.basis.coverage.complete && !result.basis.bounds.truncated && result.next === undefined &&
    result.basis.coverage.skipped.length === 0 && result.basis.coverage.binariesSkipped === 0 &&
    result.basis.execution.op === "code_search" && result.basis.freshness === "fresh" &&
    result.basis.basis.dirtyDigest === undefined && result.basis.bounds.limit === 200
  return { input, result, fullAuthority, complete }
}

function readJSON(bytes: Uint8Array): unknown {
  try { return ReviewEvidenceSchemaV2.json(bytes) }
  catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) throw ReviewEvidenceSchemaV2.failure("corrupt", "variant search body is not lossless JSON")
    throw error
  }
}

/** Steps 1–4 use only actual native attempt identities and linked, immutable captures. */
export function witness(input: { readonly namespace: string; readonly inputHash: string;
  readonly source: ReviewEngagementEvidenceV2.Prepared; readonly ordinal: ReviewVariantSchemaV2.Ordinal;
  readonly seed: ReviewVariantSchemaV2.SeedFinding; readonly attempts: readonly ReviewVariantSchemaV2.NativeSearchAttempt[];
  readonly captures: readonly Capture[] }):
  | { readonly status: "accepted"; readonly operation: ReviewEvidenceSchemaV2.CodeOperation; readonly search: Search }
  | ReviewVariantSchemaV2.RejectedSearch {
  const searches = new Map<string, { operation: ReviewEvidenceSchemaV2.CodeOperation; search: Search }>()
  for (const capture of input.captures) {
    if (capture.operation.name !== "code_search") continue
    ReviewEvidenceSchemaV2.require(!searches.has(capture.operation.operationID) &&
      capture.operation.operationID === ReviewEvidenceSchemaV2.codeID(input.inputHash, capture.operation), "variant search capture was repeated or rebound")
    searches.set(capture.operation.operationID, { operation: capture.operation, search: inspectSearch(capture.operation, capture.body, input.source) })
  }
  const ids = new Set<string>()
  for (const attempt of input.attempts) {
    ReviewEvidenceSchemaV2.require(attempt.sourceSha256 === input.source.sha256 &&
      attempt.attemptID === ReviewEvidenceSchemaV2.codeID(input.inputHash, attempt) && !ids.has(attempt.attemptID), "variant native attempt identity differs")
    ids.add(attempt.attemptID)
    const capture = searches.get(attempt.attemptID)
    ReviewEvidenceSchemaV2.require(attempt.operationID === (capture ? attempt.attemptID : undefined), "variant attempt capture reference differs")
  }
  const reject = (reason: ReviewVariantSchemaV2.RejectedSearch["reason"], detail?: ReviewVariantSchemaV2.StageInvalidDetail,
    operationID?: string): ReviewVariantSchemaV2.RejectedSearch => ({ status: "rejected", reason,
    ...(detail ? { detail } : {}), ...(operationID ? { operationID } : {}) })
  if (input.attempts.length !== 1) return reject("stage-invalid", "search-attempt-count")
  const attempt = input.attempts[0]
  if (attempt.providerExecuted) return reject("stage-invalid", "provider-executed-search", attempt.operationID)
  const expected = ReviewVariantSchemaV2.childID(input.namespace, `variant:${input.ordinal}:proposal`, "lens")
  if (attempt.sessionID !== expected) return reject("stage-invalid", "search-stage-mismatch", attempt.operationID)
  const capture = searches.get(attempt.attemptID)
  if (attempt.status !== "completed" || !capture || capture.operation.nativeSettlement.status !== "completed")
    return reject("search-unavailable", undefined, attempt.operationID)
  ReviewEvidenceSchemaV2.require(capture.operation.nativeSettlement.messageID === attempt.assistantMessageID,
    "variant native settlement belongs to another assistant")
  if (!capture.search.fullAuthority) return reject("stage-invalid", "search-input-scope", attempt.operationID)
  if (!capture.search.complete) return reject("search-incomplete", undefined, attempt.operationID)
  if (!capture.search.result.matches.some((match) => match.path === input.seed.path && match.line === input.seed.line))
    return reject("seed-not-matched", undefined, attempt.operationID)
  return { status: "accepted", ...capture }
}

/** Preserve the full location denominator before looking at the proposal or a verifier. */
export function account(input: { readonly source: ReviewEngagementEvidenceV2.Prepared; readonly defectClass: string;
  readonly seed: Anchor; readonly confirmed: readonly Anchor[]; readonly processed: ReadonlySet<string>; readonly search: Search }): Accounting {
  const distinct = new Map<string, ReviewVariantSchemaV2.MatchBase>()
  for (const match of input.search.result.matches) {
    const file = input.source.files.find((file) => file.path === match.path)
    ReviewEvidenceSchemaV2.require(file, "variant match has no captured file")
    const matchID = ReviewVariantSchemaV2.matchID({ sourceSha256: input.source.sha256,
      defectClass: input.defectClass, path: match.path, line: match.line })
    distinct.set(matchID, { matchID, path: match.path, oid: file.oid, line: match.line })
  }
  const matches: ReviewVariantSchemaV2.MatchBase[] = []
  const excluded: ReviewVariantSchemaV2.AcceptedSearch["excluded"][number][] = []
  for (const match of [...distinct.values()].sort(rankLocation)) {
    const reason = match.path === input.seed.path && match.line === input.seed.line ? "seed"
      : input.confirmed.some((finding) => finding.class === input.defectClass && finding.path === match.path && finding.line === match.line) ? "already-confirmed"
        : input.processed.has(match.matchID) ? "processed" : undefined
    if (reason) excluded.push({ matchID: match.matchID, path: match.path, line: match.line, reason })
    else matches.push(match)
  }
  return { rawMatches: input.search.result.matches.length, distinctMatches: distinct.size, excluded, matches }
}

export function parseProposal(text: string | undefined, seed: Pick<ReviewVariantSchemaV2.SeedFinding, "id">,
  matches: readonly ReviewVariantSchemaV2.MatchBase[]): { readonly proposal?: ReviewVariantSchemaV2.Proposal;
    readonly detail?: ReviewVariantSchemaV2.StageInvalidDetail } {
  const block = text === undefined ? undefined : /^\s*```review-variant[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(text)?.[1]
  if (block === undefined) return { detail: "proposal-return" }
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(block)
  const proposal = Option.getOrUndefined(Option.flatMap(json, (value) =>
    Schema.decodeUnknownOption(ReviewVariantSchemaV2.Proposal)(value, ReviewVariantSchemaV2.strict)))
  if (!proposal) return { detail: "proposal-return" }
  if (proposal.seedFindingID !== seed.id) return { proposal, detail: "proposal-seed" }
  const keys = new Set<string>()
  for (const candidate of proposal.candidates) {
    const key = JSON.stringify([candidate.path, candidate.line])
    const end = candidate.endLine ?? candidate.line
    if (keys.has(key) || end < candidate.line || end - candidate.line >= 400 ||
      !matches.some((match) => match.path === candidate.path && match.line === candidate.line)) return { proposal, detail: "proposal-candidates" }
    keys.add(key)
  }
  return { proposal }
}

const severity = { P0: 0, P1: 1, P2: 2, P3: 3 } as const
const order = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
export const rankLocation = (left: { readonly path: string; readonly line: number }, right: { readonly path: string; readonly line: number }) =>
  order(left.path, right.path) || left.line - right.line
export const rankSeed = (left: ReviewVariantSchemaV2.Seed, right: ReviewVariantSchemaV2.Seed) =>
  severity[left.finding.severity] - severity[right.finding.severity] || rankLocation(left.finding, right.finding) || order(left.finding.id, right.finding.id)
export const rankCandidate = (left: { readonly matchID: string; readonly candidate: ReviewVariantSchemaV2.Candidate },
  right: { readonly matchID: string; readonly candidate: ReviewVariantSchemaV2.Candidate }) =>
  severity[left.candidate.severity] - severity[right.candidate.severity] || rankLocation(left.candidate, right.candidate) || order(left.matchID, right.matchID)

/** The first five stops are evaluated before this accounting-only suffix. */
export function decision(counts: ReviewVariantSchemaV2.Counts, ordinal: ReviewVariantSchemaV2.Ordinal,
  confirmed: readonly ReviewVariantSchemaV2.Seed[]): ReviewVariantSchemaV2.Decision {
  if (counts.questions || counts.notExamined) return { type: "stop", reason: "verification-incomplete" }
  if (!counts.matches) return { type: "stop", reason: "no-new-matches" }
  if (counts.noise * 2 >= counts.matches) return { type: "stop", reason: "half-noise" }
  if (ordinal === 3) return { type: "stop", reason: "generation-limit" }
  const next = [...confirmed].sort(rankSeed)[0]
  ReviewEvidenceSchemaV2.require(next, "continuing variant generation has no newly confirmed seed")
  return { type: "continue", nextSeed: { seedID: next.seedID, findingID: next.finding.id } }
}
