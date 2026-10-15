// WP-FIX-CONCURRENCY — the acceptance test IS the contract.
//
// source_reqs:
//   - REQ-GEN-CONC-1
//   - REQ-GEN-CONC-2
//   - REQ-GEN-CONC-3
//   - REQ-GEN-CONC-4
//   - REQ-GEN-CONC-5
//   - REQ-GEN-CONC-6
// acceptance:
//   - SCN-GEN-CONC-1
//   - SCN-GEN-CONC-2
//   - SCN-GEN-CONC-3
//   - SCN-GEN-CONC-4
//   - SCN-GEN-CONC-5
//   - SCN-GEN-CONC-6
//   - SCN-GEN-CONC-7
//
// The change being accepted is a speed change, so the thing under test is NOT speed — it is that speed cost
// nothing. A concurrent pass and a sequential pass over the same inputs must produce the SAME REPORT, and
// "same" is checked as BYTES rather than field-by-field, because a field-by-field check only ever finds the
// discrepancies its author already thought of. Sites complete out of order; nothing downstream may see it.
//
// TEETH. A byte-identity assertion cannot fail on sequential code — run twice, a deterministic sequential
// drive trivially agrees with itself, so the test would be green before the change and green after it while
// proving nothing. The teeth are therefore supplied here: `outOfOrderPool` deliberately RESOLVES the batch
// in reverse and, in `SCN-GEN-CONC-2`, is deliberately allowed to REPORT in that order. The identity
// assertion goes red. That is the mutation this file exists to catch, and it is exercised, not described.

import { describe, expect, it } from "vitest"
import { makeRunController, POOL_WIDTH } from "../src/run-controller.js"
import { MARGINAL_WINDOW, runExtract } from "../src/extract.js"
import type { ControllerDeps, Plan, VisitAttempt } from "../src/run-controller.js"
import type { Candidate, ExtractResult, Fact, GenesisBudget, GenesisReport, Skeleton } from "../src/types.js"

const SKELETON = { rev: "rev", axes: { nodes: [], edges: [] } } as unknown as Skeleton

const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budgetOf = (ceiling: number): GenesisBudget => ({ ceiling, deepening: { review: OFF, enrich: OFF, expand: OFF } })

/** A ranked site. `rank` is the ONLY ordering the run is allowed to honour. */
function cand(name: string, rank: number): Candidate {
  return { rank, site: { qualifiedPath: `src/${name}.ts::${name}` } } as unknown as Candidate
}

/** The fact a site seeds — derived from the site so a mis-ordered fold is visible in the report's contents,
 *  not merely in its order. */
function factAt(c: Candidate): Fact {
  return {
    id: `fact-${c.rank}`,
    kind: "advisory",
    claimNorm: `claim at ${c.site.qualifiedPath}`,
    subject: c.site,
  } as unknown as Fact
}

/** The per-site expression BOTH paths share, exactly as the `mine` driver shares one `visitWith`. */
function extractAt(c: Candidate, failAt: ReadonlySet<number>): ExtractResult {
  if (failAt.has(c.rank))
    throw Object.assign(new Error(`model failed at rank ${c.rank}`), { name: "ModelCommandError" })
  // Ranks divisible by 5 abstain, so the ledger under test carries all three row kinds rather than one.
  if (c.rank % 5 === 0)
    return { facts: [], abstained: [{ site: c.site, reason: "model abstained" }] } as unknown as ExtractResult
  return { facts: [factAt(c)], abstained: [] } as unknown as ExtractResult
}

interface Wiring {
  readonly sites: readonly Candidate[]
  readonly failAt?: ReadonlySet<number>
  /** How a batch is turned into attempts. Absent ⇒ no `visitAll` port at all (the sequential drive). */
  readonly pool?: (batch: readonly Candidate[], one: (c: Candidate) => VisitAttempt) => readonly VisitAttempt[]
}

function deps(w: Wiring): ControllerDeps {
  const failAt = w.failAt ?? new Set<number>()
  const grounded = new Map<string, Fact>()
  const one = (c: Candidate): VisitAttempt => {
    try {
      return { ok: true, value: extractAt(c, failAt) }
    } catch (error) {
      return { ok: false, error }
    }
  }
  const base: ControllerDeps = {
    plan: (): Plan => ({ malformed: false, skeleton: SKELETON, sites: w.sites }),
    visit: (c) => {
      const a = one(c)
      if (!a.ok) throw a.error
      return a.value
    },
    // Serialized by construction — the store is single-writer on BOTH paths, which is the invariant the
    // pool is not allowed to touch.
    upsert: (incoming) => {
      for (const f of incoming) grounded.set((f as unknown as { id: string }).id, f)
      return [...grounded.values()]
    },
    changed: () => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
    handoffTo: () => {},
  }
  return w.pool === undefined ? base : { ...base, visitAll: (batch) => w.pool!(batch, one) }
}

/** THE HONEST POOL: it completes out of order — reversed — but REPORTS positionally, as its contract
 *  requires. This is what a real thread pool looks like from the controller's side. */
const outOfOrderPool = (batch: readonly Candidate[], one: (c: Candidate) => VisitAttempt): readonly VisitAttempt[] => {
  const answers = new Array<VisitAttempt | undefined>(batch.length)
  for (let k = batch.length - 1; k >= 0; k--) answers[k] = one(batch[k]!) // completion order: LAST first
  return answers.map((a) => a!)
}

/** THE MUTANT: same out-of-order completion, but it lets that order LEAK into the returned array. This is
 *  the single most likely way to get a pool wrong, and SCN-GEN-CONC-2 requires it to be caught. */
const arrivalOrderedPool = (
  batch: readonly Candidate[],
  one: (c: Candidate) => VisitAttempt,
): readonly VisitAttempt[] => {
  const answers: VisitAttempt[] = []
  for (let k = batch.length - 1; k >= 0; k--) answers.push(one(batch[k]!))
  return answers
}

const frontier = (n: number): readonly Candidate[] => Array.from({ length: n }, (_, k) => cand(`s${k}`, k))

const runWith = (w: Wiring, ceiling: number): GenesisReport =>
  makeRunController(deps(w)).genesis("repo", "HEAD", budgetOf(ceiling))

/** The report AS BYTES — the whole point of the contract. */
const bytes = (r: GenesisReport): string => JSON.stringify(r, null, 2)

/**
 * The report as bytes MINUS the actual-spend counter.
 *
 * THIS IS A REAL TENSION AND IT IS RESOLVED HERE RATHER THAN HIDDEN. Two requirements collide on an
 * INTERRUPTED run: the report must be byte-identical to a sequential one, AND the report must state the
 * model calls actually paid for. When a site faults, a pool has genuinely paid for its in-flight
 * batch-mates and a sequential run has not — so the two runs really did cost different amounts, and any
 * `modelCalls` that agreed across them would be a false claim about money.
 *
 * The resolution: byte-identity binds every field that describes THE REPOSITORY OR THE RUN'S PROGRESS —
 * seeded facts, coverage ledger, `llmCalls`, `budgetSpent`, `resumeToken`. `modelCalls` describes what was
 * SPENT, and it is allowed — required — to differ, because it did. On a run with no fault the two are
 * identical anyway, and `bytes()` (not this) is what those cases assert.
 */
const bytesSansSpend = (r: GenesisReport): string => {
  const { modelCalls: _drop, ...rest } = r as GenesisReport & { modelCalls?: number }
  void _drop
  return JSON.stringify(rest, null, 2)
}

describe("WP-FIX-CONCURRENCY — a concurrent pass is byte-identical to a sequential one", () => {
  it("SCN-GEN-CONC-1: the report of a concurrent run is byte-identical to the sequential run", () => {
    const sites = frontier(37) // not a multiple of POOL_WIDTH — the last batch is deliberately ragged
    const sequential = runWith({ sites }, 37)
    const concurrent = runWith({ sites, pool: outOfOrderPool }, 37)

    expect(bytes(concurrent)).toBe(bytes(sequential))
    // Guard against the assertion passing vacuously over an empty run.
    expect(sequential.seeded.length).toBeGreaterThan(0)
    expect(sequential.coverage?.sites.length).toBe(37)
    expect(sequential.llmCalls).toBe(37)
    // No fault ⇒ nothing discarded ⇒ paid-for EQUALS used, on both paths. The counter is present and 0-gap.
    expect(concurrent.modelCalls).toBe(37)
    expect(concurrent.modelCalls! - concurrent.llmCalls).toBe(0)
  })

  it("SCN-GEN-CONC-2: TEETH — a pool that lets ARRIVAL order leak makes the identity assertion FAIL", () => {
    const sites = frontier(37)
    const sequential = runWith({ sites }, 37)
    const leaked = runWith({ sites, pool: arrivalOrderedPool }, 37)

    // The mutation is real and the contract catches it. Without the rank-ordered fold this is what ships.
    expect(bytes(leaked)).not.toBe(bytes(sequential))
    // And it is wrong in the way that matters: the SEEDED FACTS come back in a different order.
    expect(leaked.seeded.map((f) => (f as unknown as { id: string }).id)).not.toEqual(
      sequential.seeded.map((f) => (f as unknown as { id: string }).id),
    )
  })

  it("SCN-GEN-CONC-3: the ceiling is never overshot — a pool spends EXACTLY the sequential budget", () => {
    // 30 sites, ceiling 22: 22 is not a multiple of 8, so a pool that dispatched full batches and stopped
    // afterwards would spend 24 — overshooting the operator's cap by 2. Clipping the WIDTH cannot.
    const sites = frontier(30)
    const sequential = runWith({ sites }, 22)
    const concurrent = runWith({ sites, pool: outOfOrderPool }, 22)

    expect(concurrent.budgetSpent).toBe(22)
    expect(concurrent.llmCalls).toBe(22)
    expect(bytes(concurrent)).toBe(bytes(sequential))
    // AND THE SPEND IS HONEST AT THE CEILING: because the batch WIDTH is clipped to the room left, the pool
    // never issues a call it cannot use. Paid-for equals used — the ceiling overshoot is zero, not merely
    // unreported. This is the case the refinement expected to need discard-by-rank; clipping removes it.
    expect(concurrent.modelCalls).toBe(22)
    expect(concurrent.modelCalls! - concurrent.llmCalls).toBe(0)
    // The cold tail is RECORDED, not dropped, and names the ceiling as its cause.
    const tail = (concurrent.coverage?.sites ?? []).filter(
      (s) => (s as unknown as { outcome: string }).outcome === "unvisited",
    )
    expect(tail.length).toBe(8)
  })

  it("SCN-GEN-CONC-4: the FIRST fault BY RANK is the interruption, not the first by completion", () => {
    // Ranks 3 and 6 both fault and land in the SAME batch. Reversed completion means rank 6 finishes first;
    // a wall-clock reading would report 6 and resume at 5, silently skipping rank 3 and 4 forever.
    const sites = frontier(20)
    const failAt = new Set([3, 6])
    const sequential = runWith({ sites, failAt }, 20)
    const concurrent = runWith({ sites, failAt, pool: outOfOrderPool }, 20)

    expect(bytesSansSpend(concurrent)).toBe(bytesSansSpend(sequential))
    // THE OVERSHOOT IS REAL AND IT IS REPORTED. Ranks 0-7 went out in one batch; rank 3 faulted, so ranks
    // 3-7 were paid for and discarded. Sequential paid for ranks 0-3 and discarded only the faulting one.
    // Neither number is inferred from the other and the gap is not vacuous: 8 > 4.
    expect(concurrent.modelCalls).toBe(8)
    expect(sequential.modelCalls).toBe(4)
    expect(concurrent.modelCalls! - concurrent.llmCalls).toBe(5) // 5 calls paid for, 0 used
    expect(sequential.modelCalls! - sequential.llmCalls).toBe(1) // the faulting call itself
    // lastCompletedRank is the CONTIGUOUS PREFIX: every rank ≤ 2 completed, and rank 3 did not.
    expect(concurrent.resumeToken?.lastCompletedRank).toBe(2)
    expect(concurrent.budgetSpent).toBe(3) // ranks 0,1,2 — the calls made past the fault are NOT charged
    const rows = (concurrent.coverage?.sites ?? []) as unknown as { rank: number; outcome: string }[]
    expect(rows.find((r) => r.rank === 3)?.outcome).toBe("interrupted")
    expect(rows.filter((r) => r.rank > 3).every((r) => r.outcome === "unvisited")).toBe(true)
  })

  it("SCN-GEN-CONC-5: resume after a concurrent interruption is byte-identical to resume after a sequential one", () => {
    const sites = frontier(24)
    const failAt = new Set([9])

    const seqCtl = makeRunController(deps({ sites, failAt }))
    const seqFirst = seqCtl.genesis("repo", "HEAD", budgetOf(24))
    const seqResumed = seqCtl.resume(seqFirst.resumeToken!)

    const conCtl = makeRunController(deps({ sites, failAt, pool: outOfOrderPool }))
    const conFirst = conCtl.genesis("repo", "HEAD", budgetOf(24))
    const conResumed = conCtl.resume(conFirst.resumeToken!)

    expect(bytesSansSpend(conFirst)).toBe(bytesSansSpend(seqFirst))
    // The resumed leg re-drives from the cursor and faults again at the same rank — the cursor MEANS what
    // it says under a pool, so the resumed report agrees too and no site is stepped over.
    expect(bytesSansSpend(conResumed)).toBe(bytesSansSpend(seqResumed))
    expect(conFirst.resumeToken?.lastCompletedRank).toBe(8)
    // Spend ACCUMULATES across the resume rather than restarting — an operator is billed for both legs.
    expect(conFirst.modelCalls).toBe(16)
    expect(conResumed.modelCalls).toBe(24)
    expect(seqResumed.modelCalls).toBe(11)
    expect(conResumed.llmCalls).toBe(seqResumed.llmCalls) // what was USED still agrees exactly
  })

  it("SCN-GEN-CONC-6: the spend counter is ALWAYS present — including when it is zero", () => {
    // A field that only appears when non-zero reads as "this never happens". A run that never reached a
    // frontier still states, explicitly, that it paid for nothing.
    const malformed = makeRunController({
      ...deps({ sites: [] }),
      plan: () => {
        throw new Error("unreadable rev")
      },
    }).genesis("repo", "nope")
    expect(malformed.modelCalls).toBe(0)
    expect(Object.prototype.hasOwnProperty.call(malformed, "modelCalls")).toBe(true)

    const empty = runWith({ sites: [] }, 0)
    expect(empty.modelCalls).toBe(0)
    expect(Object.prototype.hasOwnProperty.call(empty, "modelCalls")).toBe(true)
  })

  it("SCN-GEN-CONC-7: the GEN-2e marginal-value halt is NOT pass-level on this path, so a pool cannot skew it", () => {
    // The refinement worried that `runExtract`'s trailing-20 admit window would become scheduling-dependent
    // under a pool. It cannot, and the reason is structural rather than careful: the pool lives in `drive`,
    // one layer ABOVE `runExtract`, and the `mine` driver calls `runExtract` with EXACTLY ONE candidate and
    // a ceiling of 1. A window that needs 20 outcomes can never be consulted by a call that produces 1.
    expect(MARGINAL_WINDOW).toBe(20)

    const seen: number[] = []
    const proposer = { propose: () => null }
    const gate = { emit: () => ({ emitted: false as const, whyNot: { site: {}, reason: "no" } }) }
    for (let k = 0; k < 40; k++) {
      const one = cand(`m${k}`, k)
      const r = runExtract([one], budgetOf(1), {
        proposer: { propose: () => (seen.push(1), proposer.propose()) },
        gate,
      } as never)
      // Each call is its own pass: one site in, at most one outcome, window length 1 < 20.
      expect((r as unknown as { abstained: unknown[] }).abstained.length).toBeLessThanOrEqual(1)
    }
    // 40 sites, 40 independent single-site calls — never one 40-site loop that could accumulate a window.
    expect(seen.length).toBe(40)
    expect(seen.length).toBeGreaterThan(MARGINAL_WINDOW) // and still no halt was reachable
  })

  it("the batch is never wider than POOL_WIDTH, and the frontier is never re-planned", () => {
    const sites = frontier(37)
    const widths: number[] = []
    let plans = 0
    const d = deps({ sites, pool: outOfOrderPool })
    const spied: ControllerDeps = {
      ...d,
      plan: (...a) => {
        plans += 1
        return d.plan(...a)
      },
      visitAll: (batch) => {
        widths.push(batch.length)
        return d.visitAll!(batch)
      },
    }
    makeRunController(spied).genesis("repo", "HEAD", budgetOf(37))

    expect(Math.max(...widths)).toBe(POOL_WIDTH)
    expect(widths.reduce((a, b) => a + b, 0)).toBe(37)
    expect(plans).toBe(1) // computed once, before the pass — never per worker, never per batch
  })
})
