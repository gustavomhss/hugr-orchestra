// @atlas/genesis — src/drive.ts  (WP-FIX-CONCURRENCY · GEN-2 / GEN-8 — the pass loop)
//
// Split out of `run-controller.ts` at the 400-LOC ceiling, and cohesive on its own: `run-controller.ts`
// binds the two frozen API surfaces and owns the resume/hand-off bookkeeping AROUND a pass; this file is
// the pass itself — the one loop that spends the GEN-2 budget, checkpoints the GEN-8a cursor, and writes
// the GEN-8/12g ledger. The split is the same one `mine.ts` took (mine-gate / mine-proposer / mine-render).
//
// It is also where CONCURRENCY lives, and containing it to one loop was the design (task #158). A genesis
// pass costs ~18s per site because S2 makes one model call per site and that call is network-bound; run
// strictly one after another, 200 sites is 54 minutes. What this file changes is ONLY the order in which
// those calls are ISSUED. What it deliberately does not change is the order anything is READ back,
// accounted, or written in — every one of those still walks the frontier in ascending rank.
//
// THE CONTRACT, AND IT IS DETERMINISM RATHER THAN SPEED: the report of a concurrent run is byte-identical
// to the report of the same run driven sequentially — same seeded facts in the same order, same
// `budgetSpent`, same `llmCalls`, same coverage ledger, same resume token. Concurrency is an execution
// detail and MUST NOT be observable in the output. Sites finish out of order; nothing downstream may learn
// that. See `drive` for the three properties that make it structurally true rather than merely tested.

import type { Candidate, ExtractResult, Fact, GenesisBudget, SiteOutcome } from "./types.js"
import { classifyVisit, interruptedAt, readVisit, unvisited } from "./coverage.js"

/**
 * The bounded width of the S2 pass (task #158). A run-shape bound the operator does not set — deliberately
 * NOT a CLI flag, because a knob would make concurrency observable, which is exactly what this file forbids.
 *
 * 8 because the work is network-bound, not CPU-bound: it buys wall-clock without needing a rate-limit
 * story, where a wider pool risks provider throttling — and a throttled provider presents to an operator as
 * a product bug rather than as a tuning choice. It is the batch width here AND the pool width in the driver
 * that supplies `visitAll`; one constant, so the two can never disagree.
 */
export const POOL_WIDTH = 8 as const

/**
 * ONE site's outcome from a batched dispatch: the value `visit` would have RETURNED, or the error it would
 * have THROWN — CAPTURED rather than propagated. Capture is the whole point: with several sites in flight, a
 * throw that escaped would discard the completed work of every batch-mate, and WHICH mates those are would
 * depend on arrival order. An error is therefore data here, and `drive` decides its meaning in RANK order.
 */
export type VisitAttempt =
  | { readonly ok: true; readonly value: readonly Fact[] | ExtractResult }
  | { readonly ok: false; readonly error: unknown }

/**
 * The three ports a PASS needs — a strict subset of `ControllerDeps` (which adds `plan`/`changed`/
 * `handoffTo`, none of which a pass may reach). Narrow on purpose: the loop below cannot re-plan the
 * frontier because it is not handed anything that could, which is how "the ranked frontier is computed
 * once, before the pass, and never per worker" survives a later edit rather than depending on one.
 */
export interface DrivePorts {
  /** The S2 per-site driver. The return type is a UNION and the wide arm is the EXISTING frozen S2 surface:
   *  a port may hand back the bare `Fact[]` it always did, or the `ExtractResult` (`{ facts, abstained }`,
   *  atlas-genesis:188) that `runExtract` already returns — in which case the site's grounded GEN-12
   *  `WhyNot` survives into the run ledger instead of being dropped here. Widened, never replaced: every
   *  existing driver compiles and behaves identically, and one that drops `.facts` from its call gains the
   *  abstention record for free. MAY throw (an interruption, GEN-8c). */
  visit(cand: Candidate): readonly Fact[] | ExtractResult

  /** OPTIONAL batched S2 dispatch — the ONE seam concurrency is allowed to enter through (task #158), and
   *  the reason nothing else in the package had to learn about it. Given up to `POOL_WIDTH` candidates IN
   *  ASCENDING RANK ORDER, return one attempt per candidate, POSITIONALLY ALIGNED, having run them however
   *  it likes — a thread pool, a queue, or plainly one after another.
   *
   *  Two obligations, and they are what make the batch unobservable downstream:
   *    • it MUST return one attempt per candidate, in the order it was HANDED them — never in completion
   *      order, which is the only order a pool naturally knows;
   *    • it MUST NOT throw. A faulting site is an `ok: false` attempt (see `VisitAttempt`).
   *
   *  ABSENT ⇒ the loop drives `visit` one site at a time, which is the pre-#158 behaviour exactly. The two
   *  paths agree BY CONSTRUCTION rather than by testing: the fold walks the batch in rank order and stops
   *  where a sequential drive would have stopped, so completion order reaches nothing. */
  visitAll?(cands: readonly Candidate[]): readonly VisitAttempt[]

  /** The KNOW-15 write-decision: idempotent merge by fact `id`, returning the grounded set. */
  upsert(incoming: readonly Fact[]): readonly Fact[]
}

export interface DriveResult {
  readonly seeded: readonly Fact[]
  /** Model calls ISSUED, including those whose results were discarded. See `GenesisReport.modelCalls`:
   *  `llmCalls` is what the run USED and this is what the run PAID FOR, and under a pool they differ. */
  readonly modelCalls: number
  readonly lastCompletedRank: number // the resume cursor — the last fully-completed ranked site (GEN-8)
  readonly interrupted: boolean // a site threw mid-run ⇒ resumable partial (never propagated — GEN-8c)
  readonly llmCalls: number
  readonly budgetSpent: number
  readonly outcomes: readonly SiteOutcome[] // one row per site this drive was handed — the GEN-8/12g ledger
}

/**
 * Obtain one attempt per candidate for a batch already in ascending rank order.
 *
 * The `visitAll` arm is handed the whole batch; the sequential arm is handed a batch of exactly one, so the
 * two arms produce the SAME SHAPE and the fold below has a single code path — rather than a concurrent one
 * and a sequential one that must be kept in agreement by hand, which is the arrangement that would let the
 * two drift apart while both stayed green.
 *
 * A `visitAll` that throws anyway — which its contract forbids — is not trusted to have left partial state:
 * the WHOLE batch faults. Only the lowest-ranked of those faults survives the fold, so this degrades to
 * exactly the sequential reading (the run stops at the first faulting site by rank) rather than to a
 * silently truncated pass that would report the sites it never reached as though they had been considered.
 */
function dispatch(batch: readonly Candidate[], ports: DrivePorts): readonly VisitAttempt[] {
  if (ports.visitAll !== undefined) {
    try {
      return ports.visitAll(batch)
    } catch (error) {
      return batch.map(() => ({ ok: false, error }))
    }
  }
  const cand = batch[0]
  if (cand === undefined) return []
  try {
    return [{ ok: true, value: ports.visit(cand) }] // S2 per-site (WP-8.28); may throw = interruption
  } catch (error) {
    return [{ ok: false, error }]
  }
}

/**
 * The checkpoint/resume core (GEN-8a). Drives `sites` in ascending rank order starting past `floor`:
 *   • HARD ceiling (GEN-2): stop once `budgetSpent` hits `budget.ceiling` — the cold tail is left to
 *     born-from-work (a deliberate scope, NOT an interruption ⇒ no resume token).
 *   • CHECKPOINT: after each completed site, advance `lastCompletedRank` to that site's rank.
 *   • TOTAL (GEN-8c): a `visit` that throws is an interruption — caught, never propagated; the loop stops
 *     and the last completed rank becomes the resume cursor.
 *   • IDEMPOTENT (GEN-7b): every write routes through the injected upsert (dedup by id) — the returned
 *     grounded set is the report's `seeded`.
 *   • ACCOUNTED (GEN-8/12g): EVERY site handed to this drive gets exactly one ledger row, including the ones
 *     no call was spent on. The ceiling used to `break` and the cold tail simply vanished — which is how a
 *     dropped site and an abstaining site became indistinguishable. It now records the tail and keeps going,
 *     spending nothing: recording the tail costs no call (`budgetSpent` never decreases) and buys the one
 *     thing a coverage claim needs, which is a row for the sites that were NOT visited.
 *
 * CONCURRENCY (task #158) ENTERS ONLY THROUGH `dispatch`, AND THESE THREE PROPERTIES ARE WHY IT IS INVISIBLE:
 *
 *   1. THE CEILING IS CLIPPED BEFORE DISPATCH, NOT CHECKED AFTER IT. `width` is `min(POOL_WIDTH, room,
 *      remaining)`, so the pass cannot overshoot the operator's spend cap by even ONE call. The obvious
 *      arrangement — dispatch a full batch, stop once the counter trips — overshoots by up to
 *      `POOL_WIDTH - 1`, and a spend cap that is exceeded silently is not a cap. At width 1 this
 *      degenerates to the `budgetSpent >= ceiling` test it replaces.
 *   2. THE FOLD WALKS THE BATCH IN RANK ORDER AND STOPS AT THE FIRST NON-`ok`. So `lastCompletedRank` is
 *      the highest rank R such that EVERY rank ≤ R completed — the contiguous prefix — never merely the
 *      highest rank that happened to finish. That is a structural consequence of folding in order and
 *      breaking, not a maximum computed over arrivals, so no arrival-ordered state exists anywhere for a
 *      resume to step over. A resume therefore cannot open a hole; the rank it names means what it says.
 *   3. EVERY DURABLE WRITE STILL HAPPENS HERE, ONE AT A TIME, IN RANK ORDER. `ports.upsert` is called from
 *      this loop and only from this loop; a pool never touches it. The sidecar keeps exactly the one writer
 *      it has today — concurrency buys the model calls, which is where the 18s/site lives, and buys nothing
 *      near the store, which is where a lost update would live (task #108 is about that door and this
 *      change deliberately leaves it as it found it).
 *
 * THE ONE HONEST COST, STATED: when a site faults, its higher-ranked batch-mates have ALREADY been called.
 * Those calls are discarded — not counted in `llmCalls`/`budgetSpent`, and producing no ledger row, which is
 * what keeps the report identical to a sequential one — but they were really made. So an INTERRUPTED
 * concurrent run can spend up to `POOL_WIDTH - 1` calls more than an interrupted sequential run would have.
 * It is bounded, it happens at most once per drive (the loop stops), and it is a cost in money rather than
 * in correctness. It is NOT a ceiling overshoot: property 1 still holds, because those calls were inside the
 * ceiling when they were dispatched.
 */
export function drive(
  sites: readonly Candidate[],
  budget: GenesisBudget,
  floor: number,
  startCalls: number,
  startSpent: number,
  startModelCalls: number,
  base: readonly Fact[],
  ports: DrivePorts,
): DriveResult {
  let seeded = base
  let lastCompletedRank = floor
  let llmCalls = startCalls
  let budgetSpent = startSpent
  let modelCalls = startModelCalls
  let interrupted = false
  const outcomes: SiteOutcome[] = []

  // Sorted ONCE, here, from the frontier the controller was handed. Nothing below re-derives it.
  const ordered = [...sites].sort((a, b) => a.rank - b.rank)
  let i = 0
  while (i < ordered.length) {
    const room = budget.ceiling - budgetSpent // GEN-2 hard ceiling, as a WIDTH bound (property 1 above)
    if (room <= 0) break
    const width = Math.min(ports.visitAll !== undefined ? POOL_WIDTH : 1, room, ordered.length - i)
    const batch = ordered.slice(i, i + width)
    const attempts = dispatch(batch, ports)
    // COUNTED AT DISPATCH, NOT AT FOLD — the whole point of the counter. Every site in this batch was
    // handed to the proposer, so every one of them was paid for, whether or not its result survives the
    // fold below. Counting the batch we ASKED FOR (rather than the attempts we got back) keeps the figure
    // an honest upper bound when a pool answers short: an unanswered site may still have reached the model.
    modelCalls += batch.length

    let folded = 0
    for (const cand of batch) {
      const a = attempts[folded]
      if (a === undefined || !a.ok) break // the first fault BY RANK ends the drive — property 2 above
      const record = readVisit(a.value) // normalize the union — `abstained` present only if the port sent it
      seeded = ports.upsert(record.facts) // KNOW-15 idempotent upsert — 0 duplicates on re-run (GEN-7b)
      llmCalls += 1
      budgetSpent += 1
      lastCompletedRank = cand.rank // checkpoint the last completed ranked site (GEN-8a)
      // The ledger row is written from what the site ACTUALLY produced — the seeded facts by id, or the
      // grounded GEN-12 `WhyNot` the port carried. It is never derived by subtracting counts.
      outcomes.push(classifyVisit(cand, record))
      folded += 1
    }
    i += folded
    if (folded < batch.length) {
      interrupted = true // GEN-8c: never propagate — resume continues from lastCompletedRank
      outcomes.push(interruptedAt(ordered[i]!)) // the site is visited-but-not-completed, and says so
      i += 1
      break
    }
  }
  // The tail nobody reached. Recorded rather than omitted: a silent tail is exactly the shape a dropped site
  // would take. WHY it went unvisited is the run's own state — a ceiling reached is a deliberate scope and an
  // interruption is resumable, and a ledger that conflated the two would be unreadable in the one situation
  // it exists for.
  const reason = interrupted ? "after-interrupt" : "ceiling"
  for (; i < ordered.length; i++) outcomes.push(unvisited(ordered[i]!, reason))

  return { seeded, modelCalls, lastCompletedRank, interrupted, llmCalls, budgetSpent, outcomes }
}
