// @atlas/adapter-io — test/review-answer.test.ts  (R11 / D29: `answerQuestion` and `interviewOf`)

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RankedQuestion } from "@atlas/genesis"
import { asSubtreeHash } from "@atlas/kernel"
import { interviewOf } from "../src/open-questions-source.js"
import { answerQuestion } from "../src/review-answer.js"
import { foldReview, readReview, reviewLogPath } from "../src/review-log.js"

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
const questions = (answered: ReadonlySet<string>) => ALL.filter((x) => !answered.has(x.id))

const NOW = "2026-10-18T10:00:00.000Z"
const LATER = "2026-10-18T11:00:00.000Z"
const DRAFT = { model: "anthropic/claude", why: "an invariant on a file many depend on" }

let tmp = ""
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-review-answer-"))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const ask = (questionId: string, answer: string, at = NOW, drafted?: typeof DRAFT) =>
  answerQuestion(tmp, { questionId, answer, by: "gus", at, ...(drafted !== undefined ? { drafted } : {}) }, questions)

describe("interviewOf", () => {
  it("serves a capped batch and counts the deferred tail", () => {
    const interview = interviewOf(tmp, questions)
    expect([interview.batch.length, interview.deferred]).toEqual([20, 5])
    expect(interview.batch[0]?.id).toBe("q0000000000")
    expect(interview.batch[0]?.draft).toBeUndefined()
  })
})

describe("answerQuestion", () => {
  it("records a person's owner answer, which drops out of the next batch", () => {
    const out = ask("q0000000005", "  a person on the team ")
    if (!out.ok) throw new Error(out.reason)
    expect([out.answer.answer, out.answer.by, out.answer.at, out.proposal, out.pending]).toEqual([
      "a person on the team",
      "gus",
      NOW,
      undefined,
      undefined,
    ])
    const interview = interviewOf(tmp, questions)
    expect(interview.batch.some((x) => x.id === "q0000000005")).toBe(false)
    expect(interview.deferred).toBe(4)
  })

  it("a person's T1 tier answer appends a proposal; a second one reuses it", () => {
    const first = ask("q0000000000", "T1")
    if (!first.ok) throw new Error(first.reason)
    expect([first.proposal?.nodeKey, first.proposal?.toTier, first.proposal?.by]).toEqual(["nk-t", "T1", "gus"])
    const second = ask("q0000000001", "T1")
    if (!second.ok) throw new Error(second.reason)
    expect([second.proposal, second.pending?.id]).toEqual([undefined, first.proposal?.id])
    expect(foldReview(readReview(tmp).records).openProposals).toHaveLength(1)
  })

  it("a drafted answer never proposes, keeps the question open, and rides along as its draft", () => {
    const drafted = ask("q0000000000", "T1", NOW, DRAFT)
    if (!drafted.ok) throw new Error(drafted.reason)
    expect([drafted.answer.drafted, drafted.proposal]).toEqual([DRAFT, undefined])
    expect(foldReview(readReview(tmp).records).openProposals).toHaveLength(0)
    const open = interviewOf(tmp, questions).batch.find((x) => x.id === "q0000000000")
    expect(open?.draft).toEqual({ answer: "T1", model: DRAFT.model, why: DRAFT.why, by: "gus", at: NOW })
    const accepted = ask("q0000000000", "T1", LATER)
    if (!accepted.ok) throw new Error(accepted.reason)
    expect(accepted.proposal?.toTier).toBe("T1")
    expect(interviewOf(tmp, questions).batch.some((x) => x.id === "q0000000000")).toBe(false)
  })

  it("refuses an unknown question, a blank answer and a draft without its model", () => {
    expect(ask("q9999999999", "x")).toEqual({
      ok: false,
      refusal: "invalid",
      reason: "answer: no open question matches 'q9999999999' — `atlas interview` lists the open batch (an answered question drops out)",
    })
    expect(ask("q0000000005", "  ")).toEqual({ ok: false, refusal: "invalid", reason: "answer requires the answer text after the question id" })
    expect(ask("q0000000005", "x", NOW, { model: " ", why: "w" })).toEqual({
      ok: false,
      refusal: "invalid",
      reason: "answer: a drafted answer names its model and why",
    })
    expect(readReview(tmp).records).toHaveLength(0)
  })

  it("resolves a unique 8-character prefix and refuses on a log with a line that does not verify", () => {
    expect(ask("q00000000", "x").ok).toBe(false)
    expect(ask("q0000000007", "x").ok).toBe(true)
    appendFileSync(reviewLogPath(tmp), "{torn\n")
    const torn = ask("q0000000008", "x")
    expect(torn).toMatchObject({ ok: false, refusal: "governed" })
  })
})
