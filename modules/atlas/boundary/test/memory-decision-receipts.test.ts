import { afterAll, beforeAll, expect, test } from "bun:test"
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { MemoryDecisionReceipts } from "./fixture/memory-decision-receipts"
import type { MemoryRecord, ProjectRuleDecision } from "../src/generated/native-memory"

let harness: Awaited<ReturnType<typeof MemoryDecisionReceipts.make>>
beforeAll(async () => { harness = await MemoryDecisionReceipts.make() })
afterAll(() => harness?.dispose())
const at = "2026-11-12T12:00:00.000Z"
const later = "2026-11-12T13:00:00.000Z"
const rule = { rule: "run the bounded acceptance checks before publication", scope: "src" }

function propose(f: Awaited<ReturnType<typeof harness.fresh>>, entry = rule, time = at) {
  const result = harness.api.proposeProjectRule(f.binding, entry, time)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return result.proposalId
}

function decide(f: Awaited<ReturnType<typeof harness.fresh>>, proposalId: string, edit: Partial<ProjectRuleDecision> = {}) {
  const result = harness.api.decideProjectRule(f.binding, { proposalId, verdict: "indexed", by: "owner", ...edit }, later)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return result
}

function absent(f: Awaited<ReturnType<typeof harness.fresh>>, proposalId: string) {
  const review = harness.api.readReview(f.repo)
  const memory = harness.api.createDurableMemory(f.repo).read()
  expect(harness.api.foldReview(review.records).memoryDecisions.filter((record) => record.proposalId === proposalId)).toHaveLength(0)
  expect(memory.store).toHaveLength(0)
  expect(memory.log.size).toBe(0)
  expect(review.rejected).toBeGreaterThan(0)
  expect(memory.rejected).toBeGreaterThan(0)
}

test.each(["indexed", "discarded"] as const)("CONTROL L11 receipts: actual %s decision reopens with exact native ref and scanner gates", async (verdict) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  const result = decide(f, proposalId, { verdict })
  const reopened = await harness.reopen()
  const review = reopened.readReview(f.repo)
  const memory = reopened.createDurableMemory(f.repo).read()
  expect(review.rejected).toBe(0)
  expect(memory.rejected).toBe(0)
  expect(review.unreadable).toBeUndefined()
  expect(memory.unreadable).toBeUndefined()
  expect(reopened.foldReview(review.records).openMemoryProposals).toHaveLength(0)
  expect(reopened.foldReview(review.records).memoryDecisions).toMatchObject([
    { id: result.decisionId, proposalId, verdict, by: "owner", at: later },
  ])
  expect(MemoryDecisionReceipts.scanCount(f.scans)).toBe(verdict === "indexed" ? 2 : 1)
  expect(memory.store).toHaveLength(verdict === "indexed" ? 1 : 0)
  if (verdict === "indexed") {
    expect(memory.store[0]).toEqual({ owner: "backend", kind: "project", entry: { ...rule, frecency: 1 } })
    const event = [...harness.api.versioned(memory.store).values()][0]!
    expect(result.ref).toEqual({ contentHash: event.contentHash, eventId: event.id })
    expect(memory.log.get(event.id)?.payload).toEqual(memory.store[0])
  }
  if (verdict === "discarded") expect(result.ref).toBeUndefined()
})

test.each([
  { name: "empty overrides normalize to absence", edit: { rule: "", scope: "" }, effective: rule },
  { name: "edited values remain literal", edit: { rule: "replacement rule", scope: "lib" }, effective: { rule: "replacement rule", scope: "lib" } },
  { name: "truthy whitespace remains untrimmed", edit: { rule: "  ", scope: " \t " }, effective: { rule: "  ", scope: " \t " } },
])("L11 receipts: $name and semantic retry preserve the first receipt", async ({ edit, effective }) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  const first = decide(f, proposalId, edit)
  const filepath = MemoryDecisionReceipts.receiptPath(f.repo, proposalId)
  const bytes = readFileSync(filepath)
  const scans = MemoryDecisionReceipts.scanCount(f.scans)
  await Bun.write(f.blocked, "scanner would now reject any repeated candidate")
  const retry = harness.api.decideProjectRule(f.binding, { proposalId, verdict: "indexed", by: "owner", ...effective }, at)
  expect(retry).toEqual(first)
  expect(readFileSync(filepath)).toEqual(bytes)
  expect(MemoryDecisionReceipts.scanCount(f.scans)).toBe(scans)
  expect(harness.api.createDurableMemory(f.repo).read().store).toEqual([
    { owner: "backend", kind: "project", entry: { ...effective, frecency: 1 } },
  ])
  const receipt = MemoryDecisionReceipts.receipt(f.repo, proposalId)
  const decision = MemoryDecisionReceipts.object(receipt.decision)
  if (edit.rule === "") expect(Object.hasOwn(decision, "rule")).toBe(false)
  if (edit.scope === "") expect(Object.hasOwn(decision, "scope")).toBe(false)
})

test.each([
  { verdict: "discarded" as const }, { by: "another-owner" }, { rule: "different rule" }, { scope: "different-scope" },
])("L11 receipts: different semantic intent refuses without changing winner %j", async (edit) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  decide(f, proposalId)
  const filepath = MemoryDecisionReceipts.receiptPath(f.repo, proposalId)
  const bytes = readFileSync(filepath)
  const before = harness.api.createDurableMemory(f.repo).read().store
  expect(harness.api.decideProjectRule(f.binding, { proposalId, verdict: "indexed", by: "owner", ...edit }, later))
    .toMatchObject({ ok: false, refusal: "proposal-not-open" })
  expect(readFileSync(filepath)).toEqual(bytes)
  expect(harness.api.createDurableMemory(f.repo).read().store).toEqual(before)
})

test("L11 receipts: discarded semantic retry returns original decision without consulting scanner", async () => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  const first = decide(f, proposalId, { verdict: "discarded", rule: "", scope: "" })
  const bytes = readFileSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId))
  const scans = MemoryDecisionReceipts.scanCount(f.scans)
  writeFileSync(f.blocked, "scanner must never be called for discard or its retry")
  expect(harness.api.decideProjectRule(f.binding, { proposalId, verdict: "discarded", by: "owner", ...rule }, at)).toEqual(first)
  expect(readFileSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId))).toEqual(bytes)
  expect(MemoryDecisionReceipts.scanCount(f.scans)).toBe(scans)
  expect(harness.api.createDurableMemory(f.repo).read().store).toHaveLength(0)
})

test.each([
  { name: "empty actor", edit: { by: "" }, time: later },
  { name: "empty timestamp", edit: {}, time: "" },
  { name: "invalid verdict", edit: { verdict: "ratified" }, time: later },
  { name: "non-string rule", edit: { rule: 42 }, time: later },
  { name: "non-string scope", edit: { scope: {} }, time: later },
])("L11 receipts: $name refuses before candidate work", async ({ edit, time }) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  const before = MemoryDecisionReceipts.scanCount(f.scans)
  const result: unknown = Reflect.apply(harness.api.decideProjectRule, undefined,
    [f.binding, { proposalId, verdict: "indexed", by: "owner", ...edit }, time])
  expect(result).toMatchObject({ ok: false, refusal: "template-invalid" })
  expect(MemoryDecisionReceipts.scanCount(f.scans)).toBe(before)
  expect(harness.api.createDurableMemory(f.repo).read().store).toHaveLength(0)
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).openMemoryProposals.map((record) => record.id)).toEqual([proposalId])
  expect(existsSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId))).toBe(false)
})

// These cases depend on an actual newly-published receipt. Baseline absence is a future-contract assertion,
// not evidence of another original split-publication failure.
test.each([
  "truncated", "multiple-lines", "version", "outer-extra", "proposal-extra", "decision-extra", "indexed-extra", "record-extra",
  "entry-extra", "ref-extra", "missing-indexed", "discarded-with-indexed", "owner", "kind", "frecency", "ref",
  "raw-proposal-mismatch", "filename", "zero-sequence", "unsafe-sequence",
])("L11 receipt validation: %s activates neither projection and reports partial", async (fault) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  decide(f, proposalId)
  const filepath = MemoryDecisionReceipts.receiptPath(f.repo, proposalId)
  const original = readFileSync(filepath, "utf8")
  const receipt = MemoryDecisionReceipts.receipt(f.repo, proposalId)
  const proposal = MemoryDecisionReceipts.object(receipt.proposal)
  const decision = MemoryDecisionReceipts.object(receipt.decision)
  const indexed = MemoryDecisionReceipts.object(receipt.indexed)
  const record = MemoryDecisionReceipts.object(indexed.record)
  const entry = MemoryDecisionReceipts.object(record.entry)
  if (fault === "truncated") writeFileSync(filepath, original.slice(0, -4))
  if (fault === "multiple-lines") writeFileSync(filepath, original + original)
  if (fault === "version") receipt.version = 2
  if (fault === "outer-extra") receipt.status = "kernel-dropped field must still be rejected"
  if (fault === "proposal-extra") proposal.grounding = "kernel-dropped field"
  if (fault === "decision-extra") decision.freshness = "kernel-dropped field"
  if (fault === "indexed-extra") indexed.status = "extra"
  if (fault === "record-extra") record.status = "extra"
  if (fault === "entry-extra") entry.grounding = "extra"
  if (fault === "ref-extra") MemoryDecisionReceipts.object(indexed.ref).status = "extra"
  if (fault === "missing-indexed") delete receipt.indexed
  if (fault === "discarded-with-indexed") {
    decision.verdict = "discarded"
    delete decision.id
    decision.id = harness.api.id(decision)
  }
  if (["owner", "kind", "frecency"].includes(fault)) {
    const originalRecord = harness.api.createDurableMemory(f.repo).read().store[0]!
    const changed: MemoryRecord = fault === "owner" ? { ...originalRecord, owner: "another-seat" }
      : fault === "kind" ? { ...originalRecord, kind: "task" }
        : { ...originalRecord, entry: { ...rule, frecency: 2 } }
    const event = [...harness.api.versioned([changed]).values()][0]!
    indexed.record = changed
    indexed.ref = { contentHash: event.contentHash, eventId: event.id }
  }
  if (fault === "ref") MemoryDecisionReceipts.object(indexed.ref).eventId = "0".repeat(64)
  if (fault === "raw-proposal-mismatch") {
    proposal.by = "forged-owner"
    delete proposal.id
    proposal.id = harness.api.id(proposal)
  }
  if (fault === "zero-sequence") indexed.sequence = 0
  if (fault === "unsafe-sequence") indexed.sequence = Number.MAX_SAFE_INTEGER + 1
  if (!["truncated", "multiple-lines", "filename"].includes(fault)) writeFileSync(filepath, JSON.stringify(receipt) + "\n")
  if (fault === "filename") renameSync(filepath, path.join(f.directory, `${"0".repeat(64)}.jsonl`))
  absent(f, proposalId)
})

test("L11 receipts: internally coherent forged proposal cannot replace actual raw review authority", async () => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  decide(f, proposalId)
  const raw = readFileSync(f.review)
  const receipt = MemoryDecisionReceipts.receipt(f.repo, proposalId)
  const indexed = JSON.stringify(receipt.indexed)
  const proposal = MemoryDecisionReceipts.object(receipt.proposal)
  const decision = MemoryDecisionReceipts.object(receipt.decision)
  proposal.at = "2026-11-12T11:59:59.000Z"
  delete proposal.id
  const forgedId = harness.api.id(proposal)
  proposal.id = forgedId
  decision.proposalId = forgedId
  delete decision.id
  decision.id = harness.api.id(decision)
  const forgedPath = MemoryDecisionReceipts.receiptPath(f.repo, forgedId)
  rmSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId))
  writeFileSync(forgedPath, JSON.stringify(receipt) + "\n")
  const saved = MemoryDecisionReceipts.receipt(f.repo, forgedId)
  const savedProposal = MemoryDecisionReceipts.object(saved.proposal)
  const savedDecision = MemoryDecisionReceipts.object(saved.decision)
  expect(forgedId).not.toBe(proposalId)
  expect(path.basename(forgedPath)).toBe(`${forgedId}.jsonl`)
  expect(savedProposal.id).toBe(harness.api.id(Object.fromEntries(Object.entries(savedProposal).filter(([key]) => key !== "id"))))
  expect(savedDecision.proposalId).toBe(savedProposal.id)
  expect(savedDecision.id).toBe(harness.api.id(Object.fromEntries(Object.entries(savedDecision).filter(([key]) => key !== "id"))))
  expect(savedProposal).toEqual({ kind: "memory-proposal", member: "backend", ...rule,
    at: "2026-11-12T11:59:59.000Z", by: "backend", id: forgedId })
  expect(JSON.stringify(saved.indexed)).toBe(indexed)
  expect(readFileSync(f.review)).toEqual(raw)
  expect(raw.toString().trim().split("\n")).toHaveLength(1)
  const review = harness.api.readReview(f.repo)
  const memory = harness.api.createDurableMemory(f.repo).read()
  expect(review.records.filter((record) => record.kind === "memory-proposal").map((record) => record.id)).toEqual([proposalId])
  expect(review.rejected).toBeGreaterThan(0)
  expect(memory.rejected).toBeGreaterThan(0)
  const folded = harness.api.foldReview(review.records)
  expect(folded.memoryDecisions).toHaveLength(0)
  expect(folded.openMemoryProposals.map((record) => record.id)).toEqual([proposalId])
  expect(memory.store).toHaveLength(0)
  expect(memory.log.size).toBe(0)
})

test.each(["review-malformed", "review-directory", "receipt-directory-file", "unrelated-corrupt-receipt"] as const)(
  "L11 receipts: unknown %s blocks even a same-intent existing winner", async (fault) => {
    const f = await harness.fresh()
    const proposalId = propose(f)
    decide(f, proposalId)
    if (fault === "review-malformed") appendFileSync(f.review, "{torn\n")
    if (fault === "review-directory") { renameSync(f.review, f.review + ".backup"); mkdirSync(f.review) }
    if (fault === "receipt-directory-file") { renameSync(f.directory, f.directory + ".backup"); writeFileSync(f.directory, "not a directory") }
    if (fault === "unrelated-corrupt-receipt") writeFileSync(path.join(f.directory, `${"0".repeat(64)}.jsonl`), "{torn unrelated receipt\n")
    const result = harness.api.decideProjectRule(f.binding, { proposalId, verdict: "indexed", by: "owner" }, later)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("Unknown review must not reconcile a winner")
    expect(["store-partial", "store-unavailable"]).toContain(result.refusal)
    const review = harness.api.readReview(f.repo)
    const memory = harness.api.createDurableMemory(f.repo).read()
    expect(review.rejected).toBeGreaterThan(0)
    expect(memory.rejected).toBeGreaterThan(0)
    if (fault === "review-malformed" || fault === "review-directory") expect(memory.store).toHaveLength(0)
    if (fault === "review-directory" || fault === "receipt-directory-file") {
      expect(review.unreadable).toBe(true)
      expect(memory.unreadable).toBe(true)
    }
  },
)

test.each(["indexed", "discarded"] as const)("L11 receipts: %s receipt is the sole physical commit for both projections", async (verdict) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  const raw = readFileSync(f.review)
  const result = decide(f, proposalId, { verdict })
  expect(readFileSync(f.review)).toEqual(raw)
  const filepath = MemoryDecisionReceipts.receiptPath(f.repo, proposalId)
  const bytes = readFileSync(filepath)
  const receipt = MemoryDecisionReceipts.receipt(f.repo, proposalId)
  expect(Object.keys(receipt).sort()).toEqual(verdict === "indexed" ? ["decision", "indexed", "proposal", "version"] : ["decision", "proposal", "version"])
  expect(receipt.version).toBe(1)
  expect(MemoryDecisionReceipts.object(receipt.decision).id).toBe(result.decisionId)
  if (verdict === "indexed") {
    const indexed = MemoryDecisionReceipts.object(receipt.indexed)
    expect(Object.keys(indexed).sort()).toEqual(["record", "ref", "sequence"])
    expect(indexed.ref).toEqual(result.ref)
    expect(indexed.record).toEqual(harness.api.createDurableMemory(f.repo).read().store[0])
  }
  rmSync(filepath)
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).memoryDecisions).toHaveLength(0)
  expect(harness.api.createDurableMemory(f.repo).read().store).toHaveLength(0)
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).openMemoryProposals.map((record) => record.id)).toEqual([proposalId])
  writeFileSync(filepath, bytes)
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).memoryDecisions[0]?.id).toBe(result.decisionId)
  expect(harness.api.createDurableMemory(f.repo).read().store).toHaveLength(verdict === "indexed" ? 1 : 0)
})

test.each(["missing-raw-proposal", "receipt-file-directory"] as const)("L11 receipts: %s cannot activate a valid-looking saved receipt", async (fault) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  decide(f, proposalId)
  if (fault === "missing-raw-proposal") rmSync(f.review)
  if (fault === "receipt-file-directory") {
    const filepath = MemoryDecisionReceipts.receiptPath(f.repo, proposalId)
    renameSync(filepath, filepath + ".backup")
    mkdirSync(filepath)
  }
  absent(f, proposalId)
  const result = harness.api.decideProjectRule(f.binding, { proposalId, verdict: "indexed", by: "owner" }, later)
  expect(result.ok).toBe(false)
  if (fault === "receipt-file-directory") {
    expect(harness.api.readReview(f.repo).unreadable).toBe(true)
    expect(harness.api.createDurableMemory(f.repo).read().unreadable).toBe(true)
  }
})

test("L11 receipts: raw legacy conflict rejects receipt Memory and preserves legacy review and unrelated Memory", async () => {
  const f = await harness.fresh()
  const unrelated: MemoryRecord = { owner: "other-seat", kind: "project", entry: { rule: "unrelated legacy", scope: "legacy", frecency: 1 } }
  harness.api.createDurableMemory(f.repo).append(unrelated)
  const hold = harness.api.appendReview(f.repo, { kind: "hold", nodeKey: "unrelated-node", at, by: "owner" })
  const proposalId = propose(f)
  decide(f, proposalId)
  const legacy = harness.api.appendReview(f.repo, { kind: "memory-decision", proposalId, verdict: "discarded", at, by: "legacy-owner" })
  const review = harness.api.readReview(f.repo)
  const memory = harness.api.createDurableMemory(f.repo).read()
  expect(review.records).toContainEqual(hold)
  expect(harness.api.foldReview(review.records).memoryDecisions).toEqual([legacy])
  expect(memory.store).toEqual([unrelated])
  expect(review.rejected).toBeGreaterThan(0)
  expect(memory.rejected).toBeGreaterThan(0)
})

test.each(["malformed", "unreadable"] as const)("L11 receipts: %s raw review preserves independent legacy Memory with explicit diagnostics", async (fault) => {
  const f = await harness.fresh()
  const legacy: MemoryRecord = { owner: "other-seat", kind: "project", entry: { rule: "independent legacy data", scope: "legacy", frecency: 1 } }
  harness.api.createDurableMemory(f.repo).append(legacy)
  const proposalId = propose(f)
  decide(f, proposalId)
  if (fault === "malformed") appendFileSync(f.review, "{torn\n")
  if (fault === "unreadable") { renameSync(f.review, f.review + ".backup"); mkdirSync(f.review) }
  const memory = harness.api.createDurableMemory(f.repo).read()
  expect(memory.store).toEqual([legacy])
  expect(memory.rejected).toBeGreaterThan(0)
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).memoryDecisions).toHaveLength(0)
  if (fault === "unreadable") expect(memory.unreadable).toBe(true)
})

test("CONTROL L11 receipts: legacy closed proposal is not upgraded into an invented receipt retry", async () => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  const legacy = harness.api.appendReview(f.repo, { kind: "memory-decision", proposalId, verdict: "discarded", by: "owner", at })
  expect(harness.api.decideProjectRule(f.binding, { proposalId, verdict: "discarded", by: "owner" }, later))
    .toMatchObject({ ok: false, refusal: "proposal-not-open" })
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).memoryDecisions).toEqual([legacy])
  expect(existsSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId))).toBe(false)
})

test("L11 receipts: legacy-left dedup retains exact event and ordering while receipts share native identity", async () => {
  const f = await harness.fresh()
  const record: MemoryRecord = { owner: "backend", kind: "project", entry: { ...rule, frecency: 1 } }
  const event = [...harness.api.versioned([record]).values()][0]!
  const legacy = { ...event, seq: 41 }
  harness.api.createDurableLog(path.join(f.repo, ".atlas/memory.jsonl")).append(legacy)
  const first = propose(f)
  const winner = decide(f, first)
  const second = propose(f, rule, later)
  const duplicate = decide(f, second)
  expect(duplicate.ref).toEqual(winner.ref)
  const third = propose(f, rule, "2026-11-12T14:00:00.000Z")
  decide(f, third, { verdict: "discarded" })
  const memory = harness.api.createDurableMemory(f.repo).read()
  expect(memory.log.size).toBe(1)
  expect(memory.log.get(event.id)).toEqual(legacy)
  expect(memory.store).toEqual([record])
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).memoryDecisions).toHaveLength(3)
  expect(MemoryDecisionReceipts.object(MemoryDecisionReceipts.receipt(f.repo, first).indexed).sequence).toBe(42)
  // Fully materialized EventLog dedups to the legacy event; a prior receipt's unused ordering hint is not a new head.
  expect(MemoryDecisionReceipts.object(MemoryDecisionReceipts.receipt(f.repo, second).indexed).sequence).toBe(42)
})

test("L11 receipts: receipt-only duplicates retain first sorted event while distinct publication follows effective head", async () => {
  const f = await harness.fresh()
  const first = propose(f)
  decide(f, first)
  const second = propose(f, rule, later)
  decide(f, second)
  const receipts = [first, second].sort()
  const chosen = MemoryDecisionReceipts.object(MemoryDecisionReceipts.receipt(f.repo, receipts[0]!).indexed)
  const memory = harness.api.createDurableMemory(f.repo).read()
  expect(memory.log.size).toBe(1)
  expect([...memory.log.values()][0]?.seq).toBe(chosen.sequence)
  const next = propose(f, { rule: "another actual rule", scope: "lib" })
  decide(f, next)
  expect(MemoryDecisionReceipts.object(MemoryDecisionReceipts.receipt(f.repo, next).indexed).sequence)
    .toBe(Math.max(...[...memory.log.values()].map((event) => event.seq)) + 1)
})

test("L11 receipts: unsafe effective sequence refuses before publication", async () => {
  const f = await harness.fresh()
  const legacy: MemoryRecord = { owner: "other-seat", kind: "project", entry: { rule: "legacy head", scope: "legacy", frecency: 1 } }
  const event = [...harness.api.versioned([legacy]).values()][0]!
  harness.api.createDurableLog(path.join(f.repo, ".atlas/memory.jsonl")).append({ ...event, seq: Number.MAX_SAFE_INTEGER })
  const proposalId = propose(f)
  const result = harness.api.decideProjectRule(f.binding, { proposalId, verdict: "indexed", by: "owner" }, later)
  expect(result).toMatchObject({ ok: false, refusal: "store-partial" })
  expect(harness.api.createDurableMemory(f.repo).read().store).toEqual([legacy])
  expect(existsSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId))).toBe(false)
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).memoryDecisions).toHaveLength(0)
})

test.each(["blocked-parent", "corrupt-existing-winner"] as const)("L11 receipts: real %s refuses without publication or unrelated temp deletion", async (fault) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  if (fault === "blocked-parent") writeFileSync(f.directory, "physical path blocker")
  if (fault === "corrupt-existing-winner") {
    mkdirSync(f.directory)
    writeFileSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId), "{broken winner\n")
    writeFileSync(path.join(f.directory, "other-owned.tmp"), "other invocation sentinel")
  }
  const result = harness.api.decideProjectRule(f.binding, { proposalId, verdict: "indexed", by: "owner" }, later)
  expect(result.ok).toBe(false)
  expect(harness.api.createDurableMemory(f.repo).read().store).toHaveLength(0)
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).memoryDecisions).toHaveLength(0)
  if (fault === "blocked-parent") expect(readFileSync(f.directory, "utf8")).toBe("physical path blocker")
  if (fault === "corrupt-existing-winner") {
    expect(readFileSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId), "utf8")).toBe("{broken winner\n")
    expect(readFileSync(path.join(f.directory, "other-owned.tmp"), "utf8")).toBe("other invocation sentinel")
    expect(MemoryDecisionReceipts.files(f.directory)).toHaveLength(2)
  }
})

test("L11 receipts: missing directory is complete and a non-jsonl leftover cannot materialize a decision", async () => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  expect(harness.api.readReview(f.repo).rejected).toBe(0)
  expect(harness.api.createDurableMemory(f.repo).read().rejected).toBe(0)
  mkdirSync(f.directory)
  writeFileSync(path.join(f.directory, "other-owned.tmp"), "{leftover, never a receipt")
  const result = decide(f, proposalId)
  expect(readFileSync(path.join(f.directory, "other-owned.tmp"), "utf8")).toBe("{leftover, never a receipt")
  expect(harness.api.readReview(f.repo).rejected).toBe(0)
  expect(harness.api.createDurableMemory(f.repo).read().store).toHaveLength(1)
  expect(result.ref).toBeDefined()
})

test.each(["scanner", "cap"] as const)("L11 receipts: actual %s refusal leaves proposal open and no receipt", async (fault) => {
  const f = await harness.fresh()
  const proposalId = propose(f)
  if (fault === "scanner") writeFileSync(f.blocked, "real scanner rejects")
  const result = harness.api.decideProjectRule(f.binding, {
    proposalId, verdict: "indexed", by: "owner", ...(fault === "cap" ? { rule: "word ".repeat(600) } : {}),
  }, later)
  expect(result).toMatchObject({ ok: false, refusal: fault === "scanner" ? "scanner-blocked" : "over-cap" })
  expect(harness.api.createDurableMemory(f.repo).read().store).toHaveLength(0)
  expect(harness.api.foldReview(harness.api.readReview(f.repo).records).openMemoryProposals.map((record) => record.id)).toEqual([proposalId])
  expect(existsSync(MemoryDecisionReceipts.receiptPath(f.repo, proposalId))).toBe(false)
})

test("L11 receipts: known winner retries before a newly binding duplicate-candidate cap", async () => {
  const f = await harness.fresh()
  const large = { rule: "word ".repeat(300), scope: "src" }
  const proposalId = propose(f, large)
  const first = decide(f, proposalId)
  const before = MemoryDecisionReceipts.scanCount(f.scans)
  expect(harness.api.decideProjectRule(f.binding, { proposalId, verdict: "indexed", by: "owner" }, at)).toEqual(first)
  expect(MemoryDecisionReceipts.scanCount(f.scans)).toBe(before)
  const another = propose(f, large, later)
  expect(harness.api.decideProjectRule(f.binding, { proposalId: another, verdict: "indexed", by: "owner" }, later))
    .toMatchObject({ ok: false, refusal: "over-cap" })
  expect(harness.api.createDurableMemory(f.repo).read().store).toHaveLength(1)
})
