import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { asSubtreeHash } from "@atlas/kernel"
import type { RankedQuestion } from "@atlas/genesis"
import { readReview, foldReview } from "@atlas/adapter-io"
import { runInterview, runAnswer, type InterviewPorts } from "../src/interview-cli.js"
import { REVIEW_COMMANDS } from "../src/review-cli.js"

const site = { kind: "file", qualifiedPath: "packages/a/src/x.ts", subtreeHash: asSubtreeHash("s") } as const
const q = (i: number, kind: RankedQuestion["kind"] = "owner", nodeKey?: string): RankedQuestion => ({
  id: `q${String(i).padStart(10, "0")}`,
  kind,
  subject: `subject-${i}`,
  site,
  ask: `question ${i}?`,
  rank: 100 - i,
  rankReason: `reason ${i}`,
  ...(kind === "tier" ? { options: ["Rule · T1", "Core · T0", "Keep as a hint"] } : {}),
  ...(nodeKey !== undefined ? { nodeKey } : {}),
})
const ALL = [q(0, "tier", "nk-t"), q(1, "tier", "nk-t"), ...Array.from({ length: 23 }, (_, i) => q(i + 2))]

let tmp = ""
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-interview-"))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const ports = (): InterviewPorts => ({ repoPath: tmp, now: () => "2026-10-18T10:00:00.000Z", questions: (answered) => ALL.filter((x) => !answered.has(x.id)) })

describe("interview-cli", () => {
  it("serves a capped batch", () => {
    const r = runInterview(ports(), {})
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("20 question(s) in this session's batch (at most 20); 5 deferred")
    expect(r.stdout).toContain("  q0000000000 tier rank 100: question 0?")
    expect(r.stdout).toContain("      options: Rule · T1 | Core · T0 | Keep as a hint")
    expect(r.stdout).not.toContain("question 20?")
  })

  it("prints json", () => {
    const r = runInterview(ports(), { json: "true" })
    expect(r.exitCode).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.batch.length).toBe(20)
    expect(parsed.deferred).toBe(5)
    expect(parsed.batch[0].id).toBe("q0000000000")
  })

  it("requires --by", () => {
    const r = runAnswer(ports(), ["q0000000005", "alice"], {})
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("answer requires --by <actor>")
  })

  it("rejects unknown question", () => {
    const r = runAnswer(ports(), ["q9999999999", "x"], { by: "gus" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("no open question matches")
  })

  it("records an owner answer", () => {
    const r = runAnswer(ports(), ["q0000000005", "a", "person", "on", "the", "team"], { by: "gus" })
    expect(r.exitCode).toBe(0)
    const fold = foldReview(readReview(tmp).records)
    expect(fold.answers.get("q0000000005")?.answer).toBe("a person on the team")
    expect(fold.openProposals).toHaveLength(0)
    const r2 = runInterview(ports(), { json: "true" })
    expect(JSON.parse(r2.stdout).deferred).toBe(4)
  })

  it("records a tier answer as a proposal", () => {
    const r = runAnswer(ports(), ["q0000000000", "T1"], { by: "gus" })
    expect(r.exitCode).toBe(0)
    const fold = foldReview(readReview(tmp).records)
    expect(fold.openProposals).toHaveLength(1)
    expect(fold.openProposals[0]?.nodeKey).toBe("nk-t")
    expect(fold.openProposals[0]?.toTier).toBe("T1")
    expect(fold.openProposals[0]?.by).toBe("gus")
    expect(r.stdout).toContain("waits for `atlas decide`")
  })

  it("reuses an open proposal", () => {
    runAnswer(ports(), ["q0000000000", "T1"], { by: "gus" })
    const r = runAnswer(ports(), ["q0000000001", "T1"], { by: "gus" })
    expect(r.exitCode).toBe(0)
    const fold = foldReview(readReview(tmp).records)
    expect(fold.openProposals).toHaveLength(1)
    expect(r.stdout).toContain("already open for nk-t -> T1")
  })

  it("records a keep answer without a proposal", () => {
    const r = runAnswer(ports(), ["q0000000000", "keep"], { by: "gus" })
    expect(r.exitCode).toBe(0)
    const fold = foldReview(readReview(tmp).records)
    expect(fold.answers.get("q0000000000")?.answer).toBe("keep")
    expect(fold.openProposals).toHaveLength(0)
  })

  it("resolves id prefixes", () => {
    const r1 = runAnswer(ports(), ["q00000000", "x"], { by: "gus" })
    expect(r1.exitCode).toBe(1)
    const r2 = runAnswer(ports(), ["q0000000007", "x"], { by: "gus" })
    expect(r2.exitCode).toBe(0)
  })

  it("registers review commands", () => {
    expect(typeof REVIEW_COMMANDS.interview).toBe("function")
    expect(typeof REVIEW_COMMANDS.answer).toBe("function")
  })
})
