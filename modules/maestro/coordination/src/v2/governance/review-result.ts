export * as ReviewResultV2 from "./review-result"

import { Option, Schema } from "effect"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { NonNegativeInt, PositiveInt } from "@orchestra/schema/schema"
import type { WorkResultV2 } from "./work-result"

// The review seat's `review-result` card (design §10.3), its `review-work-result-v1` and the fixed returns of the
// fan-out stages (entry, lens child, verifier). Catalog ids stay open strings; severity, confidence, status and
// outcome are closed. Every schema decodes strictly: an excess property at any level fails the decode.

export const TAG = "review-result"
export const SCHEMA = "review-work-result-v1"

const decodeOptions = { onExcessProperty: "error" } as const

/** A card finding: the receipt's finding record with every field the finding bar (§6.4) needs made required. */
export interface Finding extends Schema.Schema.Type<typeof Finding> {}
export const Finding = Schema.Struct({
  ...MaestroEvent.Review.Finding.fields,
  message: Schema.optional(Schema.NonEmptyString),
  id: Schema.NonEmptyString,
  severity: MaestroEvent.Review.Severity,
  confidence: MaestroEvent.Review.Confidence,
  lens: Schema.NonEmptyString,
  class: Schema.NonEmptyString,
  node: Schema.NonEmptyString,
  rule: Schema.NonEmptyString,
  trigger: Schema.NonEmptyString,
  rungs: Schema.Array(Schema.NonEmptyString),
  evidence: MaestroEvent.Review.Evidence,
  status: MaestroEvent.Review.FindingStatus,
})

/** A candidate no rung settled, `not verified: budget` included; never a FIX_FIRST. */
export interface Question extends Schema.Schema.Type<typeof Question> {}
export const Question = Schema.Struct({
  id: Schema.optional(Schema.NonEmptyString),
  path: Schema.optional(Schema.NonEmptyString),
  line: Schema.optional(PositiveInt),
  endLine: Schema.optional(PositiveInt),
  lens: Schema.optional(Schema.NonEmptyString),
  class: Schema.optional(Schema.NonEmptyString),
  severity: Schema.optional(MaestroEvent.Review.Severity),
  question: Schema.NonEmptyString,
  reason: Schema.optional(Schema.NonEmptyString),
})

export interface Card extends Schema.Schema.Type<typeof Card> {}
export const Card = Schema.Struct({
  outcome: Schema.Literals(["done", "blocked"]),
  // Only with `done`, and only for a profile that has a merge verdict.
  verdict: Schema.optional(Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"])),
  profile: Schema.NonEmptyString,
  tier: Schema.NonEmptyString,
  overlays: Schema.Array(Schema.NonEmptyString),
  routing: ReviewRouting.Record,
  scope: Schema.Struct({
    base: Schema.NonEmptyString,
    head: Schema.NonEmptyString,
    files: NonNegativeInt,
    changedLines: NonNegativeInt,
  }),
  findings: Schema.Array(Finding),
  questions: Schema.Array(Question),
  checks: Schema.Array(
    Schema.Struct({
      id: Schema.NonEmptyString,
      lane: Schema.optional(Schema.NonEmptyString),
      pack: Schema.optional(Schema.NonEmptyString),
      version: Schema.optional(Schema.NonEmptyString),
      status: Schema.Literals(["pass", "fail", "not-run", "check-unavailable", "acquisition-error"]),
      reason: Schema.optional(Schema.NonEmptyString),
      workspaceExecuted: Schema.optional(Schema.Boolean),
      // A `check-unavailable` the owner accepted (§6.6).
      accepted: Schema.optional(Schema.Boolean),
    }),
  ),
  coverage: Schema.Struct({
    examined: Schema.Array(Schema.NonEmptyString),
    // Reasons (§6.8): out of scope, toolchain absent, time box, tier, budget, not-built, owner-permission.
    notExamined: Schema.Array(Schema.Struct({ item: Schema.NonEmptyString, reason: Schema.NonEmptyString })),
    // Analyzer items no model read, per lens.
    unread: Schema.optional(Schema.Array(Schema.Struct({ lens: Schema.NonEmptyString, count: NonNegativeInt }))),
  }),
  handoffs: Schema.Array(
    Schema.Struct({
      lane: Schema.NonEmptyString,
      reason: Schema.NonEmptyString,
      evidence: Schema.optional(Schema.NonEmptyString),
      covered: Schema.Boolean,
    }),
  ),
  blockers: Schema.Array(
    Schema.Struct({
      kind: Schema.NonEmptyString,
      reason: Schema.NonEmptyString,
      code: Schema.optional(Schema.String),
      ref: Schema.optional(Schema.String),
    }),
  ),
  risks: Schema.Array(Schema.String),
  nextActions: Schema.Array(Schema.String),
}).check(
  Schema.makeFilter((card) =>
    card.outcome === "blocked" && card.verdict !== undefined
      ? { path: ["verdict"], issue: "a blocked review has no verdict" }
      : undefined,
  ),
)

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodeCard = Schema.decodeUnknownOption(Card)

/** The one `review-result` block of a reply, strictly decoded; undefined when absent, repeated or invalid. */
export function parse(text: string) {
  if (text.split("```" + TAG).length !== 2) return
  const block = new RegExp("```" + TAG + "[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```").exec(text)?.[1]
  if (block === undefined) return
  return Option.getOrUndefined(Option.flatMap(decodeJson(block), (json) => decodeCard(json, decodeOptions)))
}

/**
 * The review work result over the host facts `WorkResultV2.assemble` bound. Review fields come only from a strictly
 * decoded card: one that does not decode leaves `card.parsed: false` and no outcome or verdict, never a guessed one.
 */
export function assemble(base: ReturnType<typeof WorkResultV2.assemble>, text: string) {
  const card = parse(text)
  return {
    schema: SCHEMA,
    ...(base.taskId ? { taskId: base.taskId } : {}),
    memberId: base.memberId,
    executionSessionId: base.executionSessionId,
    authoritySessionId: base.authoritySessionId,
    mode: base.mode,
    ...(base.resumeRef ? { resumeRef: base.resumeRef } : {}),
    acceptance: base.acceptance,
    verification: base.verification,
    card: { parsed: card !== undefined, messageID: base.card.messageID },
    ...(card ? { outcome: card.outcome, review: card, routingDigest: ReviewRouting.digest(card.routing) } : {}),
    changes: [],
    checks: [],
    blockers: [],
    risks: card ? card.risks : ["The reply carries no review-result card that decodes; no verdict was read."],
    nextActions: card?.nextActions ?? [],
    terminal: { reason: base.terminal.reason === "ended" && card?.outcome === "blocked" ? ("blocked" as const) : base.terminal.reason },
    memory: base.memory,
  }
}

export type Result = ReturnType<typeof assemble>

// K3: the method version `review-v2/<profile>/<tier>`. The allowed sets come from the catalog of the running build.

export const METHOD = "review-v2"

export function method(input: { readonly profile: string; readonly tier: string }) {
  return `${METHOD}/${input.profile}/${input.tier}`
}

/** The profile and tier of a `review-v2` method version, when both are allowed; undefined otherwise. */
export function parseMethod(
  value: string,
  allowed: { readonly profiles: ReadonlyArray<string>; readonly tiers: ReadonlyArray<string> },
) {
  const parts = value.split("/")
  if (parts.length !== 3 || parts[0] !== METHOD) return
  if (!allowed.profiles.includes(parts[1]) || !allowed.tiers.includes(parts[2])) return
  return { profile: parts[1], tier: parts[2] }
}

/**
 * The settlement stage a profile records under: `plan` to `plan`, `code` and `release` to `code`, `rereview` to the
 * stage of the round it continues. Other profiles run outside a validation and record no receipt.
 */
export function stage(profile: string, continued?: "plan" | "code") {
  if (profile === "plan") return "plan" as const
  if (profile === "code" || profile === "release") return "code" as const
  if (profile === "rereview") return continued
  return undefined
}

// K9: the fixed returns of the fan-out stages. Over-cap entries still decode; the host drops them by rank with the cap
// helpers below and records each drop in `routing.deviations`.

export const CAPS = {
  // Overlays the lead may add that the host did not suggest.
  addedOverlays: 2,
  // Out-of-lens observations per lens child.
  observations: 3,
  // The context sheet, about 1,000 tokens.
  contextChars: 4000,
} as const

const Quoted = Schema.Struct({ id: Schema.NonEmptyString, quote: Schema.NonEmptyString })

// Each context line with the line that shows it (`path:line`), or `nothing found`.
const Lines = Schema.Union([
  Schema.Literal("nothing found"),
  Schema.Array(Schema.Struct({ text: Schema.NonEmptyString, line: Schema.NonEmptyString })),
])

const ContextFields = ["intent", "acceptance", "invariants", "assumptions"] as const

export const EntryRecord = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("blocked"),
    // A §6.2 entry blocker.
    blocker: Schema.Struct({ kind: Schema.NonEmptyString, reason: Schema.NonEmptyString }),
  }),
  Schema.Struct({
    status: Schema.Literal("eligible"),
    context: Schema.Struct({ intent: Lines, acceptance: Lines, invariants: Lines, assumptions: Lines }),
    overlays: Schema.Struct({
      confirmed: Schema.Array(Quoted),
      declined: Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, reason: Schema.NonEmptyString })),
      added: Schema.Array(Quoted),
    }),
    // One step up, with the line that justifies it; the host checks the step against the catalog.
    raise: Schema.optional(Schema.Struct({ tier: Schema.NonEmptyString, quote: Schema.NonEmptyString })),
    // The slice plan when the diff is over the tier's slice budget.
    slices: Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, paths: Schema.Array(Schema.NonEmptyString) })),
  }),
])
export type EntryRecord = typeof EntryRecord.Type

export interface Candidate extends Schema.Schema.Type<typeof Candidate> {}
export const Candidate = Schema.Struct({
  class: Schema.NonEmptyString,
  node: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  line: PositiveInt,
  endLine: Schema.optional(PositiveInt),
  severity: MaestroEvent.Review.Severity,
  trigger: Schema.NonEmptyString,
  quote: Schema.NonEmptyString,
})

export interface LensReturn extends Schema.Schema.Type<typeof LensReturn> {}
export const LensReturn = Schema.Struct({
  lens: Schema.NonEmptyString,
  candidates: Schema.Array(Candidate),
  // One line each, outside the child's lens; the host merges them as lowest-ranked candidates of their class.
  observations: Schema.Array(
    Schema.Struct({
      class: Schema.NonEmptyString,
      path: Schema.NonEmptyString,
      line: PositiveInt,
      text: Schema.NonEmptyString,
    }),
  ),
  hunks: Schema.Array(Schema.Struct({ path: Schema.NonEmptyString, startLine: PositiveInt, endLine: PositiveInt })),
  items: Schema.Array(Schema.Struct({ fingerprint: Schema.NonEmptyString, pursued: Schema.Boolean })),
})

const Rung = Schema.Struct({
  option: Schema.NonEmptyString,
  outcome: Schema.Literals(["settled", "unsettled", "refused", "not-run"]),
  detail: Schema.optional(Schema.NonEmptyString),
})

export const Verdict = Schema.Union([
  Schema.Struct({
    candidate: Schema.NonEmptyString,
    state: Schema.Literal("confirmed"),
    // The highest rung that fired: its option id and evidence.
    rung: Schema.NonEmptyString,
    evidence: MaestroEvent.Review.Evidence,
    history: Schema.Array(Rung),
  }),
  Schema.Struct({
    candidate: Schema.NonEmptyString,
    state: Schema.Literal("question"),
    reason: Schema.NonEmptyString,
    history: Schema.Array(Rung),
  }),
  Schema.Struct({
    candidate: Schema.NonEmptyString,
    state: Schema.Literal("dropped"),
    refutation: Schema.NonEmptyString,
    history: Schema.Array(Rung),
  }),
])
export type Verdict = typeof Verdict.Type

export interface VerifierReturn extends Schema.Schema.Type<typeof VerifierReturn> {}
export const VerifierReturn = Schema.Struct({ class: Schema.NonEmptyString, results: Schema.Array(Verdict) })

const decodeEntry = Schema.decodeUnknownOption(EntryRecord)
const decodeLens = Schema.decodeUnknownOption(LensReturn)
const decodeVerifier = Schema.decodeUnknownOption(VerifierReturn)

export function parseEntry(value: unknown) {
  return Option.getOrUndefined(decodeEntry(value, decodeOptions))
}

export function parseLens(value: unknown) {
  return Option.getOrUndefined(decodeLens(value, decodeOptions))
}

export function parseVerifier(value: unknown) {
  return Option.getOrUndefined(decodeVerifier(value, decodeOptions))
}

const RANK = { P0: 0, P1: 1, P2: 2, P3: 3 } as const

/** The entry record within its caps: added overlays in the lead's order, context lines in sheet order. */
export function capEntry(record: EntryRecord, session?: string) {
  if (record.status === "blocked") return { value: record, deviations: [] }
  const lines = ContextFields.flatMap((field) => {
    const value = record.context[field]
    return value === "nothing found" ? [] : value.map((line) => ({ field, line }))
  })
  // Prefix sums: once the sheet overflows, every later line is dropped too.
  const kept = lines.filter(
    (_, index) => lines.slice(0, index + 1).reduce((sum, item) => sum + item.line.text.length, 0) <= CAPS.contextChars,
  )
  const added = cap(record.overlays.added, CAPS.addedOverlays, "entry", "added overlays", (item) => item.id, session)
  const context = cap(lines, kept.length, "entry", "context lines", (item) => `${item.field}: ${item.line.line}`, session)
  const field = (name: (typeof ContextFields)[number]) => {
    const value = record.context[name]
    return value === "nothing found" ? value : kept.filter((item) => item.field === name).map((item) => item.line)
  }
  return {
    value: {
      ...record,
      context: {
        intent: field("intent"),
        acceptance: field("acceptance"),
        invariants: field("invariants"),
        assumptions: field("assumptions"),
      },
      overlays: { ...record.overlays, added: added.kept },
    },
    deviations: [...added.deviations, ...context.deviations],
  }
}

/** A lens child's return within the tier's candidate cap: candidates ranked by severity, observations in order. */
export function capLens(value: LensReturn, candidates: number, session?: string) {
  const ranked = value.candidates.toSorted((left, right) => RANK[left.severity] - RANK[right.severity])
  const kept = cap(ranked, candidates, "hunt", `${value.lens} candidates`, (item) => `${item.path}:${item.line} ${item.class}`, session)
  const observations = cap(value.observations, CAPS.observations, "hunt", `${value.lens} observations`, (item) => `${item.path}:${item.line} ${item.class}`, session)
  return {
    value: { ...value, candidates: kept.kept, observations: observations.kept },
    deviations: [...kept.deviations, ...observations.deviations],
  }
}

/** A verifier's return within the candidates the host gave it, in the order returned. */
export function capVerifier(value: VerifierReturn, candidates: number, session?: string) {
  const kept = cap(value.results, candidates, "verify", `${value.class} results`, (item) => item.candidate, session)
  return { value: { ...value, results: kept.kept }, deviations: kept.deviations }
}

function cap<T>(
  items: ReadonlyArray<T>,
  limit: number,
  at: ReviewRouting.Deviation["stage"],
  what: string,
  name: (item: T) => string,
  session?: string,
) {
  const dropped = items.slice(limit)
  const deviations: ReviewRouting.Deviation[] = dropped.length
    ? [
        {
          kind: "cap-dropped",
          stage: at,
          ...(session ? { session } : {}),
          detail: `${what}: dropped ${dropped.length} of ${items.length} over the cap of ${limit}: ${dropped.map(name).join(", ")}`,
        },
      ]
    : []
  return { kept: items.slice(0, limit), deviations }
}
