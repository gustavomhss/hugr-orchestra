import { afterAll, beforeAll, expect, test } from "bun:test"
import { existsSync, readFileSync, renameSync, rmdirSync } from "node:fs"
import { MemoryDecision } from "./fixture/memory-decision"
import type { DecisionVerdict } from "../src/generated/native-memory"

let harness: Awaited<ReturnType<typeof MemoryDecision.make>>
beforeAll(async () => { harness = await MemoryDecision.make() })
afterAll(() => harness?.dispose())
const rule = { rule: "joint decision must not expose an uncommitted rule", scope: "src" }
const at = "2026-11-12T12:00:00.000Z"

test.each(["indexed", "discarded"] as const)("CONTROL L11: actual scanned proposal and %s decision agree with effective Memory", async (verdict) => {
  const f = await harness.fresh()
  const proposed = harness.api.proposeProjectRule(f.binding, rule, at)
  if (!proposed.ok) throw new Error(proposed.reason)
  const result = harness.api.decideProjectRule(f.binding, { proposalId: proposed.proposalId, verdict, by: "owner" }, at)
  if (!result.ok) throw new Error(result.reason)
  const review = harness.api.readReview(f.repo)
  const folded = harness.api.foldReview(review.records)
  const memory = harness.api.createDurableMemory(f.repo).read()
  expect(review.rejected).toBe(0)
  expect(folded.openMemoryProposals).toHaveLength(0)
  expect(folded.memoryDecisions).toMatchObject([{ id: result.decisionId, proposalId: proposed.proposalId, verdict }])
  expect(memory.rejected).toBe(0)
  expect(memory.unreadable).toBeUndefined()
  expect(memory.store).toHaveLength(verdict === "indexed" ? 1 : 0)
  expect(readFileSync(f.scans, "utf8").trim().split("\n")).toHaveLength(verdict === "indexed" ? 2 : 1)
  if (verdict === "indexed") {
    expect(memory.store[0]).toMatchObject({ owner: "backend", kind: "project", entry: rule })
    expect(result.ref).toBeDefined()
    expect(memory.log.get(result.ref!.eventId)).toMatchObject({ payload: memory.store[0], contentHash: result.ref!.contentHash })
  }
})

test("L11: failure between the actual decision scan and review publication cannot activate an open proposal", async () => {
  const f = await harness.fresh()
  const proposed = harness.api.proposeProjectRule(f.binding, rule, at)
  if (!proposed.ok) throw new Error(proposed.reason)
  const before = harness.api.createDurableMemory(f.repo).read()
  expect(before.store).toHaveLength(0)
  const original = readFileSync(f.review, "utf8")
  await Bun.write(f.armed, "armed after real proposal")
  const outcome: { result?: DecisionVerdict; error?: unknown } = {}
  try {
    outcome.result = harness.api.decideProjectRule(f.binding, { proposalId: proposed.proposalId, verdict: "indexed", by: "owner" }, at)
  } catch (error) {
    outcome.error = error
  } finally {
    // Restore only the owned fault destination. Never erase any Memory written by the actual implementation.
    if (existsSync(f.backup)) {
      rmdirSync(f.review)
      renameSync(f.backup, f.review)
    }
  }
  expect(readFileSync(f.witness, "utf8")).toBe("actual record scanned")
  expect(readFileSync(f.faultPayload, "utf8")).toContain(rule.rule)
  expect(readFileSync(f.scans, "utf8").trim().split("\n").length).toBeGreaterThanOrEqual(2)
  expect(readFileSync(f.review, "utf8")).toBe(original)
  const review = harness.api.readReview(f.repo)
  const folded = harness.api.foldReview(review.records)
  const memory = harness.api.createDurableMemory(f.repo).read()
  expect(review.rejected).toBe(0)
  expect(review.unreadable).toBeUndefined()
  expect(memory.rejected).toBe(0)
  expect(memory.unreadable).toBeUndefined()
  if (outcome.result?.ok) {
    expect(folded.openMemoryProposals).toHaveLength(0)
    expect(folded.memoryDecisions).toMatchObject([{ id: outcome.result.decisionId, proposalId: proposed.proposalId, verdict: "indexed" }])
    expect(memory.store).toHaveLength(1)
    expect(memory.store[0]).toMatchObject({ owner: "backend", kind: "project", entry: rule })
    expect(outcome.result.ref).toBeDefined()
    expect(memory.log.get(outcome.result.ref!.eventId)).toMatchObject({ payload: memory.store[0], contentHash: outcome.result.ref!.contentHash })
    return
  }
  expect(folded.openMemoryProposals.map((proposal) => proposal.id)).toEqual([proposed.proposalId])
  expect(folded.memoryDecisions).toHaveLength(0)
  expect(memory.store).toEqual(before.store)
})
