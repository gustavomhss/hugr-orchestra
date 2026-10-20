// @atlas/adapter-io — test/review-decide.test.ts  (R3 / D29: `decideProposal` and `emitOutcomeOf`)

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { GroundedFact } from "@atlas/knowledge"
import { decideProposal, emitOutcomeOf } from "../src/review-decide.js"
import type { EmitOutcome } from "../src/review-decide.js"
import { appendReview, foldReview, readReview, reviewLogPath } from "../src/review-log.js"
import type { CurrentFact } from "../src/review-store.js"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-review-decide-"))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const NOW = "2026-10-18T10:00:00.000Z"
const LATER = "2026-10-18T11:00:00.000Z"

const current = (tier: string, authoring = "ADVISORY"): CurrentFact => ({
  node: { nodeKey: "nk-a", family: "advisory", contentHash: "h-a", claims: ["a holds"] } as unknown as CurrentFact["node"],
  fact: {
    kind: "advisory",
    id: "nk-a",
    tier,
    claimNorm: "a holds",
    grounding: { entries: [] },
    freshness: "FRESH",
    claims: [],
    authoring,
    scope: "core",
  } as unknown as GroundedFact,
})

const propose = () => appendReview(tmp, { kind: "proposal", nodeKey: "nk-a", toTier: "T1", reason: "it holds", at: NOW, by: "lucy" }).id

/** An emit door that records every fact it is handed and answers `outcome`. */
function door(outcome: EmitOutcome = { emitted: true, id: "h-new" }) {
  const seen: GroundedFact[] = []
  return { seen, emit: (fact: GroundedFact) => (seen.push(fact), outcome) }
}

const input = (proposalId: string, verdict: "ratified" | "rejected", reason = "reviewed") => ({
  proposalId,
  verdict,
  reason,
  by: "gus",
  at: LATER,
})

describe("decideProposal", () => {
  it("rejects: appends the decision and never calls the door", () => {
    const id = propose()
    const d = door()
    const out = decideProposal(tmp, input(id, "rejected", "  too broad "), d.emit, () => current("T2"))
    if (!out.ok) throw new Error(out.reason)
    expect([out.proposal.id, out.decision.verdict, out.decision.reason, out.decision.by, out.decision.at]).toEqual([
      id,
      "rejected",
      "too broad",
      "gus",
      LATER,
    ])
    expect(out.emittedId).toBeUndefined()
    expect(d.seen).toHaveLength(0)
    const fold = foldReview(readReview(tmp).records)
    expect([fold.openProposals.length, fold.decisions.length]).toEqual([0, 1])
  })

  it("ratifies: re-emits the current fact at the proposed tier, then appends the decision", () => {
    const id = propose()
    const d = door()
    const out = decideProposal(tmp, input(id, "ratified"), d.emit, () => current("T2"))
    if (!out.ok) throw new Error(out.reason)
    expect([out.decision.verdict, out.emittedId]).toEqual(["ratified", "h-new"])
    expect(d.seen.map((f) => (f as unknown as { tier: string }).tier)).toEqual(["T1"])
    expect(foldReview(readReview(tmp).records).openProposals).toHaveLength(0)
  })

  it("a refused ratification writes no decision and keeps the proposal open", () => {
    const id = propose()
    const refusing = door({ emitted: false, rejected: "unratified: needs a ratifier" })
    const out = decideProposal(tmp, input(id, "ratified"), refusing.emit, () => current("T2"))
    expect(out).toMatchObject({ ok: false, refusal: "governed" })
    if (out.ok) throw new Error("expected a refusal")
    expect(out.reason).toContain("unratified: needs a ratifier")
    expect(out.reason).toContain("no decision was written and the proposal stays open")
    const fold = foldReview(readReview(tmp).records)
    expect([fold.openProposals.length, fold.decisions.length]).toEqual([1, 0])
  })

  it("refuses a ratification when the fact is gone or retired, without calling the door", () => {
    const id = propose()
    for (const factOf of [() => undefined, () => current("T2", "SUPERSEDED")]) {
      const d = door()
      const out = decideProposal(tmp, input(id, "ratified"), d.emit, factOf)
      expect(out).toMatchObject({ ok: false, refusal: "governed" })
      if (out.ok) throw new Error("expected a refusal")
      expect(out.reason).toContain("is no longer a current, live fact")
      expect(d.seen).toHaveLength(0)
    }
    expect(foldReview(readReview(tmp).records).decisions).toHaveLength(0)
  })

  it("resolves an 8-character prefix and refuses an unknown or closed proposal", () => {
    const id = propose()
    const short = decideProposal(tmp, input(id.slice(0, 4), "rejected"), door().emit, () => current("T2"))
    expect(short).toEqual({
      ok: false,
      refusal: "invalid",
      reason: `decide: no open proposal matches '${id.slice(0, 4)}' — \`atlas proposals\` lists the open ones (a decided proposal is closed)`,
    })
    expect(decideProposal(tmp, input(id.slice(0, 8), "rejected"), door().emit, () => current("T2")).ok).toBe(true)
    const again = decideProposal(tmp, input(id, "rejected"), door().emit, () => current("T2"))
    expect(again).toMatchObject({ ok: false, refusal: "invalid" })
  })

  it("refuses a blank reason, and a log with a line that does not verify", () => {
    const id = propose()
    expect(decideProposal(tmp, input(id, "rejected", "  "), door().emit, () => current("T2"))).toEqual({
      ok: false,
      refusal: "invalid",
      reason: "decide requires a reason after the verdict",
    })
    appendFileSync(reviewLogPath(tmp), "{torn\n")
    const torn = decideProposal(tmp, input(id, "rejected"), door().emit, () => current("T2"))
    expect(torn).toMatchObject({ ok: false, refusal: "governed" })
    if (torn.ok) throw new Error("expected a refusal")
    expect(torn.reason).toContain("has 1 line(s) that do not verify")
  })
})

describe("emitOutcomeOf", () => {
  const guidance = { next: "n", invariant: "i" }
  it("reduces the door's verdict on the admitted and the refused path", () => {
    expect(emitOutcomeOf({ ok: true, data: { emitted: true, id: "h1" }, guidance })).toEqual({ emitted: true, id: "h1" })
    expect(emitOutcomeOf({ ok: true, data: { emitted: true }, guidance })).toEqual({ emitted: true })
    expect(emitOutcomeOf({ ok: false, data: { emitted: false, rejected: "truth" }, guidance })).toEqual({ emitted: false, rejected: "truth" })
    expect(emitOutcomeOf({ ok: false, rejected: "authz", guidance })).toEqual({ emitted: false, rejected: "authz" })
    expect(emitOutcomeOf({ ok: false, guidance })).toEqual({ emitted: false, rejected: "the emit door refused without a reason" })
  })
})
