import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { versioned, put } from "@atlas/memory"
import { appendReview } from "../src/review-log.js"
import { memoryDecisionsDir } from "../src/layout.js"
import { readRawReview } from "../src/review-records.js"
import {
  memoryDecisionInput, prepareMemoryDecision, publishMemoryDecisionReceipt, readMemoryDecisionReceipts,
} from "../src/memory-decision-receipts.js"

let repo: string
beforeEach(() => { repo = mkdtempSync(join(tmpdir(), "atlas-joint-receipt-")) })
afterEach(() => rmSync(repo, { recursive: true, force: true }))
const at = "2026-11-12T12:00:00.000Z"
const later = "2026-11-12T13:00:00.000Z"

it.each(["indexed", "discarded"] as const)("publishes one complete %s receipt and reconciles exact retries", (verdict) => {
  const proposal = appendReview(repo, {
    kind: "memory-proposal", member: "backend", rule: "run checks", scope: "src", at, by: "owner",
  })
  if (proposal.kind !== "memory-proposal") throw new Error("Expected a memory proposal")
  const decision = memoryDecisionInput({ proposalId: proposal.id, verdict, by: "owner" }, later)
  if (decision === undefined) throw new Error("Expected a decision")
  const record = put("memory", { rule: proposal.rule, scope: proposal.scope, frecency: 1 }, proposal.member)
  const event = [...versioned([record]).values()][0]!
  const indexed = verdict === "indexed" ? {
    record, ref: { contentHash: event.contentHash, eventId: event.id }, sequence: 1,
  } : undefined
  expect(prepareMemoryDecision(readMemoryDecisionReceipts(repo), decision)).toEqual({ proposal })
  const first = publishMemoryDecisionReceipt(repo, proposal, decision, readRawReview(repo), indexed)
  expect(first.ok).toBe(true)
  const filepath = join(memoryDecisionsDir(repo), `${proposal.id}.jsonl`)
  const bytes = readFileSync(filepath, "utf8")
  expect(prepareMemoryDecision(readMemoryDecisionReceipts(repo), { ...decision, at })).toEqual(first)
  expect(publishMemoryDecisionReceipt(repo, proposal, decision, readRawReview(repo), indexed)).toEqual(first)
  expect(readFileSync(filepath, "utf8")).toBe(bytes)
  const read = readMemoryDecisionReceipts(repo)
  expect(read.rejected).toBe(0)
  expect(read.review.records).toEqual([proposal, decision])
  expect(read.log.size).toBe(verdict === "indexed" ? 1 : 0)
  if (verdict === "indexed") expect([...read.log.values()][0]?.payload).toEqual(record)
  const competing = memoryDecisionInput({ proposalId: proposal.id, verdict: verdict === "indexed" ? "discarded" : "indexed", by: "owner" }, at)!
  expect(prepareMemoryDecision(read, competing)).toMatchObject({ ok: false, refusal: "proposal-not-open" })
  expect(readFileSync(filepath, "utf8")).toBe(bytes)
  // A coherent filename is insufficient: corruption must taint both projections, not expose either half.
  writeFileSync(filepath, bytes.replace('"version":1', '"version":2'))
  const corrupt = readMemoryDecisionReceipts(repo)
  expect(corrupt.rejected).toBe(1)
  expect(corrupt.review.records).toEqual([proposal])
  expect(corrupt.log.size).toBe(0)
  expect(prepareMemoryDecision(corrupt, decision)).toMatchObject({ ok: false, refusal: "store-partial" })
})

it("refuses a receipt after its required raw proposal is lost", () => {
  const proposal = appendReview(repo, {
    kind: "memory-proposal", member: "backend", rule: "run checks", scope: "src", at, by: "owner",
  })
  if (proposal.kind !== "memory-proposal") throw new Error("Expected a memory proposal")
  const decision = memoryDecisionInput({ proposalId: proposal.id, verdict: "discarded", by: "owner" }, later)!
  expect(publishMemoryDecisionReceipt(repo, proposal, decision, readRawReview(repo)).ok).toBe(true)
  rmSync(join(repo, ".atlas/project/review.jsonl"))
  const read = readMemoryDecisionReceipts(repo)
  expect(read.rejected).toBe(1)
  expect(read.review.records).toEqual([])
  expect(read.log.size).toBe(0)
})
