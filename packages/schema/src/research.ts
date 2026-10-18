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
  struct("Research.LineLocator", { kind: Schema.Literal("lines"), start: PositiveInt, end: PositiveInt }),
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
])
export type HistoryInput = typeof HistoryInput.Type

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
  ]),
  message: Schema.String,
}) {}

export const Allowance = struct("Research.Allowance", {
  binding: Binding,
  dispatchCallID: text(256),
  // Version 1 bindings admitted before tiers existed were all quick; decoding them keeps that allowance.
  tier: Depth.pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed("quick" as const))),
  providerLimit: PositiveInt,
  toolLimit: PositiveInt,
  byteLimit: PositiveInt,
  deadlineSeconds: PositiveInt.pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed(Tiers.quick.deadlineSeconds))),
})
export type Allowance = typeof Allowance.Type

export const MutationReceipt = struct("Research.MutationReceipt", {
  operation: text(256),
  binding: Binding,
  ref: Schema.Union([RecordRef, DocumentRef]),
  eventID: text(256),
})
export type MutationReceipt = typeof MutationReceipt.Type
