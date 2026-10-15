// @atlas/genesis — src/run-controller.ts  (WP-8.30.GEN · GEN-7 / GEN-8 — the run controller)
//
// The composition-root RUN CONTROLLER: it binds the two frozen surfaces of the one-time bootstrap —
// `GenesisApi` (`genesis`/`resume`) and `HandoffApi` (`handoff`/`changed`/`rerun`), both co-located below.
// Its three duties: CHECKPOINT + RESUME (GEN-8a, drive sites in deterministic GEN-2/11 rank order, resume
// from `rank > lastCompletedRank`); TOTAL / MALFORMED-DEGRADE (GEN-8b/8c, an honest partial `GenesisReport`
// + `resumeToken`, NEVER a throw); IDEMPOTENT + INCREMENTAL HAND-OFF (GEN-7, KNOW-15 upsert dedup by `id`,
// bucket-bounded `rerun`, hand control to born-from-work). Sibling stages are CALLED via `ControllerDeps`.
//
// THE PASS ITSELF LIVES IN `drive.ts`, split out at the 400-LOC ceiling: this file is what happens AROUND a
// pass (bind the API, carry the resume context, decide the hand-off), that one is the loop that spends the
// budget and writes the ledger. It is also where concurrency (task #158) is contained — which is why nothing
// below mentions it beyond re-exporting the vocabulary.

import type { Delta } from "@atlas/index"
import { defaultEncoder } from "@atlas/kernel"
import type {
  Candidate,
  Fact,
  GenesisBudget,
  GenesisReport,
  ResumeToken,
  RunCoverage,
  SiteOutcome,
  Skeleton,
} from "./types.js"
import { NO_FRONTIER } from "./coverage.js"
import { drive, type DrivePorts, type DriveResult } from "./drive.js"

/** [#210] The unwired-model sentinel. Kept IN SYNC BY VALUE with `NO_MODEL_IDENTITY` (`mine-proposer.ts`,
 *  the cli layer) — NOT imported: the cli sits ABOVE genesis in the ARCH layering (this file's own header:
 *  "imports DOWNWARD only"), so importing it here would invert the direction the constitution enforces.
 *  Drift between the two literals is a cross-package test's job to catch, never a runtime dependency's. */
export const NO_MODEL_IDENTITY = "unwired:no-model-configured" as const

/**
 * [#209] Fold this run's answer-provenance receipts (`answerRef`s of the admitted facts that carry one,
 * #195 leg b) into the report's WITNESS fields. Sorted before hashing so the digest depends on WHAT was
 * stored, never on the order it was admitted in: two runs that stored the identical set, admitted in a
 * different order, must witness identically; two runs that stored a different set never may.
 *
 * `receipts` absent (a caller that has not wired `ControllerDeps.answerReceipts` — #195b not yet reachable
 * from this seam) folds to the SAME shape a wired caller with zero receipts would produce: `answersStored:
 * 0` plus the real digest of the empty set. That is the honest reading — "this run recorded no receipts",
 * never "this run is exempt from being asked".
 */
function answersWitness(receipts: readonly string[] | undefined): { answersStored: number; answersDigest: string } {
  const sorted = [...(receipts ?? [])].sort()
  return {
    answersStored: sorted.length,
    answersDigest: String(defaultEncoder.hash(new TextEncoder().encode(sorted.join("\n")))),
  }
}

// The batching vocabulary, re-exported so the package surface is unchanged by the file split (the barrel
// re-exports this module). `POOL_WIDTH` has a production consumer outside this package: the `mine` driver
// sizes its worker pool from it, so the batch width and the pool width cannot drift apart.
export { POOL_WIDTH } from "./drive.js"
export type { VisitAttempt, DrivePorts, DriveResult } from "./drive.js"

export interface GenesisApi {
  /** The TOTAL composition-root entry (GEN-8): `atlas-genesis <repo> --at <rev> [--budget N]
   *  [--scope <path>]` → `GenesisReport`. Runs S0→S4. TOTAL — a malformed repo/rev yields an honest
   *  empty/partial report carrying a `resumeToken`, NEVER a throw (GEN-8). `--scope` seeds a subtree, not
   *  the whole repo (GEN-13). With all deepening loops off (`budget`) cost == the single-pass baseline
   *  (GEN-14).
   *
   *  [FLAG — arg carriers] the surface line (atlas-genesis:184) types none of the args; `repo`/`rev`
   *  transcribed as `string` (mirroring `scan`/`mine`; `rev` deliberately a malformable raw string, not a
   *  branded `Hash`), `budget?` as the `GenesisBudget` policy, `scope?` as a subtree path `string`. */
  genesis(repo: string, rev: string, budget?: GenesisBudget, scope?: string): GenesisReport

  /** Resume an interrupted run from the last completed ranked site (GEN-8). Consumes the `resumeToken`
   *  from a prior partial report and continues the deterministic rank-ordered spend. TOTAL — never throws. */
  resume(token: ResumeToken): GenesisReport
}

export interface HandoffApi {
  /** S4 one-time handoff (GEN-7). Ends the one-time seeding and hands control to born-from-work (KNOW-13).
   *  NOT a standing sweeper. Total — never throws. */
  handoff(): void

  /** The bounded change set since a `prior` skeleton (INDEX-12 / GEN-7). Re-indexes ONLY the changed
   *  buckets, never `N` — the `Delta` (`{idChanged, stateChanged, changedBuckets}`) reused verbatim from
   *  @atlas/index. Bounds the incremental re-run below. */
  changed(prior: Skeleton, rev: string): Delta

  /** INCREMENTAL idempotent re-run (GEN-7). Re-indexes only the changed files (via `changed`) and UPSERTS
   *  already-grounded facts by id (0 duplicates, KNOW-15); a second run over an unchanged rev is a no-op
   *  on the grounded set. Total — a malformed rev ⇒ a partial report, never a throw (GEN-8). */
  rerun(repo: string, rev: string, prior: Skeleton): GenesisReport
}

/** The GEN-2 hard-ceiling cap: default budget is `min(frontier_size, 200)` sites/run (atlas-genesis:198). */
export const CEILING_CAP = 200 as const

/** All-off deepening (GEN-13/14 single-pass baseline) — this facet never opens a deepening loop (EPIC-31). */
const LOOPS_OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const

/** A cost policy at a CALLER-CHOSEN site ceiling, single-pass (all deepening loops off — the GEN-13/14
 *  baseline). The SAME shape `defaultBudget` returns; only the ceiling is the caller's, which is why it is
 *  the ONE source of that shape (`defaultBudget` is `cappedBudget(min(frontier, CEILING_CAP))`). The knob a
 *  metered `atlas mine` run reaches through `ATLAS_MINE_BUDGET` to cap real spend below the 200 default. */
export function cappedBudget(ceiling: number): GenesisBudget {
  return { ceiling, deepening: { review: LOOPS_OFF, enrich: LOOPS_OFF, expand: LOOPS_OFF } }
}

/** The GEN-2 default cost policy when the caller passes no `--budget`: `min(frontier_size, 200)`, loops off. */
export function defaultBudget(frontierSize: number): GenesisBudget {
  return cappedBudget(Math.min(frontierSize, CEILING_CAP))
}

/**
 * A TOTAL plan of the ranked frontier (S0 `scan` → S1 `mine`/`rank`) — CALLED, never authored here (those
 * are sibling facets). `malformed` flags an honest degrade: `sites` is the reachable portion (possibly
 * empty), `skeleton` the partial substrate. Never throws by contract (GEN-8); the controller guards it too.
 */
export interface Plan {
  readonly malformed: boolean
  readonly skeleton?: Skeleton
  readonly sites: readonly Candidate[] // deterministic GEN-2/11 rank order (may be [] / partial on malformed)
}

/**
 * The injected ports the run controller ORCHESTRATES (card exclusions: "it calls them"). Nothing here is
 * authored by this WP.
 *   - `plan`      — S0/S1 frontier build (total).
 *   - `visit`     — the S2 per-site proposal/admission driver (WP-8.28); MAY throw (an interruption).
 *   - `visitAll`  — OPTIONAL batched S2 dispatch, the one seam concurrency enters through (task #158).
 *   - `upsert`    — the KNOW-15 write-decision: idempotent merge by fact `id`, returns the grounded set.
 *   - `changed`   — the INDEX-12 bounded change set since a prior skeleton.
 *   - `handoffTo` — hand control to born-from-work (KNOW-13); the S4 terminator.
 *
 * The first three are inherited from `DrivePorts` (drive.ts) rather than restated, and the direction of that
 * inheritance is the point: a PASS is handed strictly less than the controller has. It cannot re-plan the
 * frontier, because `plan` is not among the ports it receives — so "the ranked frontier is computed once,
 * before the pass, never per worker" holds because nothing in the loop is ABLE to violate it.
 */
export interface ControllerDeps extends DrivePorts {
  plan(repo: string, rev: string, scope?: string): Plan
  changed(prior: Skeleton, rev: string): Delta
  handoffTo(): void
  /** [#210] The model identity that produced this run's answers (`captureModelIdentity`, mine-proposer.ts,
   *  ADR-0011) — THREADED, never re-derived here: resolving it (a `--version` probe against a configured
   *  model command) is a caller-side concern this facet only reports. ABSENT (an older/injected caller that
   *  has not wired it) ⇒ the controller stamps its own copy of the unwired sentinel (`NO_MODEL_IDENTITY`
   *  above) — never a fabricated identity for a run that may in fact have had a real model wired. */
  readonly modelIdentity?: string
  /** [#209] OPTIONAL: the answer-provenance receipts (`answerRef`s, #195 leg b) of every fact ADMITTED SO
   *  FAR in this run — cumulative across a `resume`/`rerun` leg the same way `upsert`'s own grounded set is
   *  (KNOW-15 idempotent merge), so one call after a drive leg reports the WHOLE run's stored receipts, not
   *  just that leg's. A fact with no `answerRef` (pre-#195 / a non-mine door) is simply absent from what
   *  this returns — fail-closed, never fabricated. ABSENT PORT ⇒ the report honestly witnesses zero
   *  receipts (`answersStored: 0`, the empty-set digest) — "this run recorded no receipts", never "this run
   *  stored no answers". See `answersWitness` above and `docs/design/195-answer-provenance-contract.md §3`. */
  answerReceipts?(): readonly string[]
}

/** The site's axis bucket (its file) — the unit the INDEX-12 `changedBuckets` delta names (GEN-7c). */
export function bucketOf(cand: Candidate): string {
  const parts = cand.site.qualifiedPath.split("::")
  return parts[0] ?? cand.site.qualifiedPath
}

interface PendingRun {
  readonly sites: readonly Candidate[]
  readonly seeded: readonly Fact[]
  readonly llmCalls: number
  readonly budgetSpent: number
  /** Carried for the same reason `llmCalls` is: a resumed run's report describes the WHOLE run, and spend
   *  that stopped being counted at the interruption would understate what the operator was billed. */
  readonly modelCalls: number
  readonly budget: GenesisBudget
  /** The ledger SO FAR. Carried across `resume` for the same reason `seeded` is: a resumed run's report
   *  describes the WHOLE run, so its coverage must account for the sites the first leg already drove —
   *  otherwise the site set would appear to shrink at exactly the moment the run was interrupted. */
  readonly outcomes: readonly SiteOutcome[]
}

/** An honest empty/partial report — the total degrade shape (GEN-8b/8c). The ledger says `unavailable`:
 *  no frontier was ever obtained, which is a different claim from "the frontier was empty". */
function emptyReport(token: ResumeToken | undefined, modelIdentity: string): GenesisReport {
  return {
    seeded: [],
    ratified: [],
    open: [],
    llmCalls: 0,
    budgetSpent: 0,
    modelCalls: 0, // ALWAYS present, including zero — a counter that appeared only when non-zero would
    modelIdentity, //           read as "this never happens", which is exactly the claim it must not make —
    ...answersWitness(undefined), // the same reason #210/#209's fields are stamped on a total-degrade report too.
    coverage: NO_FRONTIER,
    ...(token ? { resumeToken: token } : {}),
  }
}

/**
 * Fold a drive result into a `GenesisReport`. A `resumeToken` rides ONLY a partial/interrupted or
 * malformed run (GEN-8); a complete run carries none. `ratified`/`open` (S3, WP-8.29) are not this
 * facet's stage — empty here.
 *
 * `planned` is passed in rather than read off `res.outcomes.length`, and that is the point: the two are
 * compared by `reconcile`, so deriving one from the other would make the check vacuous. `planned` is the
 * size of the frontier the controller was HANDED; the rows are what it managed to account for.
 */
function toReport(
  res: DriveResult,
  malformed: boolean,
  planned: number,
  prior: readonly SiteOutcome[],
  modelIdentity: string,
  answerReceipts: readonly string[] | undefined,
): GenesisReport {
  const partial = res.interrupted || malformed
  const coverage: RunCoverage = { frontier: "planned", planned, sites: [...prior, ...res.outcomes] }
  return {
    seeded: res.seeded,
    ratified: [],
    open: [],
    llmCalls: res.llmCalls,
    budgetSpent: res.budgetSpent,
    modelCalls: res.modelCalls, // what the run PAID FOR; `llmCalls` is what it USED (they differ on a fault)
    modelIdentity, // [#210] which CLI+version produced this run's answers (NO_MODEL_IDENTITY if none wired)
    ...answersWitness(answerReceipts), // [#209] answersStored + answersDigest — the "issued vs stored" witness
    coverage,
    ...(partial ? { resumeToken: { lastCompletedRank: res.lastCompletedRank } } : {}),
  }
}

/**
 * Bind the run controller to the frozen `GenesisApi` + `HandoffApi` surfaces (co-located above).
 * The single-run bootstrap keeps its checkpoint in the closure `pending` (the persisted resume context);
 * `resume(token)` re-drives its remainder. The injected seams are the "it calls them" ports (card
 * exclusions), never a change to the frozen contract.
 */
export function makeRunController(deps: ControllerDeps): GenesisApi & HandoffApi {
  let pending: PendingRun | null = null
  // [#210] Read once per call, not cached across the controller's lifetime: `deps.modelIdentity` may be a
  // getter over a config the caller re-resolves (e.g. a probe result), and this facet only reports it.
  const identity = (): string => deps.modelIdentity ?? NO_MODEL_IDENTITY

  const runFresh = (plan: Plan, budget: GenesisBudget): GenesisReport => {
    const res = drive(plan.sites, budget, -1, 0, 0, 0, [], deps)
    pending = {
      sites: plan.sites,
      seeded: res.seeded,
      llmCalls: res.llmCalls,
      budgetSpent: res.budgetSpent,
      modelCalls: res.modelCalls,
      budget,
      // ONLY the rows for sites the resume will NOT re-drive. `resume` re-drives every site past the
      // cursor, so carrying THEIR rows too would double-count them in the resumed report's ledger — a
      // duplicate overstates coverage exactly as a gap understates it, and `reconcile` fails both.
      // It also fails LOUD in the right direction: a resume handed a cursor further ahead than this run
      // actually reached genuinely skips the sites in between, and dropping their stale rows here is what
      // makes that resumed run's ledger refuse to close instead of closing over sites nobody visited.
      outcomes: res.outcomes.filter((o) => o.rank <= res.lastCompletedRank),
    }
    const report = toReport(res, plan.malformed, plan.sites.length, [], identity(), deps.answerReceipts?.())
    // S4 hand-off (GEN-7a) only on a COMPLETE run — a partial/interrupted or malformed run is not done.
    if (!res.interrupted && !plan.malformed) deps.handoffTo()
    return report
  }

  const genesis = (repo: string, rev: string, budget?: GenesisBudget, scope?: string): GenesisReport => {
    try {
      const plan = deps.plan(repo, rev, scope)
      const b = budget ?? defaultBudget(plan.sites.length)
      return runFresh(plan, b)
    } catch {
      // GEN-8c: a malformed repo/rev never throws — honest empty skeleton + resume cursor.
      pending = null
      return emptyReport({ lastCompletedRank: -1 }, identity())
    }
  }

  const resume = (token: ResumeToken): GenesisReport => {
    try {
      // No persisted run for this cursor — an honest empty partial, never a throw (GEN-8c).
      if (!pending) return emptyReport(token, identity())
      // GEN-8a: continue past the last completed site — the done sites are NOT re-visited.
      const remaining = pending.sites.filter((s) => s.rank > token.lastCompletedRank)
      const res = drive(
        remaining,
        pending.budget,
        token.lastCompletedRank,
        pending.llmCalls,
        pending.budgetSpent,
        pending.modelCalls,
        pending.seeded,
        deps,
      )
      const planned = pending.sites.length
      // The carried rows are cut to the SAME cursor `remaining` was cut to. Read off the TOKEN, not off
      // `pending`: resuming twice from one token re-drives the same sites, and a carried row for a site
      // about to be re-driven would land in the ledger twice.
      const prior = pending.outcomes.filter((o) => o.rank <= token.lastCompletedRank)
      pending = {
        ...pending,
        seeded: res.seeded,
        llmCalls: res.llmCalls,
        budgetSpent: res.budgetSpent,
        modelCalls: res.modelCalls,
        outcomes: [...prior, ...res.outcomes.filter((o) => o.rank <= res.lastCompletedRank)],
      }
      // The resumed report's ledger is the WHOLE run's: the rows the first leg completed, plus this leg's.
      // `planned` stays the size of the original frontier, so the set the reconciliation closes over is the
      // one the run was actually handed — not the remainder it happened to be restarted with.
      const report = toReport(res, false, planned, prior, identity(), deps.answerReceipts?.())
      if (!res.interrupted) deps.handoffTo() // the resumed run completed ⇒ hand off (GEN-7a)
      return report
    } catch {
      return emptyReport(token, identity())
    }
  }

  // ── HandoffApi ─────────────────────────────────────────────────────────────────────────────────────
  const handoff = (): void => {
    // S4 one-time hand-off to born-from-work (GEN-7a). NOT a standing sweeper — one call, then return.
    deps.handoffTo()
  }

  const changed = (prior: Skeleton, rev: string): Delta => deps.changed(prior, rev)

  const rerun = (repo: string, rev: string, prior: Skeleton): GenesisReport => {
    try {
      const plan = deps.plan(repo, rev)
      if (plan.malformed) return emptyReport({ lastCompletedRank: -1 }, identity()) // total (GEN-8c)
      // GEN-7c INCREMENTAL: bound the re-index to ONLY the buckets the INDEX-12 delta names.
      const delta = deps.changed(prior, rev)
      const buckets = new Set(delta.changedBuckets)
      const incremental = plan.sites.filter((s) => buckets.has(bucketOf(s)))
      const res = drive(incremental, defaultBudget(incremental.length), -1, 0, 0, 0, [], deps)
      // `planned` is the INCREMENTAL set, not `plan.sites`: an incremental re-run is scoped to the buckets
      // the INDEX-12 delta names, and the sites outside it were not dropped — they were never in scope.
      // Charging them to this run's coverage would report a gap that does not exist.
      const report = toReport(res, false, incremental.length, [], identity(), deps.answerReceipts?.())
      // Control returns to born-from-work after the incremental pass (GEN-7a); writes were idempotent (7b).
      if (!res.interrupted) deps.handoffTo()
      return report
    } catch {
      return emptyReport({ lastCompletedRank: -1 }, identity())
    }
  }

  return { genesis, resume, handoff, changed, rerun }
}

// differential-vs-oracle (compile-time): the controller conforms to the frozen GenesisApi + HandoffApi.
const _controller: (deps: ControllerDeps) => GenesisApi & HandoffApi = makeRunController
void _controller
