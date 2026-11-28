// One receipt is both a review decision and, for indexing, its native Memory event. Both readers use
// this validation boundary; neither can activate one half of a malformed or conflicting receipt.
import { closeSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { combine, id } from "@atlas/kernel"
import type { EventLog } from "@atlas/kernel"
import { INITIAL_PROJECT_FRECENCY, put, validate, versioned } from "@atlas/memory"
import type { MemoryRecord } from "@atlas/memory"
import { memoryDecisionsDir } from "./layout.js"
import { foldReview, parseInput, readRawReview } from "./review-records.js"
import type { ReviewOf, ReviewRead, ReviewRecord } from "./review-records.js"

export interface RecordRef {
  readonly contentHash: string
  readonly eventId: string
}

type Indexed = { readonly record: MemoryRecord; readonly ref: RecordRef; readonly sequence: number }
type MemoryDecisionReceipt =
  | { readonly version: 1; readonly proposal: ReviewOf<"memory-proposal">;
      readonly decision: ReviewOf<"memory-decision"> & { readonly verdict: "indexed" }; readonly indexed: Indexed }
  | { readonly version: 1; readonly proposal: ReviewOf<"memory-proposal">;
      readonly decision: ReviewOf<"memory-decision"> & { readonly verdict: "discarded" }; readonly indexed?: never }
type ReceiptRead = {
  readonly raw: ReviewRead
  readonly review: ReviewRead
  readonly receipts: readonly MemoryDecisionReceipt[]
  readonly log: EventLog
  readonly rejected: number
  readonly unreadable?: true
}

export function readMemoryDecisionReceipts(root: string): ReceiptRead {
  const raw = readRawReview(root)
  // A receipt cannot authenticate its own proposal when the raw review is not fully known.
  if (raw.unreadable === true || raw.rejected > 0) return {
    raw, review: { ...raw, rejected: Math.max(raw.rejected, 1) }, receipts: [], log: new Map(), rejected: Math.max(raw.rejected, 1),
    ...(raw.unreadable === true ? { unreadable: true } : {}),
  }
  const files = receiptFiles(root)
  const reads = files.paths.map((filepath) => readReceiptFile(filepath, raw.records))
  const receipts = reads.flatMap((read) => read.receipt === undefined ? [] : [read.receipt])
  const rejected = reads.reduce((count, read) => count + read.rejected, files.unreadable === true ? 1 : 0)
  const unreadable = files.unreadable === true || reads.some((read) => read.unreadable === true)
  const log = receipts.reduce<EventLog>((log, receipt) => {
    if (!isIndexed(receipt)) return log
    const event = [...versioned([receipt.indexed.record]).values()][0]!
    return combine(log, new Map([[event.id, { ...event, seq: receipt.indexed.sequence }]]))
  }, new Map())
  const diagnostics = { rejected, ...(unreadable ? { unreadable: true as const } : {}) }
  return { raw, receipts, log, ...diagnostics,
    review: { records: [...raw.records, ...receipts.map((receipt) => receipt.decision)], ...diagnostics } }
}

/** Normalize only the historically absent empty overrides. All other strings remain literal. */
export function memoryDecisionInput(input: unknown, at: unknown): ReviewOf<"memory-decision"> | undefined {
  const value = objectOf(input)
  if (value === undefined) return undefined
  const parsed = parseInput({ kind: "memory-decision", proposalId: value.proposalId, verdict: value.verdict,
    by: value.by, at, ...(value.rule === "" || value.rule === undefined ? {} : { rule: value.rule }),
    ...(value.scope === "" || value.scope === undefined ? {} : { scope: value.scope }) })
  return parsed?.kind === "memory-decision" ? { ...parsed, id: String(id(parsed)) } : undefined
}

/** Unknown raw/composed state takes priority even over a previously published same-intent winner. */
export function prepareMemoryDecision(read: ReceiptRead, decision: ReviewOf<"memory-decision">,
  expected?: ReviewOf<"memory-proposal">) {
  const refused = readRefusal(read)
  if (refused !== undefined) return refused
  const proposal = read.raw.records.find((record): record is ReviewOf<"memory-proposal"> =>
    record.kind === "memory-proposal" && record.id === decision.proposalId)
  if (proposal === undefined || (expected !== undefined && !sameProposal(proposal, expected))) return notOpen()
  const winner = read.receipts.find((receipt) => receipt.proposal.id === proposal.id)
  if (winner !== undefined) return reconcile(winner, decision)
  if (!foldReview(read.review.records).openMemoryProposals.some((record) => record.id === proposal.id)) return notOpen()
  return { proposal }
}

/** `raw` is the actual fully known reread taken after governed candidate preparation. */
export function publishMemoryDecisionReceipt(root: string, proposal: ReviewOf<"memory-proposal">,
  decision: ReviewOf<"memory-decision">, raw: ReviewRead, indexed?: Indexed) {
  const receipt = validateReceipt({ version: 1, proposal, decision,
    ...(indexed === undefined ? {} : { indexed }) }, proposal.id, raw.records)
  if (raw.unreadable === true || raw.rejected > 0 || receipt === undefined) return partial()
  const directory = memoryDecisionsDir(root)
  const temporary = { filepath: join(directory, `.${proposal.id}.${crypto.randomUUID()}.tmp`), owned: false }
  const line = `${JSON.stringify(receipt)}\n`
  try {
    mkdirSync(directory, { recursive: true })
    const descriptor = openSync(temporary.filepath, "wx", 0o600)
    temporary.owned = true
    try {
      writeFileSync(descriptor, line)
    } finally {
      closeSync(descriptor)
    }
    const written = readFileSync(temporary.filepath, "utf8")
    if (written !== line || parseReceiptLine(written, proposal.id, raw.records) === undefined) return partial()
    // A local create-only link is the sole commit point. It never replaces an incumbent receipt.
    linkSync(temporary.filepath, join(directory, `${proposal.id}.jsonl`))
    return resultOf(receipt)
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "EEXIST") return unavailable()
    const current = readMemoryDecisionReceipts(root)
    const refused = readRefusal(current)
    if (refused !== undefined) return refused
    const winner = current.receipts.find((item) => item.proposal.id === proposal.id)
    return winner === undefined ? partial() : !sameProposal(winner.proposal, proposal) ? notOpen() : reconcile(winner, decision)
  } finally {
    // Failure to remove our temp after a successful link cannot turn committed truth into a refusal.
    if (temporary.owned) {
      try { unlinkSync(temporary.filepath) } catch { /* Only our temp; a leftover is not a receipt. */ }
    }
  }
}

function receiptFiles(root: string): { readonly paths: readonly string[]; readonly unreadable?: true } {
  const directory = memoryDecisionsDir(root)
  try {
    return { paths: readdirSync(directory).filter((name) => name.endsWith(".jsonl")).sort().map((name) => join(directory, name)) }
  } catch (error) {
    return (error as { code?: unknown } | null)?.code === "ENOENT" ? { paths: [] } : { paths: [], unreadable: true }
  }
}

function readReceiptFile(filepath: string, raw: readonly ReviewRecord[]): {
  readonly receipt?: MemoryDecisionReceipt; readonly rejected: number; readonly unreadable?: true
} {
  try {
    const receipt = parseReceiptLine(readFileSync(filepath, "utf8"), basename(filepath, ".jsonl"), raw)
    return receipt === undefined ? { rejected: 1 } : { receipt, rejected: 0 }
  } catch {
    return { rejected: 1, unreadable: true }
  }
}

function parseReceiptLine(text: string, filename: string, raw: readonly ReviewRecord[]): MemoryDecisionReceipt | undefined {
  const lines = text.split("\n")
  if (lines.length !== 2 || lines[1] !== "") return undefined
  try {
    return validateReceipt(JSON.parse(lines[0]!), filename, raw)
  } catch {
    return undefined
  }
}

function validateReceipt(value: unknown, filename: string, raw: readonly ReviewRecord[]): MemoryDecisionReceipt | undefined {
  const wrapper = objectOf(value)
  if (wrapper === undefined || !closed(wrapper, ["version", "proposal", "decision"], ["indexed"]) || wrapper.version !== 1) return undefined
  const proposal = proposalOf(wrapper.proposal)
  const decision = decisionOf(wrapper.decision)
  if (proposal === undefined || decision === undefined || !/^[a-f0-9]{64}$/.test(filename) || proposal.id !== filename ||
    decision.proposalId !== proposal.id) return undefined
  const actual = raw.find((record): record is ReviewOf<"memory-proposal"> => record.kind === "memory-proposal" && record.id === proposal.id)
  if (actual === undefined || !sameProposal(actual, proposal) || raw.some((record) =>
    record.kind === "memory-decision" && record.proposalId === proposal.id)) return undefined
  if (decision.verdict === "discarded") return Object.hasOwn(wrapper, "indexed") ? undefined
    : { version: 1, proposal, decision: { ...decision, verdict: "discarded" } }
  const indexed = objectOf(wrapper.indexed)
  if (indexed === undefined || !closed(indexed, ["record", "ref", "sequence"]) ||
    typeof indexed.sequence !== "number" || !Number.isSafeInteger(indexed.sequence) || indexed.sequence <= 0) return undefined
  const record = objectOf(indexed.record)
  const ref = objectOf(indexed.ref)
  if (record === undefined || !closed(record, ["owner", "kind", "entry"]) || record.owner !== proposal.member || record.kind !== "project" ||
    ref === undefined || !closed(ref, ["contentHash", "eventId"])) return undefined
  const entry = objectOf(record.entry)
  if (entry === undefined || !closed(entry, ["rule", "scope", "frecency"]) || entry.rule !== (decision.rule || proposal.rule) ||
    entry.scope !== (decision.scope || proposal.scope) || entry.frecency !== INITIAL_PROJECT_FRECENCY) return undefined
  const complete = { rule: decision.rule || proposal.rule, scope: decision.scope || proposal.scope, frecency: INITIAL_PROJECT_FRECENCY }
  if (!validate("project", complete).valid) return undefined
  const native = put("memory", complete, proposal.member)
  const event = [...versioned([native]).values()][0]!
  if (ref.contentHash !== event.contentHash || ref.eventId !== event.id) return undefined
  return { version: 1, proposal, decision: { ...decision, verdict: "indexed" },
    indexed: { record: native, ref: { contentHash: event.contentHash, eventId: event.id }, sequence: indexed.sequence } }
}

function proposalOf(value: unknown): ReviewOf<"memory-proposal"> | undefined {
  const record = objectOf(value)
  if (record === undefined || !closed(record, ["id", "kind", "member", "rule", "scope", "at", "by"])) return undefined
  const parsed = parseInput(record)
  return parsed?.kind === "memory-proposal" && record.id === String(id(parsed)) ? { ...parsed, id: record.id } : undefined
}

function decisionOf(value: unknown): ReviewOf<"memory-decision"> | undefined {
  const record = objectOf(value)
  if (record === undefined || !closed(record, ["id", "kind", "proposalId", "verdict", "at", "by"], ["rule", "scope"])) return undefined
  const parsed = parseInput(record)
  return parsed?.kind === "memory-decision" && record.id === String(id(parsed)) ? { ...parsed, id: record.id } : undefined
}

function objectOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function closed(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
}

function sameProposal(left: ReviewOf<"memory-proposal">, right: ReviewOf<"memory-proposal">) {
  return left.id === right.id && left.member === right.member && left.rule === right.rule && left.scope === right.scope &&
    left.at === right.at && left.by === right.by
}

function isIndexed(receipt: MemoryDecisionReceipt): receipt is Extract<MemoryDecisionReceipt, { readonly indexed: Indexed }> {
  return receipt.decision.verdict === "indexed"
}

function reconcile(receipt: MemoryDecisionReceipt, decision: ReviewOf<"memory-decision">) {
  return receipt.proposal.id === decision.proposalId && receipt.decision.verdict === decision.verdict && receipt.decision.by === decision.by &&
    (receipt.decision.rule || receipt.proposal.rule) === (decision.rule || receipt.proposal.rule) &&
    (receipt.decision.scope || receipt.proposal.scope) === (decision.scope || receipt.proposal.scope) ? resultOf(receipt) : notOpen()
}

function resultOf(receipt: MemoryDecisionReceipt) {
  return { ok: true as const, decisionId: receipt.decision.id, ...(isIndexed(receipt) ? { ref: receipt.indexed.ref } : {}) }
}

function readRefusal(read: ReceiptRead) {
  return read.unreadable === true ? unavailable() : read.rejected > 0 ? partial() : undefined
}

function unavailable() {
  return { ok: false as const, refusal: "store-unavailable" as const, reason: "the Memory decision state could not be fully read or published" }
}

function partial() {
  return { ok: false as const, refusal: "store-partial" as const, reason: "the Memory decision state contains an invalid or conflicting record" }
}

function notOpen() {
  return { ok: false as const, refusal: "proposal-not-open" as const, reason: "the memory proposal is no longer open for this decision" }
}
