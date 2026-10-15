// @atlas/cli — src/mine-render.ts  (CLI-4 / WP-F6: how a finished `mine` pass renders)
//
// Split out of `mine.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers one
// question — given a pass that has already run, what does the operator get to read. `mine.ts` keeps the
// run composition; this file keeps the projection and the prose.
//
// Nothing here asserts anything about the WIRING: every leg is READ OFF the run's own outcome, which is
// what keeps the "why is it 0" line from going stale when a seam upstream of it is wired or unwired later.

import type { GenesisReport, SiteOutcome } from "@atlas/genesis"
import { reconcile } from "@atlas/genesis"
import type { CommitRefusal } from "@atlas/adapter-io"
import type { Awareness } from "@atlas/memory"
import { STAGING_REFUSAL_TEXT as REFUSAL_TEXT } from "./mine-staging.js"
import type { CliVerdict } from "./render.js"

/**
 * One finished pass: the run's `GenesisReport` plus the four things the report cannot carry.
 *
 * `GenesisReport` is transcribed EXACTLY from the frozen surface literal (genesis/types.ts:129-153), so it
 * is not the place for any of this; each rides BESIDE it instead:
 *   - `refusal`      — WHY the staging commit refused. `run-controller` catches an interrupted site WITHOUT
 *                      a cause (GEN-8c is a bare `catch`), so "contended" would otherwise reach the user as
 *                      an anonymous partial run.
 *   - `modelWired`   — whether a REAL S2 proposer ran, computed from the RESOLUTION (mine-proposer.ts), not
 *                      from what the caller injected.
 *   - `promptDigest` — the ADR-0011 D3 provenance hash of the prompt artifact those proposals were built
 *                      from. Absent when no model was wired: no prompt was loaded, so there is none.
 *   - `seedsDropped` — dep-graph nodes the structural frontier had to drop for having no path. A bounded
 *                      set that is silently truncated reads as "we covered everything" (#130).
 */
export interface MinePass {
  readonly report: GenesisReport
  /** GEN-9 — the pass's assembled Awareness (the output of seed.ts, mined/assembled by the run itself).
   *  Present on every pass so a caller can read what was (and was not) seeded — never fabricated. */
  readonly seed: Awareness
  readonly refusal?: CommitRefusal
  readonly modelWired: boolean
  readonly promptDigest?: string
  readonly seedsDropped: number
}

/**
 * The OBSERVED shape of a finished pass — every leg READ OFF the run's own `GenesisReport`, never asserted
 * about the wiring (WP-F6). This is the whole point: the "why is it 0" line below is DERIVED from what the
 * run actually did, so it cannot go stale when a seam upstream of it is wired (or unwired) later.
 *   - `sitesVisited` — `report.budgetSpent`, the sites the controller COMPLETED against the ceiling
 *     (run-controller.ts increments it once per completed site). 0 ⇒ the extractor was never reached at
 *     all, so the proposer was never consulted — a 0 that NO amount of model-wiring would change.
 *   - `complete`     — no `resumeToken` ⇒ the pass ran to its end (GEN-8); a partial 0 is not a result.
 *   - `ceiling`      — the caller's explicit `--budget` ceiling, if any. Present ONLY to keep the
 *     `sitesVisited === 0` explanation exact: with no explicit budget the controller's default ceiling is
 *     `min(frontierSize, 200)`, so a COMPLETE pass that visited 0 sites proves the frontier itself was
 *     empty; with an explicit `ceiling: 0` the frontier is unknown and the budget is the honest cause.
 */
export interface MineOutcome {
  readonly facts: number //        grounded candidate facts the pass actually wrote
  readonly sitesVisited: number // sites completed against the ceiling (report.budgetSpent)
  readonly complete: boolean //    the pass ran to its end (no resumeToken)
  readonly modelWired: boolean //  a real S2 proposer actually ran this pass
  readonly ceiling?: number //     the caller's explicit budget ceiling, when one was given
}

/**
 * #237 — the honest "how many candidate facts did this pass admit" count.
 *
 * `report.seeded` is the store-write view: `mine.ts`'s `upsert` closure folds in only what `commitStaging`
 * actually MINTED this call, and `mine-decide.ts`'s "never re-author an already-staged key" guard (belt-
 * and-braces since ADR-0008) skips minting a site whose candidate key is already present in `staged.current`
 * from an EARLIER pass — it does not write, so it does not add to `grounded`, so it does not reach
 * `report.seeded`. A rerun over an unchanged repo (or a second arm re-visiting the same sites) is therefore
 * a real 0-NEW-WRITE pass, but every one of its sites still passed the S2 gate and admitted a candidate —
 * exactly what the per-site LEDGER (`RunCoverage`, GEN-12g) already records independently, one layer
 * upstream of the write-dedup, in the `outcome: 'seeded'` rows `coverageLines` prints below this header.
 *
 * MEASURED 2026-08-18: pinning `ATLAS_MINE_SLOT=advisory` against a repo whose sites were already staged
 * (a plain rerun) printed `genesis: seeded 0 candidate fact(s)` and `mine: 0 candidate facts — every one
 * abstained`, directly above a ledger showing all N sites `"outcome":"seeded"` with real fact ids, and
 * `.atlas/staging.json` durably holding all N rows. The two counts disagree because they are read off two
 * different layers of the SAME pass; this reads the ledger FIRST (the gate's own admission, the honest
 * "did this pass produce a candidate" question) and falls back to `r.seeded.length` only when a report
 * predates the ledger (`r.coverage` absent — the pre-#… reading, additive/absent-tolerant as the ledger
 * itself is).
 */
export function ledgerSeededIds(r: GenesisReport): ReadonlySet<string> | undefined {
  if (r.coverage === undefined) return undefined
  const ids = new Set<string>()
  for (const s of r.coverage.sites) if (s.outcome === "seeded") for (const factId of s.facts) ids.add(factId)
  return ids
}

/** The count `mineOutcome`/`foldVerdict` print — ledger-derived when the ledger exists (#237), the
 *  pre-ledger `r.seeded.length` reading otherwise. Exported so `mine-arms.ts`'s per-arm and union renders
 *  read the SAME count `mineWhyEmpty` reasons from — the two disagreeing is exactly the #237 defect. */
export function seededCount(r: GenesisReport): number {
  return ledgerSeededIds(r)?.size ?? r.seeded.length
}

/** Project the run's own report to the observed outcome — the ONLY input the explanation below reads. */
export function mineOutcome(r: GenesisReport, modelWired: boolean, ceiling?: number): MineOutcome {
  return {
    facts: seededCount(r),
    sitesVisited: r.budgetSpent,
    complete: r.resumeToken === undefined,
    modelWired,
    ...(ceiling !== undefined ? { ceiling } : {}),
  }
}

/**
 * WHY the pass produced nothing — COMPUTED from `MineOutcome`, never a hard-coded cause (WP-F6).
 *
 * A 0-fact pass has genuinely different causes, and naming the wrong one is a lie even when the sentence is
 * literally true. The distinction the user needs is WHERE the run stopped producing:
 *   • 0 sites visited  — the run died UPSTREAM of the model: the structural pass (skeleton → ranked
 *     frontier) handed the extractor nothing, so no proposer was ever consulted. Saying "no model is wired"
 *     here would tell the user the product is one wire from working when the model is not even reached.
 *     Naming what would NOT fix it is only half a diagnosis, so this case now also names where the answer
 *     is: `atlas doctor index`. `axes.edges` comes from SCIP alone and the frontier ranks by dep-graph
 *     degree, so the usual cause of a structurally empty frontier is an absent `.atlas/index.scip` — which
 *     that leg reports, along with the command that produces one. It POINTS, it does not promise: an
 *     indexed repository can still have an empty frontier, and the leg says which case this is.
 *   • N sites visited, 0 facts — the model gate IS where the 0 came from: every visited site abstained
 *     (`genesis/extract.ts:118`) or was refused by the 2-door gate. Only HERE is the absent proposer the
 *     operative cause, and only here is "abstain-by-design, never fabricated" the honest framing.
 *   • an incomplete pass — a 0 that is not a finished result at all.
 * Returns `null` when the pass seeded facts (there is nothing to explain).
 */
export function mineWhyEmpty(o: MineOutcome): string | null {
  if (o.facts > 0) return null
  if (!o.complete) {
    return "mine: 0 candidate facts — the pass did not run to completion, so this 0 is not a finished result"
  }
  if (o.sitesVisited === 0) {
    return o.ceiling === 0
      ? "mine: 0 candidate facts — 0 sites visited: the run budget ceiling was 0, so nothing was ever extracted"
      : "mine: 0 candidate facts — 0 sites visited: the structural pass (skeleton → ranked frontier) yielded no site, so no proposer was ever consulted; wiring a model would not change this 0. Run `atlas doctor index` to see whether this repository has the SCIP index the frontier is derived from"
  }
  return o.modelWired
    ? `mine: 0 candidate facts — ${o.sitesVisited} site(s) visited and every one abstained: nothing was proposed or admitted (facts are never fabricated)`
    : `mine: 0 candidate facts — ${o.sitesVisited} site(s) visited and every one abstained: no proposer model is wired, so nothing could be proposed (facts are never fabricated)`
}

/** The DROP line (GEN-15c). A dep-graph node with no counterpart on the spatial axis has no path, so no
 *  bytes could be shown to a model at it (INDEX-13 cross-language/FFI targets, and any indexed document
 *  outside the tracked tree). It is dropped from the frontier — and SAID, because a frontier that shrinks
 *  in silence is indistinguishable from a repository with less in it. */
export function frontierDropLine(dropped: number): string | null {
  return dropped > 0
    ? `frontier: ${dropped} dep-graph node(s) dropped — no path on the spatial axis, so no source could be shown to a model (INDEX-13)`
    : null
}

/** The PROVENANCE line (ADR-0011 D3). The prompt is a versioned artifact "hashed into the run's provenance",
 *  and `propose.md` leans on it: the refusal RATE is only readable as a quality signal with the prompt held
 *  fixed. That is only true if the hash of the artifact actually used LEAVES the run. */
export function promptProvenanceLine(digest: string | undefined): string | null {
  return digest === undefined ? null : `prompt: ${digest} — the artifact every proposal on this run was built from`
}

/**
 * ONE ledger row, as the run prints it — the `site:` prefix plus a single-line JSON object.
 *
 * JSON and not prose, deliberately. A `WhyNot.reason` is free text a model wrote: it can carry spaces,
 * punctuation, a colon, a `·`, or a newline, and every prose format that has to survive that ends up with a
 * bespoke escaping convention nobody maintains. `JSON.stringify` already has one. The `site: ` prefix keeps
 * the block greppable and lets a reader split the ledger from the summary without a parser.
 *
 * The row names the site by `qualifiedPath` (the site's identity) and `kind`, never by line numbers — the
 * anchor's `subtreeHash` is the drift oracle and is not this record's business. A `seeded` row lists its
 * fact ids because ONE SITE MAY YIELD MORE THAN ONE FACT, which is exactly why `sites − facts` is not a
 * residual and why the row, not the count, is the thing that reconciles.
 */
export function siteLine(o: SiteOutcome): string {
  const row: Record<string, unknown> = {
    rank: o.rank,
    outcome: o.outcome,
    kind: o.site.kind,
    path: o.site.qualifiedPath,
  }
  if (o.outcome === "seeded") row["facts"] = o.facts
  if (o.outcome === "abstained") row["whyNot"] = o.whyNot.reason
  if (o.outcome === "unrecorded") row["note"] = o.note
  if (o.outcome === "unvisited") row["cause"] = o.cause
  return `site: ${JSON.stringify(row)}`
}

/**
 * The COVERAGE block: the reconciliation verdict, then one row per planned site.
 *
 * This is the run's durable ledger, and until it existed there was none — `GenesisReport` had no abstention
 * field and the run controller dropped every `WhyNot`, so a site that ABSTAINED (a valid, grounded GEN-12
 * outcome) and a site that was SILENTLY DROPPED were indistinguishable in everything the product wrote.
 * "Atlas mined this repository completely" was therefore unfalsifiable, which is the same class of defect as
 * an unauditable admission filter.
 *
 * ABSENT-TOLERANT (the `builtAt` / `sameAs` / `derivedAt` precedent): a report from before the ledger has no
 * `coverage`, and that reads as UNEVALUABLE — never as a run that covered nothing, and never as one that
 * covered everything. `reconcile` owns that distinction; this function only prints it.
 *
 * The rows are printed IN FULL rather than sampled. A ledger you have to ask for twice is not a ledger, and
 * a truncated one re-opens the exact hole it closes: the sites elided are indistinguishable from sites
 * dropped. A 200-site run is the ceiling (GEN-2), so this is bounded by construction.
 */
export function coverageLines(r: GenesisReport): readonly string[] {
  const rec = reconcile(r.coverage)
  const head = `coverage: ${rec.why}`
  if (r.coverage === undefined || r.coverage.sites.length === 0) return [head]
  return [head, ...r.coverage.sites.map(siteLine)]
}

/**
 * The pass BODY — every line `foldVerdict` builds BELOW the `genesis:`+`cost:` header, in order:
 * frontier-drop, prompt-provenance, staging-refusal, the `mineWhyEmpty` cause (the #129/#163 honesty leg that
 * names WHY a pass is empty and points at `atlas doctor index`), the partial line, then the coverage ledger.
 *
 * Extracted so the MULTI-ARM fold (`foldArms`, mine-arms.ts) can give each arm the SAME full body a single-arm
 * run gets — never just the coverage ledger, which would drop the why-empty next-step and leave a default
 * `atlas mine` on an unindexed repo a dead end. `foldVerdict` composes it verbatim, so the single-arm output
 * stays byte-identical (the mine-render + single-arm suites are the proof of that faithfulness).
 */
export function passBodyLines(pass: MinePass, ceiling?: number): readonly string[] {
  const r = pass.report
  const why = mineWhyEmpty(mineOutcome(r, pass.modelWired, ceiling))
  return [
    ...opt(frontierDropLine(pass.seedsDropped)),
    ...opt(promptProvenanceLine(pass.promptDigest)),
    // NAMED, above the generic partial line: a refused staging commit wrote NOTHING, and "did not run to
    // completion" alone leaves the operator guessing between a dead model and a lost race.
    ...(pass.refusal !== undefined ? [`staging: REFUSED (${pass.refusal}) — ${REFUSAL_TEXT[pass.refusal]}`] : []),
    ...opt(why),
    ...(r.resumeToken ? [`partial: resume at rank ${r.resumeToken.lastCompletedRank}`] : []),
    // LAST, and always. The per-site ledger is the only thing that lets a reader establish what the run
    // covered; it goes below the prose so the three lines `mine.md` pins verbatim keep their position, and
    // it is unconditional so that "no ledger" can only ever mean "this run has none", never "we skipped it".
    ...coverageLines(r),
  ]
}

/** Fold a finished pass to the CLI's process outcome. `renderVerdict` (render.ts) projects a handler
 *  `Verdict`, not a `GenesisReport`, so the fold is direct: a partial/interrupted run is a non-zero exit.
 *  An empty pass EXPLAINS itself with `mineWhyEmpty` — the cause is computed from the report, so the line
 *  stays true whether the 0 came from an empty frontier or from an unwired model (WP-F6). */
export function foldVerdict(pass: MinePass, ceiling?: number): CliVerdict {
  const r = pass.report
  const lines = [
    `genesis: seeded ${seededCount(r)} candidate fact(s); ratified ${r.ratified.length}`,
    `cost: llmCalls ${r.llmCalls} · budgetSpent ${r.budgetSpent}`,
    ...passBodyLines(pass, ceiling),
  ]
  const failed = r.resumeToken !== undefined || pass.refusal !== undefined
  return { exitCode: failed ? 1 : 0, stdout: `${lines.join("\n")}\n` }
}

/** One optional line as a spreadable list — `null` contributes nothing. */
const opt = (line: string | null): readonly string[] => (line === null ? [] : [line])
