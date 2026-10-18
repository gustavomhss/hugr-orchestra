export * as Research from "./research"

import { Effect, Schema } from "effect"
import { Capability } from "./capability"
import { Project } from "./project"
import { SessionID } from "./session-id"
import { AbsolutePath, NonNegativeInt, PositiveInt, optional, statics } from "./schema"
import { ascending } from "./identifier"

function recordID<const Name extends string>(name: Name, prefix: string) {
  return Schema.String.check(Schema.isPattern(new RegExp(`^${prefix}[0-9A-Za-z]{26}(?![\\s\\S])`))).pipe(
    Schema.brand(name),
    statics((schema) => ({ create: () => schema.make(prefix + ascending()) })),
  )
}

function struct<const Fields extends Schema.Struct.Fields>(name: string, fields: Fields) {
  return Schema.Struct(fields).annotate({ identifier: name, parseOptions: { onExcessProperty: "error" } })
}

const text = (limit: number) => Schema.NonEmptyString.check(Schema.isMaxLength(limit))
const list = <S extends Schema.Top>(schema: S, limit = 32) => Schema.Array(schema).check(Schema.isMaxLength(limit))
export const QuestionID = recordID("Research.QuestionID", "rque_")
export const FindingID = recordID("Research.FindingID", "rfnd_")
export const RelationID = recordID("Research.RelationID", "rrel_")
export const DocumentID = recordID("Research.DocumentID", "rdoc_")
export const RecordID = Schema.Union([QuestionID, FindingID, RelationID])
export const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/))
export const Profile = Schema.Literals(["locate", "understand", "investigate", "evaluate", "research"])
export const Depth = Schema.Literals(["quick", "focused", "deep"])
export type Depth = typeof Depth.Type
export const Modality = Schema.Literals(["exploratory", "analytical", "comparative", "evidence", "applied", "opportunities"])
export const Genre = Schema.Literals(["answer", "map", "explanation", "comparison", "evidence-review", "opportunity"])
export const Representation = Schema.Literals(["received", "text", "markdown", "html", "structured-json"])

export const Limits = Object.freeze({
  sourceBytes: 5 * 1024 * 1024,
  eventBytes: 64 * 1024,
  documentBytes: 256 * 1024,
  pageBytes: 16 * 1024,
})

/** Owner-approved dispatch allowance per effort tier. Provider calls include context maintenance. */
export const Tiers = Object.freeze({
  quick: Object.freeze({ providerCalls: 24, toolCalls: 64, capturedBytes: 64 * 1024 * 1024, deadlineSeconds: 600 }),
  focused: Object.freeze({ providerCalls: 48, toolCalls: 128, capturedBytes: 128 * 1024 * 1024, deadlineSeconds: 1200 }),
  deep: Object.freeze({ providerCalls: 96, toolCalls: 256, capturedBytes: 256 * 1024 * 1024, deadlineSeconds: 2400 }),
})
/** Probe wall-clock seconds per tier (J1.10); kept apart from Tiers, whose spread shapes are consumed as-is. */
export const ProbeSeconds = Object.freeze({ quick: 120, focused: 600, deep: 1800 })

export const Binding = struct("Research.Binding", {
  projectID: Project.ID,
  memberID: Schema.Literal("jimmy"),
  taskId: text(256),
  executionSessionID: SessionID,
  authoritySessionID: SessionID,
  directory: AbsolutePath,
  worktree: AbsolutePath,
})
export type Binding = typeof Binding.Type

export const Selection = struct("Research.Selection", {
  profile: Profile,
  depth: Depth,
  specialization: optional(text(256)),
  modality: optional(Modality),
  genre: Genre,
})
export type Selection = typeof Selection.Type

export const Locator = Schema.Union([
  // An absent basis is "retained": historical rows decode, and their canonical digests stay unchanged (J5.3).
  struct("Research.LineLocator", {
    kind: Schema.Literal("lines"), start: PositiveInt, end: PositiveInt, basis: optional(Schema.Literals(["original", "retained"])),
  }),
  struct("Research.QuoteLocator", {
    kind: Schema.Literal("quote"),
    exact: text(8192),
    prefix: optional(text(4096)),
    suffix: optional(text(4096)),
  }),
  struct("Research.JsonLocator", { kind: Schema.Literal("json"), pointer: Schema.String.check(Schema.isMaxLength(2048)) }),
])
export type Locator = typeof Locator.Type

export const SourceRef = struct("Research.SourceRef", {
  artifact: Capability.ArtifactRef,
  representation: Representation,
  digest: Digest,
})
export type SourceRef = typeof SourceRef.Type
export const EvidenceRef = struct("Research.EvidenceRef", { source: SourceRef, locator: Locator })
export type EvidenceRef = typeof EvidenceRef.Type
export const RecordRef = struct("Research.RecordRef", { id: RecordID, revision: PositiveInt })
export type RecordRef = typeof RecordRef.Type
export const DocumentRef = struct("Research.DocumentRef", { id: DocumentID, revision: PositiveInt })
export type DocumentRef = typeof DocumentRef.Type

export const SourceReceipt = struct("Research.SourceReceipt", {
  binding: Binding,
  ref: SourceRef,
  origin: struct("Research.SourceOrigin", {
    kind: Schema.Literals(["file", "url", "tool-output", "atlas-own"]),
    uri: text(8192),
    revision: optional(text(256)),
  }),
  capturedAt: NonNegativeInt,
  mediaType: text(256),
  bytes: NonNegativeInt,
  complete: Schema.Boolean,
  derivedFrom: optional(SourceRef),
  transformation: optional(text(256)),
  // Locators address the retained representation from line 1, not original-file coordinates.
  observed: optional(struct("Research.SourceExtent", {
    byteStart: NonNegativeInt,
    lineStart: optional(PositiveInt),
    lineEnd: optional(PositiveInt),
  })),
  atlas: optional(struct("Research.AtlasSource", {
    sourceIdentity: Digest,
    unit: text(256),
    contentHash: text(256),
    receiptHash: Digest,
  })),
})
export type SourceReceipt = typeof SourceReceipt.Type

export const AttemptReceipt = struct("Research.AttemptReceipt", {
  binding: Binding,
  operation: text(256),
  outcome: Schema.Literals(["captured", "partial", "unavailable", "uncertain"]),
  stage: Schema.Literals(["acquisition", "representation", "retention"]),
  reason: text(256),
  attemptedAt: NonNegativeInt,
  returned: optional(Schema.Boolean),
  source: optional(SourceRef),
})
export type AttemptReceipt = typeof AttemptReceipt.Type

const findingFields = {
  proposition: text(8192),
  nature: Schema.Literals(["extraction", "observation", "inference", "hypothesis"]),
  conditions: list(text(4096)),
  evidence: list(EvidenceRef),
  contrary: list(EvidenceRef),
}
export const QuestionRecord = struct("Research.QuestionRecord", {
  kind: Schema.Literal("question"), id: QuestionID, revision: PositiveInt, question: text(8192), selection: Selection,
})
export const FindingRecord = struct("Research.FindingRecord", {
  kind: Schema.Literal("finding"), id: FindingID, revision: PositiveInt, ...findingFields, reason: optional(text(4096)),
})
const relationFields = {
  from: RecordRef,
  to: RecordRef,
  relation: Schema.Literals(["supports", "refutes", "depends-on", "related", "answers"]),
  reason: text(4096),
}
export const RelationRecord = struct("Research.RelationRecord", {
  kind: Schema.Literal("relation"), id: RelationID, revision: PositiveInt, ...relationFields,
})
export const Record = Schema.Union([QuestionRecord, FindingRecord, RelationRecord])
export type Record = typeof Record.Type

export const DocumentInput = struct("Research.DocumentInput", {
  genre: Genre,
  title: text(1024),
  body: text(Limits.documentBytes),
  findingRefs: list(RecordRef),
  citations: Schema.Record(text(128), EvidenceRef),
})
export type DocumentInput = typeof DocumentInput.Type
export const DocumentReceipt = struct("Research.DocumentReceipt", {
  binding: Binding,
  ref: DocumentRef,
  artifact: Capability.ArtifactRef,
  digest: Digest,
  title: text(1024),
  genre: Genre,
  bytes: NonNegativeInt,
  publishedAt: NonNegativeInt,
  findingRefs: list(RecordRef),
  citations: Schema.Record(text(128), EvidenceRef),
})
export type DocumentReceipt = typeof DocumentReceipt.Type

export const Corpus = struct("Research.Corpus", {
  sources: Schema.Array(SourceReceipt),
  records: Schema.Array(RecordRef),
  documents: Schema.Array(DocumentReceipt),
  complete: Schema.Boolean,
  total: NonNegativeInt,
})
export type Corpus = typeof Corpus.Type

export const RecordInput = Schema.Union([
  struct("Research.QuestionInput", {
    action: Schema.Literal("question"), id: optional(QuestionID), baseRevision: optional(PositiveInt),
    question: text(8192), selection: Selection,
  }),
  struct("Research.FindingInput", {
    action: Schema.Literal("finding"), id: optional(FindingID), baseRevision: optional(PositiveInt),
    ...findingFields, reason: optional(text(4096)),
  }),
  struct("Research.RelationInput", { action: Schema.Literal("relation"), ...relationFields }),
  struct("Research.DocumentAction", {
    action: Schema.Literal("document"), id: optional(DocumentID), baseRevision: optional(PositiveInt), document: DocumentInput,
  }),
])
export type RecordInput = typeof RecordInput.Type

const GitRevision = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/))
const historyFields = { kind: Schema.Literal("history"), path: text(8192), revision: optional(GitRevision) }
export const HistoryInput = Schema.Union([
  struct("Research.HistoryLog", { ...historyFields, operation: Schema.Literal("log"), limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(50))) }),
  struct("Research.HistoryShow", { ...historyFields, operation: Schema.Literal("show") }),
  struct("Research.HistoryDiff", { ...historyFields, operation: Schema.Literal("diff"), base: GitRevision }),
  struct("Research.HistoryBlame", { ...historyFields, operation: Schema.Literal("blame"), start: optional(PositiveInt), end: optional(PositiveInt) }),
  struct("Research.HistoryCompare", {
    kind: Schema.Literal("history"), operation: Schema.Literal("compare"), base: GitRevision, revision: optional(GitRevision),
    paths: list(text(8192), 16).check(Schema.isMinLength(1)), stat: optional(Schema.Boolean),
  }),
  struct("Research.HistorySearch", {
    kind: Schema.Literal("history"), operation: Schema.Literal("search"), revision: optional(GitRevision),
    message: optional(text(256)), path: optional(text(8192)), limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(50))),
  }),
])
export type HistoryInput = typeof HistoryInput.Type
/** J5.15 operations. E3 adds both to HistoryInput when history.ts serves them; until then no tool admits them. */
export const HistoryResolve = struct("Research.HistoryResolve", {
  kind: Schema.Literal("history"), operation: Schema.Literal("resolve"),
  ref: Schema.String.check(Schema.isPattern(/^(?!-)[A-Za-z0-9._/~^@{}-]{1,256}(?![\s\S])/)),
})
export const HistoryStatus = struct("Research.HistoryStatus", { kind: Schema.Literal("history"), operation: Schema.Literal("status") })

export const CaptureInput = Schema.Union([
  struct("Research.FileCapture", {
    kind: Schema.Literal("file"), path: text(8192), start: optional(PositiveInt), end: optional(PositiveInt),
  }),
  struct("Research.UrlCapture", {
    kind: Schema.Literal("url"), url: text(8192), format: Schema.Literals(["text", "markdown", "html"]),
  }),
  HistoryInput,
])
export type CaptureInput = typeof CaptureInput.Type

export const ViewInput = Schema.Union([
  struct("Research.CorpusView", { action: Schema.Literal("corpus") }),
  struct("Research.AttemptsView", { action: Schema.Literal("attempts"), cursor: optional(text(8192)), limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))) }),
  struct("Research.RecordsView", { action: Schema.Literal("records"), cursor: optional(text(8192)), limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))) }),
  struct("Research.RecordView", { action: Schema.Literal("record"), ref: RecordRef }),
  struct("Research.SourceView", { action: Schema.Literal("source"), ref: SourceRef, cursor: optional(text(8192)) }),
  struct("Research.DocumentView", { action: Schema.Literal("document"), ref: DocumentRef, cursor: optional(text(8192)) }),
  struct("Research.SourceFind", { action: Schema.Literal("find"), ref: SourceRef, query: text(256) }),
])
export type ViewInput = typeof ViewInput.Type

export const ArtifactPage = struct("Research.ArtifactPage", {
  ref: Capability.ArtifactRef,
  representation: Representation,
  text: Schema.String,
  receipt: Schema.Union([SourceReceipt, DocumentReceipt]),
  complete: Schema.Boolean,
  cursor: optional(text(8192)),
})
export type ArtifactPage = typeof ArtifactPage.Type

export const Card = struct("Research.Card", {
  answer: Schema.String.check(Schema.isMaxLength(32768)),
  profile: Profile,
  depth: Depth,
  sufficiency: Schema.Literals(["answered", "partial", "blocked"]),
  findingRefs: list(RecordRef),
  evidenceRefs: list(EvidenceRef),
  documentRefs: list(DocumentRef),
  coverage: struct("Research.Coverage", {
    examined: list(text(4096)), excluded: list(text(4096)), failures: list(text(4096)),
  }),
  limitations: list(text(4096)),
  nextActions: list(text(4096)),
})
export type Card = typeof Card.Type

export class Error extends Schema.TaggedErrorClass<Error>()("Research.Error", {
  code: Schema.Literals([
    "binding_missing", "binding_mismatch", "not_found", "conflict", "over_cap", "reference_invalid",
    "locator_ambiguous", "source_unavailable", "publication_uncertain", "budget_exhausted", "unsupported",
    "index_unavailable", "index_stale", "index_building", "probe_denied", "probe_unsupported_platform", "probe_timeout",
    "probe_memory", "blocked_by_repo_guard", "domain_denied", "inquiry_state",
  ]),
  message: Schema.String,
}) {}

export const Allowance = struct("Research.Allowance", {
  binding: Binding,
  dispatchCallID: text(256),
  // Version 1 bindings admitted before tiers existed were all quick; decoding them keeps that allowance.
  tier: Depth.pipe(Schema.withDecodingDefaultKey(Effect.succeed("quick" as const))),
  providerLimit: PositiveInt,
  toolLimit: PositiveInt,
  byteLimit: PositiveInt,
  deadlineSeconds: PositiveInt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(Tiers.quick.deadlineSeconds))),
  probeSecondsLimit: PositiveInt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(ProbeSeconds.quick))),
})
export type Allowance = typeof Allowance.Type

export const MutationReceipt = struct("Research.MutationReceipt", {
  operation: text(256),
  binding: Binding,
  ref: Schema.Union([RecordRef, DocumentRef]),
  eventID: text(256),
})
export type MutationReceipt = typeof MutationReceipt.Type

// J5: the inquiry the host runs over the existing records, the check before the card, and card v2.
const LineSpan = struct("Research.LineSpan", { start: PositiveInt, end: PositiveInt })
/** Evidence the seat cites; lines are original-file coordinates, quote is literal in the retained bytes, pointer is JSON. */
export const Evidence = Schema.Union([
  struct("Research.LinesEvidence", { source: SourceRef, lines: LineSpan }),
  struct("Research.QuoteEvidence", { source: SourceRef, quote: text(8192) }),
  struct("Research.PointerEvidence", { source: SourceRef, pointer: Schema.String.check(Schema.isMaxLength(2048)) }),
])
export type Evidence = typeof Evidence.Type
export const Sufficiency = Schema.Literals(["answered", "partial", "blocked"])
export type Sufficiency = typeof Sufficiency.Type

export const InquiryInput = Schema.Union([
  struct("Research.InquiryOpen", {
    action: Schema.Literal("open"), question: text(8192), subquestions: list(text(4096), 6).check(Schema.isMinLength(1)),
    profile: Profile, genre: optional(Genre),
  }),
  struct("Research.InquiryHypothesize", { action: Schema.Literal("hypothesize"), subquestion: RecordRef, proposition: text(8192) }),
  struct("Research.InquiryClaim", {
    action: Schema.Literal("claim"), subquestion: RecordRef, proposition: text(8192),
    nature: Schema.Literals(["extraction", "observation", "inference"]), evidence: list(Evidence), contrary: optional(list(Evidence)),
    conditions: optional(list(text(4096))), scope: optional(Schema.Literals(["universal", "existential"])),
  }),
  struct("Research.InquiryResolve", {
    action: Schema.Literal("resolve"), hypothesis: RecordRef, status: Schema.Literals(["confirmed", "refuted"]), evidence: list(Evidence),
  }),
  struct("Research.InquiryDrop", { action: Schema.Literal("drop"), ref: RecordRef, reason: text(4096) }),
  struct("Research.InquiryCheck", { action: Schema.Literal("check") }),
  struct("Research.InquiryClose", {
    action: Schema.Literal("close"), sufficiency: Sufficiency, answer: text(32768),
    limitations: optional(list(text(4096))), nextActions: optional(list(text(4096))),
  }),
  struct("Research.InquiryStatus", { action: Schema.Literal("status") }),
])
export type InquiryInput = typeof InquiryInput.Type

export const CheckRule = Schema.Literals(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11"])
export const UrlStatus = Schema.Literals(["LIVE", "DEAD", "LIKELY_HALLUCINATED", "UNKNOWN"])
const UrlCheck = struct("Research.UrlCheck", { url: text(8192), status: UrlStatus, httpStatus: optional(Schema.Int) })
export const CheckResult = struct("Research.CheckResult", {
  verdict: Schema.Literals(["pass", "fail"]),
  rules: list(struct("Research.RuleResult", { id: CheckRule, checked: NonNegativeInt, failed: NonNegativeInt }), 11),
  issues: list(struct("Research.CheckIssue", {
    rule: CheckRule, ref: optional(RecordRef), citation: optional(text(8192)), reason: text(4096),
  }), 256),
  urls: list(UrlCheck, 256),
})
export type CheckResult = typeof CheckResult.Type

/** Assembled by the host on close; the model never writes card JSON (J5.12). */
export const CardV2 = struct("Research.CardV2", {
  schema: Schema.Literal("jimmy-card-v2"),
  answer: Schema.String.check(Schema.isMaxLength(32768)),
  profile: Profile,
  depth: Depth,
  sufficiency: Sufficiency,
  subquestions: list(struct("Research.CardSubquestion", {
    ref: RecordRef, question: text(4096), status: Schema.Literals(["answered", "partial", "uncovered"]),
  }), 6),
  claims: list(struct("Research.CardClaim", {
    ref: RecordRef, proposition: text(8192), nature: text(256), evidence: list(EvidenceRef), contrary: list(EvidenceRef),
    conditions: list(text(4096)),
  }), 256),
  hypotheses: list(struct("Research.CardHypothesis", {
    ref: RecordRef, proposition: text(8192), status: Schema.Literals(["confirmed", "refuted", "open"]), probes: list(text(256), 64),
  }), 256),
  probes: list(struct("Research.CardProbe", { probeID: text(256), verdict: text(256), source: SourceRef }), 256),
  sources: struct("Research.CardSources", {
    total: NonNegativeInt, shown: list(struct("Research.CardSource", { ref: SourceRef, origin: text(256), uri: text(8192) }), 50),
  }),
  searches: NonNegativeInt,
  web: struct("Research.CardWeb", { domains: Schema.Union([list(text(256), 256), Schema.Literal("unrestricted")]), urls: list(UrlCheck, 256) }),
  coverage: struct("Research.CardCoverage", { examined: list(text(4096), 256), excluded: list(text(4096), 256), failures: list(text(4096), 256) }),
  limitations: list(text(4096), 256),
  nextActions: list(text(4096)),
  documentRefs: list(DocumentRef),
  check: CheckResult,
})
export type CardV2 = typeof CardV2.Type

/** Payloads of the ledger events I1 defines as research.inquiry.{opened,checked,closed} (J5.1). */
export const InquiryOpened = struct("Research.InquiryOpened", { binding: Binding, question: RecordRef, subquestions: list(RecordRef, 6) })
export const InquiryChecked = struct("Research.InquiryChecked", { binding: Binding, check: CheckResult })
export const InquiryClosed = struct("Research.InquiryClosed", { binding: Binding, card: CardV2 })
