// @atlas/genesis — test/wp-8.30-gen-witness.test.ts  (#210 model identity · #209 the report WITNESSES storage)
//
// #210: `GenesisReport.modelIdentity` — wired ⇒ the threaded identity string; unwired ⇒ the sentinel.
// #209 — THE LOAD-BEARING ONE: a run report byte-identical regardless of what was actually STORED is the
// 2026-08-04 defect (a run whose answers were 87.5% destroyed produced a report indistinguishable from a
// clean one). These teeth construct two runs whose STORED answer sets differ (different `answerRef`s on the
// admitted rows, via `ControllerDeps.answerReceipts`) with `modelCalls` (issued) held EQUAL, and assert the
// reports are NOT byte-identical: `answersDigest` differs and `answersStored` reflects the true stored count.
// A mutation that makes `answersDigest` ignore the answers (e.g. a constant, or a digest of `answersStored`
// alone) turns this RED, because the two runs below have the SAME `answersStored` count (2) with DIFFERENT
// content.
//
// SCOPE, STATED PRECISELY (no overclaim): this makes the ISSUED-VS-STORED CARDINALITY visible (`modelCalls`
// vs `answersStored`) and every counted `answerRef` independently auditable back to real stored bytes. It
// does NOT prove a dropped answer could never be masked by a stale-but-valid `answerRef` substituted at the
// same rank — nothing on the ISSUED side is fingerprinted at emission; that is a further step, not this
// one's claim.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, Fact, MinedSignals } from "@atlas/genesis"
import type { Skeleton } from "@atlas/genesis"
import { makeRunController, NO_MODEL_IDENTITY, type Plan, type ControllerDeps } from "../src/run-controller.js"

const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }

const siteOf = (file: string, id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `${file}::${id}`,
  subtreeHash: asSubtreeHash(`st-${file}-${id}`),
})

const cand = (file: string, id: string, ppr: number, rank: number): Candidate => ({
  site: siteOf(file, id),
  signals: ZERO_SIGNALS,
  ppr,
  rank,
})

const factFor = (c: Candidate): Fact =>
  ({
    kind: "advisory",
    id: asNodeKey(`nk-${c.site.qualifiedPath}`),
    tier: "T2",
    claimNorm: `claim@${c.site.qualifiedPath}`,
    grounding: { entries: [{ anchor: c.site, path: c.site.qualifiedPath }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }) as unknown as Fact

const SKELETON = { axes: {}, manifest: { territories: [] } } as unknown as Skeleton

const planOf = (sites: readonly Candidate[]): Plan => ({ malformed: false, skeleton: SKELETON, sites })

/** Build `ControllerDeps` over a fixed 3-site frontier. Every site is VISITED (so `modelCalls`/`llmCalls`
 *  are identical across the two runs the #209 test compares) but only the sites named in `stored` carry a
 *  receipt in `answerReceipts` — modelling "issued at every site, admitted-with-a-receipt at only some",
 *  exactly the gap #209 exists to make visible. */
function depsWithReceipts(
  sites: readonly Candidate[],
  stored: ReadonlyMap<string, string>, // qualifiedPath → answerRef, for the sites that stored one
  modelIdentity?: string,
): ControllerDeps {
  return {
    plan: () => planOf(sites),
    visit: (c) => [factFor(c)],
    upsert: (incoming) => incoming,
    changed: () => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
    handoffTo: () => {},
    ...(modelIdentity !== undefined ? { modelIdentity } : {}),
    answerReceipts: () => [...stored.values()],
  }
}

describe("#210 — GenesisReport.modelIdentity", () => {
  it("unwired ⇒ the sentinel, never a fabricated identity", () => {
    const sites = [cand("a.ts", "s1", 0.9, 1)]
    const api = makeRunController(depsWithReceipts(sites, new Map()))
    const report = api.genesis("repo", "rev")
    expect(report.modelIdentity).toBe(NO_MODEL_IDENTITY)
  })

  it("wired ⇒ the threaded identity string, verbatim", () => {
    const sites = [cand("a.ts", "s1", 0.9, 1)]
    const identity = "claude -p @ 1.2.3"
    const api = makeRunController(depsWithReceipts(sites, new Map(), identity))
    const report = api.genesis("repo", "rev")
    expect(report.modelIdentity).toBe(identity)
  })

  it("a caller that never wires `answerReceipts`/`modelIdentity` still gets an honest total-degrade report", () => {
    // A malformed plan (no seam wired at all) — the total-degrade path (emptyReport) must ALSO carry the
    // sentinel + the empty-set witness, never `undefined`/a throw.
    const api = makeRunController({
      plan: () => {
        throw new Error("corrupt")
      },
      visit: () => [],
      upsert: (incoming) => incoming,
      changed: () => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
      handoffTo: () => {},
    })
    const report = api.genesis("repo", "rev")
    expect(report.modelIdentity).toBe(NO_MODEL_IDENTITY)
    expect(report.answersStored).toBe(0)
    expect(typeof report.answersDigest).toBe("string")
  })
})

describe("#209 — the report WITNESSES what was actually stored, not merely issued", () => {
  const sites = [cand("a.ts", "s1", 0.9, 1), cand("b.ts", "s2", 0.8, 2), cand("c.ts", "s3", 0.7, 3)]

  it("THE TEETH: two runs with the SAME issued count but DIFFERENT stored answers produce DIFFERENT reports", () => {
    // Run A: s1 and s2 admitted with a receipt (s3 abstained/no-receipt — absent, never fabricated).
    const runA = makeRunController(
      depsWithReceipts(
        sites,
        new Map([
          ["s1", "cas:aaa"],
          ["s2", "cas:bbb"],
        ]),
      ),
    )
    // Run B: SAME site count issued (3 sites visited ⇒ modelCalls/llmCalls equal to run A), but DIFFERENT
    // stored answers — s1 and s3 this time, and s1's receipt bytes differ too.
    const runB = makeRunController(
      depsWithReceipts(
        sites,
        new Map([
          ["s1", "cas:aaa-different"],
          ["s3", "cas:ccc"],
        ]),
      ),
    )

    const reportA = runA.genesis("repo", "rev")
    const reportB = runB.genesis("repo", "rev")

    // issued (modelCalls) is falsifiably EQUAL — both runs visited/paid for the same 3 sites.
    expect(reportA.modelCalls).toBe(reportB.modelCalls)
    expect(reportA.llmCalls).toBe(reportB.llmCalls)
    // stored (answersStored) is ALSO equal in count (2 each) — a count-only witness would miss this defect.
    expect(reportA.answersStored).toBe(2)
    expect(reportB.answersStored).toBe(2)
    // yet the CONTENT stored differs, and the digest — the actual #209 witness — must say so.
    expect(reportA.answersDigest).not.toBe(reportB.answersDigest)
    // the whole report is therefore NOT byte-identical, closing the 2026-08-04 defect class.
    expect(JSON.stringify(reportA)).not.toBe(JSON.stringify(reportB))
  })

  it("answersStored counts ONLY facts carrying a receipt — absent answerRef is never fabricated", () => {
    // Only 1 of 3 visited sites stored a receipt (the other two: abstained, or a non-mine/pre-#195 fact).
    const api = makeRunController(depsWithReceipts(sites, new Map([["s2", "cas:only-one"]])))
    const report = api.genesis("repo", "rev")
    expect(report.modelCalls).toBe(3) // 3 sites issued
    expect(report.answersStored).toBe(1) // but only 1 carried a receipt — fail-closed, not "3 assumed"
  })

  it("order-independence: the SAME stored set, admitted in a different order, witnesses IDENTICALLY", () => {
    const depsFwd: ControllerDeps = {
      plan: () => planOf(sites),
      visit: (c) => [factFor(c)],
      upsert: (incoming) => incoming,
      changed: () => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
      handoffTo: () => {},
      answerReceipts: () => ["cas:aaa", "cas:bbb", "cas:ccc"],
    }
    const depsRev: ControllerDeps = { ...depsFwd, answerReceipts: () => ["cas:ccc", "cas:aaa", "cas:bbb"] }

    const a = makeRunController(depsFwd).genesis("repo", "rev")
    const b = makeRunController(depsRev).genesis("repo", "rev")
    expect(a.answersStored).toBe(b.answersStored)
    expect(a.answersDigest).toBe(b.answersDigest)
  })

  it("an unwired `answerReceipts` port honestly witnesses zero — never a throw, never a fabricated count", () => {
    const api = makeRunController({
      plan: () => planOf(sites),
      visit: (c) => [factFor(c)],
      upsert: (incoming) => incoming,
      changed: () => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
      handoffTo: () => {},
      // no `answerReceipts` wired at all
    })
    const report = api.genesis("repo", "rev")
    expect(report.answersStored).toBe(0)
    expect(typeof report.answersDigest).toBe("string")
    expect(report.answersDigest!.length).toBeGreaterThan(0)
  })
})
