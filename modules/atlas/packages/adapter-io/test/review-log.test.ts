import { mkdtempSync, rmSync } from "node:fs"
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ReviewOf } from "../src/review-log.js"
import { appendReview, foldReview, readReview, reviewLogPath } from "../src/review-log.js"
const T1 = "2026-10-18T10:00:00.000Z"
const T2 = "2026-10-18T11:00:00.000Z"
const T3 = "2026-10-18T12:00:00.000Z"

describe("review-log", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "atlas-review-log-"))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("reads an empty log when nothing exists", () => {
    expect(readReview(dir)).toEqual({ records: [], rejected: 0 })
  })

  it("appends and reads one hold", () => {
    const record = appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: T1, by: "alice" })
    expect(record.id).toBe(String(id({ kind: "hold", nodeKey: "nk-a", at: T1, by: "alice" })))
    expect(readReview(dir).records).toEqual([record])
    expect(readReview(dir).rejected).toBe(0)
    expect(existsSync(reviewLogPath(dir))).toBe(true)
    expect(reviewLogPath(dir)).toBe(join(dir, ".atlas", "project", "review.jsonl"))
  })

  it("dedupes an identical append", () => {
    appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: T1, by: "alice" })
    appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: T1, by: "alice" })
    expect(readReview(dir).records).toHaveLength(1)
  })

  it("folds holds and releases by at", () => {
    appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: T1, by: "alice" })
    appendReview(dir, { kind: "release", nodeKey: "nk-a", at: T2, by: "alice" })
    expect(foldReview(readReview(dir).records).held.has("nk-a")).toBe(false)
    appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: T3, by: "alice" })
    expect(foldReview(readReview(dir).records).held.has("nk-a")).toBe(true)

    appendReview(dir, { kind: "hold", nodeKey: "nk-b", at: T3, by: "alice" })
    appendReview(dir, { kind: "release", nodeKey: "nk-b", at: T2, by: "alice" })
    expect(foldReview(readReview(dir).records).held.has("nk-b")).toBe(true)
  })

  it("opens and closes proposals", () => {
    const proposal = appendReview(dir, {
      kind: "proposal",
      nodeKey: "nk-a",
      toTier: "T1",
      reason: "it holds",
      at: T1,
      by: "lucy",
    })
    expect(foldReview(readReview(dir).records).openProposals).toHaveLength(1)
    expect(foldReview(readReview(dir).records).openProposals[0]?.id).toBe(proposal.id)
    appendReview(dir, {
      kind: "decision",
      proposalId: proposal.id,
      verdict: "rejected",
      reason: "too broad",
      at: T2,
      by: "gus",
    })
    const folded = foldReview(readReview(dir).records)
    expect(folded.openProposals).toHaveLength(0)
    expect(folded.decisions).toHaveLength(1)
  })

  it("opens and closes memory proposals", () => {
    const proposal = appendReview(dir, {
      kind: "memory-proposal",
      member: "backend",
      rule: "run test:ci",
      scope: "packages/core",
      at: T1,
      by: "lucy",
    })
    appendReview(dir, {
      kind: "memory-decision",
      proposalId: proposal.id,
      verdict: "indexed",
      rule: "always run test:ci",
      at: T2,
      by: "gus",
    })
    const folded = foldReview(readReview(dir).records)
    expect(folded.openMemoryProposals).toHaveLength(0)
    expect(folded.memoryDecisions[0]?.rule).toBe("always run test:ci")
  })

  it("keeps the latest answer and reads drafted", () => {
    appendReview(dir, { kind: "answer", questionId: "q1", answer: "alice", at: T1, by: "alice" })
    appendReview(dir, { kind: "answer", questionId: "q1", answer: "bob", at: T2, by: "bob" })
    expect(foldReview(readReview(dir).records).answers.get("q1")?.answer).toBe("bob")
    appendReview(dir, {
      kind: "answer",
      questionId: "q2",
      answer: "drafted",
      drafted: { model: "m", why: "w" },
      at: T1,
      by: "alice",
    })
    const draftedRecord = readReview(dir).records.find(
      (r): r is ReviewOf<"answer"> => r.kind === "answer" && r.questionId === "q2",
    )
    expect(draftedRecord?.drafted).toEqual({ model: "m", why: "w" })
  })

  it("counts a torn line", () => {
    appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: T1, by: "alice" })
    appendFileSync(reviewLogPath(dir), "{not json\n")
    appendReview(dir, { kind: "release", nodeKey: "nk-a", at: T2, by: "alice" })
    const read = readReview(dir)
    expect(read.records).toHaveLength(2)
    expect(read.rejected).toBe(1)
  })

  it("rejects an edited payload", () => {
    appendReview(dir, {
      kind: "proposal",
      nodeKey: "nk-a",
      toTier: "T1",
      reason: "it holds",
      at: T1,
      by: "lucy",
    })
    const path = reviewLogPath(dir)
    const text = readFileSync(path, "utf8")
    writeFileSync(path, text.replace('"it holds"', '"it does not hold"'))
    const read = readReview(dir)
    expect(read.records).toHaveLength(0)
    expect(read.rejected).toBe(1)
  })

  it("throws on malformed input and writes nothing", () => {
    expect(() =>
      appendReview(dir, {
        kind: "proposal",
        nodeKey: "nk-a",
        toTier: "T2",
        reason: "x",
        at: T1,
        by: "lucy",
      } as never),
    ).toThrow("review-log: refusing to append a malformed 'proposal' record")
    expect(existsSync(reviewLogPath(dir))).toBe(false)

    expect(() =>
      appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: T1, by: "" } as never),
    ).toThrow("review-log: refusing to append a malformed 'hold' record")
  })

  it("drops extra fields", () => {
    const record = appendReview(dir, {
      kind: "hold",
      nodeKey: "nk-a",
      at: T1,
      by: "alice",
      extra: 1,
    } as never)
    expect("extra" in record).toBe(false)
    expect(record.id).toBe(String(id({ kind: "hold", nodeKey: "nk-a", at: T1, by: "alice" })))
  })
})
