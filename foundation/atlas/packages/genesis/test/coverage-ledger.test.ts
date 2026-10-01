// @atlas/genesis — test/coverage-ledger.test.ts  (WP-8.30.GEN · GEN-8 + GEN-12g — the per-site RUN LEDGER)
//
// The goldens transcribed here are SCN-GEN-12g-3, SCN-GEN-12g-4 and SCN-GEN-8a-3 (`goldens-gen.md`).
//
// WHAT WAS BROKEN, stated once so no assertion below can drift off it: a genesis run left NO durable record
// of which sites it visited. `GenesisReport` carried no abstention field and the controller's `visit` port
// returned `.facts` only, so every grounded `WhyNot` the S2 driver produced was DISCARDED. A site that
// ABSTAINED — which GEN-12g makes a valid, first-class outcome — was therefore indistinguishable from a site
// that was SILENTLY DROPPED, in every artifact the product writes. That is what makes "this repository was
// mined completely" a claim nothing can refute, and it is why the negative direction below (a DROPPED site
// must not read like an abstaining one) is load-bearing rather than decorative.
//
// The seams are the same injected fakes WP-8.30's own suite uses — `plan` / `visit` / `upsert` / `changed` /
// `handoffTo`. Nothing here reaches a model, a disk or a clock.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, ExtractResult, Fact, MinedSignals, SiteOutcome, WhyNot } from "@atlas/genesis"
import { makeRunController, type ControllerDeps, type Plan } from "../src/run-controller.js"
import { reconcile, UNRECORDED_NOTE } from "../src/coverage.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }

const siteOf = (name: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `src/${name}.ts::${name}`,
  subtreeHash: asSubtreeHash(`st-${name}`),
})

const cand = (name: string, rank: number): Candidate => ({
  site: siteOf(name),
  signals: ZERO_SIGNALS,
  ppr: 1 - rank / 100,
  rank,
})

const factFor = (c: Candidate, n = ""): Fact =>
  ({
    kind: "advisory",
    id: asNodeKey(`nk-${c.site.qualifiedPath}${n}`),
    tier: "T2",
    claimNorm: `claim${n}@${c.site.qualifiedPath}`,
    grounding: { entries: [{ anchor: c.site, path: c.site.qualifiedPath }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }) as unknown as Fact

const whyNotFor = (c: Candidate): WhyNot => ({ site: c.site, reason: `nothing groundable at ${c.site.qualifiedPath}` })

/** No deepening, so the drive is the single-pass baseline (GEN-13/14). */
const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budgetOf = (ceiling: number) => ({ ceiling, deepening: { review: OFF, enrich: OFF, expand: OFF } })

/** The five ports, with `visit` supplied per test. `upsert` is the KNOW-15 accumulator (dedup by fact id). */
function depsWith(sites: readonly Candidate[], visit: ControllerDeps["visit"]): ControllerDeps {
  const grounded = new Map<string, Fact>()
  const plan: Plan = { malformed: false, sites }
  return {
    plan: () => plan,
    visit,
    upsert: (incoming) => {
      for (const f of incoming) grounded.set(f.id as unknown as string, f)
      return [...grounded.values()]
    },
    changed: () => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
    handoffTo: () => {},
  }
}

/** The row for one site, by path — the ledger's join key. */
const rowFor = (rows: readonly SiteOutcome[], name: string): SiteOutcome | undefined =>
  rows.find((r) => r.site.qualifiedPath === `src/${name}.ts::${name}`)

// ── SCN-GEN-12g-3 — the grounded why-not survives the run ────────────────────────────────────────────

describe("SCN-GEN-12g-3 — the run REPORTS the grounded why-not it was handed, per site", () => {
  const sites = [cand("a", 0), cand("b", 1), cand("c", 2)]

  it("an abstaining site is recorded as ABSTAINED, carrying the GEN-12 WhyNot verbatim", () => {
    // The wide arm of the `visit` union: the ExtractResult `runExtract` already returns. `b` abstains.
    const visit = (c: Candidate): ExtractResult =>
      c.site.qualifiedPath.includes("b")
        ? { facts: [], abstained: [whyNotFor(c)] }
        : { facts: [factFor(c)], abstained: [] }

    const r = makeRunController(depsWith(sites, visit)).genesis("repo", "HEAD", budgetOf(10))
    const rows = r.coverage?.sites ?? []

    const b = rowFor(rows, "b")
    expect(b?.outcome).toBe("abstained")
    // VERBATIM — the reason is kept, not re-derived and not summarised into a count.
    expect(b?.outcome === "abstained" ? b.whyNot.reason : "").toBe("nothing groundable at src/b.ts::b")
    expect(b?.outcome === "abstained" ? b.whyNot.site.subtreeHash : "").toBe(sites[1]!.site.subtreeHash)
  })

  it("a seeded site names WHICH facts it produced — a count would not survive one site yielding two", () => {
    const two = (c: Candidate): ExtractResult => ({ facts: [factFor(c, "-1"), factFor(c, "-2")], abstained: [] })
    const r = makeRunController(depsWith([cand("a", 0)], two)).genesis("repo", "HEAD", budgetOf(10))
    const row = rowFor(r.coverage?.sites ?? [], "a")
    expect(row?.outcome).toBe("seeded")
    expect(row?.outcome === "seeded" ? row.facts : []).toEqual(["nk-src/a.ts::a-1", "nk-src/a.ts::a-2"])
    // 1 site, 2 facts — the exact reason `sites − facts` is NOT a residual and is never computed as one.
    expect(r.seeded).toHaveLength(2)
    expect(r.coverage?.sites).toHaveLength(1)
  })

  it("a NARROW `visit` port (a bare Fact[]) yields UNRECORDED with the port named — never a fabricated WhyNot", () => {
    // This is the shape `packages/cli/src/mine.ts` ships today (`runExtract(...).facts`). The site really
    // did abstain, but that fact never left the port, so the ledger says it cannot say — it does not guess.
    const narrow = (_c: Candidate): readonly Fact[] => []
    const r = makeRunController(depsWith([cand("a", 0)], narrow)).genesis("repo", "HEAD", budgetOf(10))
    const row = rowFor(r.coverage?.sites ?? [], "a")
    expect(row?.outcome).toBe("unrecorded")
    expect(row?.outcome === "unrecorded" ? row.note : "").toBe(UNRECORDED_NOTE)
    // and it is NOT laundered into the abstained bucket, which would overstate what the run established.
    expect(reconcile(r.coverage).abstained).toBe(0)
    expect(reconcile(r.coverage).closes).toBe(true) // the site is still ACCOUNTED FOR — coverage holds
  })
})

// ── SCN-GEN-12g-4 — a DROPPED site is not an abstaining one ──────────────────────────────────────────

describe("SCN-GEN-12g-4 — a site the run never visited is distinguishable from one that abstained", () => {
  const sites = [cand("a", 0), cand("b", 1), cand("c", 2), cand("d", 3)]
  const abstainAll = (c: Candidate): ExtractResult => ({ facts: [], abstained: [whyNotFor(c)] })

  it("the GEN-2 ceiling cold tail is recorded as UNVISITED/ceiling, not folded into the abstentions", () => {
    // ceiling 2 over 4 ranked sites: two are visited and abstain, two are DROPPED. Before the ledger both
    // pairs produced exactly the same artifact — nothing.
    const r = makeRunController(depsWith(sites, abstainAll)).genesis("repo", "HEAD", budgetOf(2))
    const rows = r.coverage?.sites ?? []
    const rec = reconcile(r.coverage)

    expect(rec.closes).toBe(true)
    expect(rec.planned).toBe(4)
    expect(rec.recorded).toBe(4)
    expect(rec.abstained).toBe(2) //  visited, and they said why
    expect(rec.unvisited).toBe(2) //  never visited — a DIFFERENT fact, and now a distinguishable one
    expect(rowFor(rows, "a")?.outcome).toBe("abstained")
    expect(rowFor(rows, "c")?.outcome).toBe("unvisited")
    const c = rowFor(rows, "c")
    expect(c?.outcome === "unvisited" ? c.cause : "").toBe("ceiling")
    // the run's own cost line agrees with the ledger: 2 units of budget, 2 visited rows.
    expect(r.budgetSpent).toBe(2)
    expect(rec.seeded + rec.abstained + rec.unrecorded).toBe(r.budgetSpent)
  })

  it("an interrupted site, and everything past it, is recorded — the tail does not vanish (GEN-8c)", () => {
    const visit = (c: Candidate): ExtractResult => {
      if (c.rank === 1) throw new Error("interrupted mid-site")
      return { facts: [], abstained: [whyNotFor(c)] }
    }
    const r = makeRunController(depsWith(sites, visit)).genesis("repo", "HEAD", budgetOf(10))
    const rows = r.coverage?.sites ?? []
    const rec = reconcile(r.coverage)

    expect(rec.closes).toBe(true)
    expect(rec.recorded).toBe(4)
    expect(rowFor(rows, "a")?.outcome).toBe("abstained")
    expect(rowFor(rows, "b")?.outcome).toBe("interrupted") // visited, NOT completed
    expect(rowFor(rows, "c")?.outcome).toBe("unvisited")
    const c = rowFor(rows, "c")
    expect(c?.outcome === "unvisited" ? c.cause : "").toBe("after-interrupt")
    expect(r.resumeToken?.lastCompletedRank).toBe(0) // GEN-8a is untouched by the ledger
  })

  it("THE NEGATIVE — a ledger with a site missing does NOT close, and says how many were dropped", () => {
    // The mutant this ledger exists to kill: a controller that drives 4 sites and records 3. Simulated by
    // damaging a real ledger rather than by hand-writing one, so the shape is the product's own.
    const r = makeRunController(depsWith(sites, abstainAll)).genesis("repo", "HEAD", budgetOf(10))
    expect(reconcile(r.coverage).closes).toBe(true) // control: undamaged, it closes

    const damaged = { ...r.coverage!, sites: r.coverage!.sites.filter((s) => s.rank !== 2) }
    const rec = reconcile(damaged)
    expect(rec.closes).toBe(false)
    expect(rec.unaccounted).toBe(1)
    expect(rec.why).toContain("DROPPED")
    // and a DOUBLE-count fails too — inflating coverage is the same defect in the other direction.
    const doubled = { ...r.coverage!, sites: [...r.coverage!.sites, r.coverage!.sites[0]!], planned: 5 }
    expect(reconcile(doubled).closes).toBe(false)
    expect(reconcile(doubled).duplicates).toEqual(["src/a.ts::a"])
  })

  it('an ABSENT ledger is UNEVALUABLE — never read as "covered nothing" and never as "covered everything"', () => {
    // The absent-tolerant read (`builtAt`/`sameAs`/`derivedAt` precedent): an artifact from before the
    // ledger still parses, and answers "not recorded" rather than a verdict it has no grounds for.
    const rec = reconcile(undefined)
    expect(rec.closes).toBe(false)
    expect(rec.why).toContain("UNEVALUABLE")
    expect(rec.recorded).toBe(0)
    // a run whose PLANNING failed says the same thing, and explicitly does not claim an empty repository.
    const failed = makeRunController({
      ...depsWith(sites, abstainAll),
      plan: () => {
        throw new Error("malformed rev")
      },
    }).genesis("repo", "nope")
    expect(failed.coverage?.frontier).toBe("unavailable")
    expect(reconcile(failed.coverage).closes).toBe(false)
    expect(reconcile(failed.coverage).why).toContain("not a claim that the repository is empty")
  })
})

// ── SCN-GEN-8a-3 — the ledger survives the interruption ──────────────────────────────────────────────

describe("SCN-GEN-8a-3 — a resumed run reports the WHOLE run's ledger, so the site set still closes", () => {
  it("resume carries the first leg's rows forward and re-drives only the remainder, with no duplicate", () => {
    const sites = [cand("a", 0), cand("b", 1), cand("c", 2), cand("d", 3)]
    let armed = true // the interruption fires ONCE, at rank 1, then the resumed run gets through
    const visit = (c: Candidate): ExtractResult => {
      if (armed && c.rank === 1) {
        armed = false
        throw new Error("killed mid-run")
      }
      return c.rank === 3 ? { facts: [factFor(c)], abstained: [] } : { facts: [], abstained: [whyNotFor(c)] }
    }

    const ctrl = makeRunController(depsWith(sites, visit))
    const first = ctrl.genesis("repo", "HEAD", budgetOf(10))
    expect(first.resumeToken?.lastCompletedRank).toBe(0)
    expect(reconcile(first.coverage).closes).toBe(true) // even the PARTIAL run accounts for all 4

    const second = ctrl.resume(first.resumeToken!)
    const rec = reconcile(second.coverage)
    expect(rec.closes).toBe(true)
    expect(rec.planned).toBe(4)
    expect(rec.recorded).toBe(4) // NOT 7 — the carried rows are cut at the cursor the resume re-drives from
    expect(rec.duplicates).toEqual([])
    expect(rec.abstained).toBe(3)
    expect(rec.seeded).toBe(1)
    expect(rec.interrupted).toBe(0) // the site that threw was re-driven and completed
    expect(rowFor(second.coverage?.sites ?? [], "b")?.outcome).toBe("abstained")
    expect(second.resumeToken).toBeUndefined()
  })

  it("resuming from a cursor AHEAD of where the run stopped really does drop sites — and the ledger REFUSES to close", () => {
    // The product-level negative, and the one that keeps `planned` honest. `resume` re-drives everything
    // past the token, so a token pointing further ahead than the run actually got SKIPS the sites in
    // between. They are neither seeded nor abstained nor visited — they are DROPPED, which is precisely the
    // condition no artifact could express before. `planned` is the size of the frontier the run was HANDED,
    // so the gap shows up as `unaccounted`; derive `planned` from the rows instead and this closes falsely.
    const sites = [cand("a", 0), cand("b", 1), cand("c", 2), cand("d", 3)]
    let armed = true
    const visit = (c: Candidate): ExtractResult => {
      if (armed && c.rank === 1) {
        armed = false
        throw new Error("killed mid-run")
      }
      return { facts: [], abstained: [whyNotFor(c)] }
    }
    const ctrl = makeRunController(depsWith(sites, visit))
    const first = ctrl.genesis("repo", "HEAD", budgetOf(10))
    expect(first.resumeToken?.lastCompletedRank).toBe(0) // it stopped at rank 1

    const skipped = ctrl.resume({ lastCompletedRank: 2 }) // ...but the resume is told rank 2 is done
    const rec = reconcile(skipped.coverage)
    expect(rec.closes).toBe(false)
    expect(rec.planned).toBe(4) //     the frontier the run was handed
    expect(rec.recorded).toBe(2) //    rank 0 (carried) + rank 3 (re-driven)
    expect(rec.unaccounted).toBe(2) // ranks 1 and 2: never visited, never recorded, DROPPED
    expect(rec.why).toContain("DROPPED")
  })

  it("resuming TWICE from one token re-drives the same sites without double-counting them", () => {
    // A saved token is re-usable, so this is a state an operator can reach. The carried rows are cut to the
    // TOKEN's cursor, not to whatever the last leg happened to complete — carry them all and the second
    // resume reports 7 rows over a 4-site frontier, overstating coverage exactly as a gap understates it.
    const sites = [cand("a", 0), cand("b", 1), cand("c", 2), cand("d", 3)]
    let armed = true
    const visit = (c: Candidate): ExtractResult => {
      if (armed && c.rank === 1) {
        armed = false
        throw new Error("killed mid-run")
      }
      return { facts: [], abstained: [whyNotFor(c)] }
    }
    const ctrl = makeRunController(depsWith(sites, visit))
    const token = ctrl.genesis("repo", "HEAD", budgetOf(10)).resumeToken!
    expect(reconcile(ctrl.resume(token).coverage).recorded).toBe(4)

    const again = reconcile(ctrl.resume(token).coverage)
    expect(again.recorded).toBe(4)
    expect(again.duplicates).toEqual([])
    expect(again.closes).toBe(true)
  })
})
