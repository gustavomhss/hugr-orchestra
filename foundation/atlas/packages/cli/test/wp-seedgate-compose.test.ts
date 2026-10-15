// @atlas/cli — test/wp-seedgate-compose.test.ts  (WP-SEEDGATE.COMPOSE · REQ-CLI-4d)
//
// THE DEFECT. `atlas mine` on a real repository staged ZERO candidates, always: `withDefaults` fell back to
// an abstaining stub and nothing in production ever injected a gate, so `makeAdmitGate` — the gate that
// forwards the frozen `admit` — had zero production callers. REQ-CLI-4a/4b/4c constrain what the driver must
// NOT do and are silent on who SUPPLIES admission, so every run that admitted zero satisfied all three.
// REQ-CLI-4d is the missing obligation and this suite is its acceptance.
//
// THE TRAP THIS SUITE IS BUILT TO AVOID (paid for once already, on D5): a black-box story that "proves
// reachability" while running on a fixture with ZERO sites proves nothing. So the frontier size is ASSERTED
// non-zero in the positive case, and the negative case runs the SAME repo, the SAME proposer and the SAME
// frontier with only the gate removed — without which the suite could not tell a working gate from an
// absent one, which is precisely the indistinguishability that let the product ship mining nothing.
//
// `makeIndexedRepo` is a REAL git repository with a REAL `.atlas/index.scip` dump (two indexed documents,
// one resolved def→ref edge, one unresolved reference). Nothing here is hand-built: the frontier comes from
// the production `createSkeletonSource` walk over that dump, exactly as `atlas mine <repo>` gets it.

import { describe, it, expect, afterAll } from "vitest"
import { driveMinePass, runMine, UNWIRED_GATE_REASON, unwiredGate, makeAdmitGate } from "../src/mine.js"
import { buildMineAdmission, createSkeletonSource } from "@atlas/adapter-io"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, SeedProposal, SiteProposer } from "@atlas/genesis"
import { makeIndexedRepo, cleanupIndexedRepos } from "./mine-fixtures.js"

afterAll(cleanupIndexedRepos)

/** A spy proposer that returns a candidate at EVERY site and counts its calls — the `$0`-LLM stand-in. No
 *  model is resolved when a proposer is injected, so every case below is hermetic by construction. */
const spyProposer = (): { proposer: SiteProposer; calls: () => number } => {
  let n = 0
  return {
    proposer: {
      propose: (c: Candidate): SeedProposal => {
        n += 1
        return { cand: c, claim: `the unit at ${c.site.qualifiedPath} is reachable from one seam` }
      },
    },
    calls: () => n,
  }
}

describe("SCN-CLI-4d-1 — a non-empty frontier reaches the GATE'S verdict, not an unwired default", () => {
  it("stages the run-controller's admitted set over a real SCIP-indexed repo", async () => {
    const repo = makeIndexedRepo()
    const spy = spyProposer()

    // PRODUCTION DEFAULTS for every seam that matters: the real skeleton walk, the real history probe, the
    // real store, and — the thing under test — NO injected gate, so the composition root must supply one.
    const pass = driveMinePass(repo, { proposer: spy.proposer })

    // THE FRONTIER IS NON-EMPTY, asserted before anything is concluded from the outcome (the D5 lesson).
    expect(pass.report.budgetSpent).toBeGreaterThan(0)
    expect(pass.report.budgetSpent).toBe(2) // `src/util.ts` + `src/app.ts`, the two indexed documents
    expect(spy.calls()).toBe(2) //             the proposer really returned a candidate at every site

    // THE GATE'S VERDICT WAS REACHED, and it ADMITTED. teeth (breaks-on "the supply is removed again"): the
    // unwired stub abstains at every site, so this count collapses to 0 the moment the fallback regresses.
    expect(pass.report.seeded.length).toBe(2)
    for (const f of pass.report.seeded) {
      expect(f.kind).toBe("advisory")
      expect(f.freshness).toBe("FRESH") //     the receipt re-derived — the truth door was really consulted
      expect(f.obviousness?.by).toBe("harness-predicate") // ADR-0012 TOTALITY: scored, never self-scored
    }

    // …and the CLI reports it, through the shipped fold. A FRESH repo, deliberately: the pass above already
    // staged both rows into `repo`, and a mined candidate never re-authors an established one (mine.ts
    // `decide`), so a second pass over the same sidecar admits at the gate and then writes nothing.
    const v = await runMine(makeIndexedRepo(), { proposer: spyProposer().proposer })
    expect(v.exitCode).toBe(0)
    expect(v.stdout).toContain("genesis: seeded 2 candidate fact(s)")
    expect(v.stdout).not.toContain("0 candidate facts")
  })

  it("the supplied gate REFUSES with a stated reason when the anchor cannot re-derive — never the unwired text", () => {
    const repo = makeIndexedRepo()
    // The PRODUCTION axes — the same `SkeletonSource` the pass ranks its sites out of, never a second walk.
    const axes = createSkeletonSource(repo).skeleton(repo, "HEAD").axes
    const { deps, reground } = buildMineAdmission(axes, { documents: [] })
    const gate = makeAdmitGate(deps, reground)

    const site: StructRef = {
      kind: "file",
      qualifiedPath: "src/util.ts",
      subtreeHash: asSubtreeHash("not-the-current-hash"),
    }
    const gone: StructRef = {
      kind: "file",
      qualifiedPath: "src/deleted-yesterday.ts",
      subtreeHash: asSubtreeHash("nor-is-this"),
    }
    const cand = (s: StructRef): Candidate => ({
      site: s,
      rank: 0,
      ppr: 1,
      signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
    })
    const seed = (c: Candidate): SeedProposal => ({ cand: c, claim: "a claim about a unit" })

    // A LIVE path: the recorded oracle leg is stale, but `reground` re-derives it ⇒ ADMITTED. This is the
    // half that makes the gate useful — a mined seed carries the DEPENDENCY-axis identity as its
    // `subtreeHash` (genesis/src/seeds.ts:145), which `driftDetect` refuses by construction.
    const live = gate.emit(seed(cand(site)), cand(site))
    expect(live.emitted).toBe(true)

    // A DEAD path: nothing to re-derive ⇒ GROUND-3 yields an empty receipt ⇒ the truth door DROPS it, by
    // name. A refusal with a stated reason is a gate verdict; the unwired stub's text is not.
    const dead = gate.emit(seed(cand(gone)), cand(gone))
    expect(dead.emitted).toBe(false)
    if (dead.emitted) throw new Error("unreachable")
    expect(dead.whyNot.reason).toContain("truth door")
    expect(dead.whyNot.reason).not.toBe(UNWIRED_GATE_REASON)
  })
})

describe("SCN-CLI-4d-2 — with the gate deliberately ABSENT the run still abstains, and says so", () => {
  it("is the control: same repo, same proposer, same frontier — only the supply is removed", async () => {
    const repo = makeIndexedRepo()
    const spy = spyProposer()

    const pass = driveMinePass(repo, { proposer: spy.proposer, gate: unwiredGate() })

    // The frontier and the model spend are IDENTICAL to the positive case above…
    expect(pass.report.budgetSpent).toBe(2)
    expect(spy.calls()).toBe(2)
    // …and NOTHING is staged. Without this pair, "2 candidates" in the positive case is attributable to
    // anything in the pass; with it, it is attributable to the gate and to nothing else.
    expect(pass.report.seeded.length).toBe(0)

    // AND IT SAYS SO — the abstention names the WIRING, never the repository. teeth (breaks-on "the unwired
    // gate stops naming itself"): a stub that abstained anonymously is what made an unsupplied gate and an
    // empty repository render identically for the whole life of this command.
    const cand: Candidate = {
      site: { kind: "file", qualifiedPath: "src/util.ts", subtreeHash: asSubtreeHash("h") },
      rank: 0,
      ppr: 1,
      signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
    }
    const verdict = unwiredGate().emit({ cand, claim: "c" }, cand)
    expect(verdict.emitted).toBe(false)
    if (verdict.emitted) throw new Error("unreachable")
    expect(verdict.whyNot.reason).toBe(UNWIRED_GATE_REASON)
    expect(UNWIRED_GATE_REASON).toContain("no admission seam wired")

    const v = await runMine(repo, { proposer: spyProposer().proposer, gate: unwiredGate() })
    expect(v.stdout).toContain("0 candidate facts")
  })
})
