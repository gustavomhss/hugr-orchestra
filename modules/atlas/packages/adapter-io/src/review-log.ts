// @atlas/adapter-io — src/review-log.ts  (D14: the shared review log, `.atlas/project/review.jsonl`)
//
// One append-only, content-keyed log for every human review act the Atlas screen and CLI record: a curator holding
// or releasing a staged candidate (R2), a reviewer proposing a fact for T1/T0 and a person deciding it (R3), an
// interview answer (R11), and a steward's memory proposal and decision (R1). Each act is ONE record; nothing is
// edited or removed, and the current state — what is held, which proposals are open — is a FOLD over the records.
//
// The file is the durable-log primitive (`durable-log.ts`), exactly as the memory logs are: every line is a kernel
// `Event` whose `payload` is the record without its id and whose `contentHash` is the record id, so a torn or edited
// line fails its own content-key check and is COUNTED (`rejected`), never folded in. It travels in git
// (`.gitignore` re-admits it, `.gitattributes` merges it by union), so a hold made on one branch survives the merge.
//
// A record's id is the kernel content hash (`id`, `@atlas/kernel`) of the record's known fields. `at` is hashed too,
// so the same act repeated later is a second record and the fold decides by `at` (file order breaks a tie). Never
// name a record field `status`, `grounding` or `freshness`: the kernel hash drops those keys (KERNEL-8).

import { eventId, id } from "@atlas/kernel"
import type { Event } from "@atlas/kernel"
import { createDurableLog, readDurableLogs } from "./durable-log.js"
import { legacyLogPath, projectLogPath } from "./layout.js"

export type ReviewTier = "T1" | "T0"

export type ReviewBody =
  | { readonly kind: "hold"; readonly nodeKey: string }
  | { readonly kind: "release"; readonly nodeKey: string }
  | { readonly kind: "proposal"; readonly nodeKey: string; readonly toTier: ReviewTier; readonly reason: string }
  | {
      readonly kind: "decision"
      readonly proposalId: string
      readonly verdict: "ratified" | "rejected"
      readonly reason: string
    }
  | {
      readonly kind: "answer"
      readonly questionId: string
      readonly answer: string
      readonly drafted?: { readonly model: string; readonly why: string }
    }
  | { readonly kind: "memory-proposal"; readonly member: string; readonly rule: string; readonly scope: string }
  | {
      readonly kind: "memory-decision"
      readonly proposalId: string
      readonly verdict: "indexed" | "discarded"
      readonly rule?: string
      readonly scope?: string
    }

/** What a caller appends: the body plus when (ISO-8601 UTC, `new Date().toISOString()`) and who. */
export type ReviewInput = ReviewBody & { readonly at: string; readonly by: string }

/** What a read returns: the input plus its id (the kernel content hash of the input). */
export type ReviewRecord = ReviewInput & { readonly id: string }

/** The record type of one kind, e.g. `ReviewOf<"proposal">`. */
export type ReviewOf<K extends ReviewBody["kind"]> = Extract<ReviewRecord, { readonly kind: K }>

/** What a read found. `rejected` counts lines that did not verify — torn, edited, or not a review record. */
export interface ReviewRead {
  readonly records: readonly ReviewRecord[]
  readonly rejected: number
  /** The file exists and could not be read at all (see `LogRead.unreadable`). Absent on every readable outcome. */
  readonly unreadable?: true
}

/** The review state the records fold to. */
export interface ReviewFold {
  /** nodeKeys whose latest hold/release (by `at`, file order breaks a tie) is a hold. */
  readonly held: ReadonlySet<string>
  /** Proposals no decision names, in file order. */
  readonly openProposals: readonly ReviewOf<"proposal">[]
  readonly decisions: readonly ReviewOf<"decision">[]
  /** questionId → its latest answer (by `at`). */
  readonly answers: ReadonlyMap<string, ReviewOf<"answer">>
  /** Memory proposals no memory-decision names, in file order. */
  readonly openMemoryProposals: readonly ReviewOf<"memory-proposal">[]
  readonly memoryDecisions: readonly ReviewOf<"memory-decision">[]
}

/** The tracked log's path under a repo root. Nothing in it is ever replaced; the legacy `.atlas/review.jsonl`
 *  is still read, first. */
export const reviewLogPath = (repoPath: string): string => projectLogPath(repoPath, "review")

/**
 * Append one review act and return it with its id. THROWS on an input that does not match its kind (an empty
 * field, a tier other than T1/T0, an unknown verdict): callers validate first, so the throw is a defect path —
 * writing a line this module's own reader would reject would be a silent black hole.
 */
export function appendReview(repoPath: string, input: ReviewInput): ReviewRecord {
  const body = parseInput(input)
  if (body === undefined) {
    throw new Error(`review-log: refusing to append a malformed '${String((input as { kind?: unknown }).kind)}' record`)
  }
  const event: Omit<Event, "id"> = { seq: 0, contentHash: id(body), fresh: true, supersedes: [], payload: body }
  createDurableLog(reviewLogPath(repoPath)).append({ ...event, id: eventId(event) })
  return { ...body, id: String(event.contentHash) }
}

/** Read every verifiable record, in file order. Total — a missing file is an empty log, not an error. */
export function readReview(repoPath: string): ReviewRead {
  const raw = readDurableLogs([legacyLogPath(repoPath, "review"), reviewLogPath(repoPath)])
  const events = [...raw.log.values()]
  const records = events.flatMap((ev): ReviewRecord[] => {
    const body = parseInput(ev.payload)
    // The payload must hash to the record id the line carries: a payload with extra or edited fields does not.
    return body !== undefined && String(id(body)) === String(ev.contentHash) ? [{ ...body, id: String(ev.contentHash) }] : []
  })
  const rejected = raw.rejected + events.length - records.length
  return raw.unreadable === true ? { records, rejected, unreadable: true } : { records, rejected }
}

/** Fold records (file order) into the review state. Pure. */
export function foldReview(records: readonly ReviewRecord[]): ReviewFold {
  const marks = new Map<string, ReviewOf<"hold"> | ReviewOf<"release">>()
  const answers = new Map<string, ReviewOf<"answer">>()
  records.forEach((r) => {
    if (r.kind === "hold" || r.kind === "release") {
      const prior = marks.get(r.nodeKey)
      if (prior === undefined || prior.at <= r.at) marks.set(r.nodeKey, r)
    }
    if (r.kind === "answer") {
      const prior = answers.get(r.questionId)
      if (prior === undefined || prior.at <= r.at) answers.set(r.questionId, r)
    }
  })
  const decisions = records.filter((r): r is ReviewOf<"decision"> => r.kind === "decision")
  const memoryDecisions = records.filter((r): r is ReviewOf<"memory-decision"> => r.kind === "memory-decision")
  const decided = new Set(decisions.map((d) => d.proposalId))
  const memoryDecided = new Set(memoryDecisions.map((d) => d.proposalId))
  return {
    held: new Set([...marks.values()].filter((m) => m.kind === "hold").map((m) => m.nodeKey)),
    openProposals: records.filter((r): r is ReviewOf<"proposal"> => r.kind === "proposal" && !decided.has(r.id)),
    decisions,
    answers,
    openMemoryProposals: records.filter(
      (r): r is ReviewOf<"memory-proposal"> => r.kind === "memory-proposal" && !memoryDecided.has(r.id),
    ),
    memoryDecisions,
  }
}

/** The invariant line every review act reports, in the CLI and on the Atlas screen alike. */
export const REVIEW_INVARIANT =
  "REVIEW-LOG (D14): a review act is one appended, content-keyed record in .atlas/project/review.jsonl — nothing is edited or removed, and the current state is a fold over the records"

/**
 * A review act a helper declined. `invalid`: the request itself is wrong (the CLI's exit 1). `governed`: the log or
 * the store declined it (exit 2). `reason` is the exact text the CLI prints and the Atlas screen shows.
 */
export interface ReviewRefusal {
  readonly ok: false
  readonly refusal: "invalid" | "governed"
  readonly reason: string
}

/** The folded review state, or the governed refusal when the log has lines that do not verify: a decision taken over
 *  a log that cannot be fully read could miss the very hold or decision a torn line held. */
export function foldReviewLog(repoPath: string): { readonly fold: ReviewFold } | ReviewRefusal {
  const read = readReview(repoPath)
  if (read.unreadable !== true && read.rejected === 0) return { fold: foldReview(read.records) }
  const why =
    read.unreadable === true
      ? "could not be read"
      : `has ${read.rejected} line(s) that do not verify (torn, edited, or not a review record)`
  return {
    ok: false,
    refusal: "governed",
    reason: `the review log ${reviewLogPath(repoPath)} ${why}, so a hold or a decision in it could be missed — repair or remove those lines, then re-run`,
  }
}

/** `wanted` as an exact id, or as a prefix of at least 8 characters that matches exactly one id; else `undefined`. */
export function resolveReviewId(ids: readonly string[], wanted: string): string | undefined {
  if (ids.includes(wanted)) return wanted
  const hits = wanted.length >= 8 ? ids.filter((id) => id.startsWith(wanted)) : []
  return hits.length === 1 ? hits[0] : undefined
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0
const isOptionalText = (v: unknown): v is string | undefined => v === undefined || isText(v)

/** Narrow anything to a well-formed input carrying ONLY its kind's known fields, or `undefined`. */
function parseInput(v: unknown): ReviewInput | undefined {
  if (v === null || typeof v !== "object") return undefined
  const o = v as Record<string, unknown>
  if (!isText(o.at) || !isText(o.by)) return undefined
  const stamp = { at: o.at, by: o.by }
  if ((o.kind === "hold" || o.kind === "release") && isText(o.nodeKey)) return { kind: o.kind, nodeKey: o.nodeKey, ...stamp }
  if (o.kind === "proposal" && isText(o.nodeKey) && (o.toTier === "T1" || o.toTier === "T0") && isText(o.reason)) {
    return { kind: "proposal", nodeKey: o.nodeKey, toTier: o.toTier, reason: o.reason, ...stamp }
  }
  if (o.kind === "decision" && isText(o.proposalId) && (o.verdict === "ratified" || o.verdict === "rejected") && isText(o.reason)) {
    return { kind: "decision", proposalId: o.proposalId, verdict: o.verdict, reason: o.reason, ...stamp }
  }
  if (o.kind === "answer" && isText(o.questionId) && isText(o.answer)) {
    const drafted = parseDrafted(o.drafted)
    if (drafted === null) return undefined
    return { kind: "answer", questionId: o.questionId, answer: o.answer, ...(drafted !== undefined ? { drafted } : {}), ...stamp }
  }
  if (o.kind === "memory-proposal" && isText(o.member) && isText(o.rule) && isText(o.scope)) {
    return { kind: "memory-proposal", member: o.member, rule: o.rule, scope: o.scope, ...stamp }
  }
  if (
    o.kind === "memory-decision" &&
    isText(o.proposalId) &&
    (o.verdict === "indexed" || o.verdict === "discarded") &&
    isOptionalText(o.rule) &&
    isOptionalText(o.scope)
  ) {
    return {
      kind: "memory-decision",
      proposalId: o.proposalId,
      verdict: o.verdict,
      ...(o.rule !== undefined ? { rule: o.rule } : {}),
      ...(o.scope !== undefined ? { scope: o.scope } : {}),
      ...stamp,
    }
  }
  return undefined
}

/** `drafted` is optional; present, it must carry both fields. `null` means present and malformed. */
function parseDrafted(v: unknown): { readonly model: string; readonly why: string } | undefined | null {
  if (v === undefined) return undefined
  if (v === null || typeof v !== "object") return null
  const d = v as Record<string, unknown>
  return isText(d.model) && isText(d.why) ? { model: d.model, why: d.why } : null
}
