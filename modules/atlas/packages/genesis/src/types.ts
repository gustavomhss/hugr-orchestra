// @atlas/genesis — src/types.ts  (frozen data model + co-located API interfaces; zero runtime)
//
// Layer 8 bootstrap/composition-root shared model: the ranked mining `Candidate` (a ranked SITE, NEVER a
// fact — GEN-6), S1 signals, abstention `WhyNot`, ratification `OpenQ`, per-stage cost, resume token, the
// total `GenesisReport`, plus the co-located API interfaces consumed by ≥2 src files (the GEN-13/14 budget
// vocabulary + `BudgetApi`, the S2 `ExtractApi`/`ExtractResult`, and the S0 `Skeleton`/`ScanApi`).
// `StructRef` (contracts) and `GroundedFact` (knowledge) are IMPORTED, NEVER redefined; `Candidate`/`WhyNot`
// are GENESIS-HOME (distinct from the @atlas/knowledge staging `Candidate`, which is a fact-in-waiting).

import type { StructRef } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { Axes, Manifest } from "@atlas/index"
// `GenesisBudget` lives in `budget-types.ts` (extracted below at the LOC ceiling) but is USED here by
// `ExtractApi.extract` — imported for local use in ADDITION to the re-export, since `export type {...}
// from` does not bring a name into this file's own scope.
import type { GenesisBudget } from "./budget-types.js"

/**
 * A seeded fact. Genesis does NOT mint a competing node record — a fact it seeds IS the steady-state
 * @atlas/knowledge `GroundedFact` (KNOW-13, the kind genesis hands off to). Re-exported as `Fact` so
 * consumers can read the genesis dialect from one place; owned by @atlas/knowledge, NOT redefined.
 */
export type Fact = GroundedFact

/**
 * A human-ratified fact (KNOW-8, GEN-5). The S3 interview's output: `T0` / contested facts reach
 * `ratified` ONLY through the batched, ranked interview. Reuses the @atlas/knowledge `GroundedFact`
 * (a ratified fact is a grounded node) — NOT a distinct invented record.
 */
export type Ratified = GroundedFact

/** The five pipeline stages (§The pipeline S0→S4) — used to key the per-stage cost report (GEN-13). */
export type PipelineStage = "S0" | "S1" | "S2" | "S3" | "S4"

/**
 * The S1 mined ranking signals for one site (GEN-6 — these feed only the candidate `rank`, NEVER the fact
 * set). Transcribed EXACTLY from atlas-genesis:193 —
 *   `MinedSignals = { hotspot, szzBugCommits: number, coChanged: StructRef[], owners: string[],
 *                     messages: string[] }`.
 * Each field is a NAMED mechanical heuristic: `hotspot` = CodeScene change-freq × complexity;
 * `szzBugCommits` = SZZ bug-introducing commit count; `coChanged` = temporal/logical-coupling basket;
 * `owners` = git-blame ownership / bus-factor; `messages` = commit-message corpus. A signal is a *ranking*
 * input only — churn/SZZ alone MUST NOT mint a fact (GEN-6).
 *
 * [FLAG — `hotspot` type] atlas-genesis:193 lists `hotspot` with NO type (the other four are typed). It is
 * a change-frequency × complexity SCALAR score (a recency-weighted number, §S1) — transcribed as `number`
 * (the honest scalar form), NOT invented as a record. Flagged for the owning WP to confirm the carrier.
 */
export interface MinedSignals {
  readonly hotspot: number // [FLAG] reference untyped; change-freq × complexity scalar (§S1)
  readonly szzBugCommits: number // SZZ bug-introducing commits blamed to this site
  readonly coChanged: readonly StructRef[] // temporal/logical-coupling co-change basket
  readonly owners: readonly string[] // git-blame ownership / bus-factor map
  readonly messages: readonly string[] // commit-message corpus for this site
}

/**
 * A RANKED mining site — NEVER a fact (GEN-6). Transcribed EXACTLY from atlas-genesis:192 —
 *   `Candidate = { site: StructRef, signals: MinedSignals, ppr: number, rank: number }`.
 * `mine`/`rank` return `Candidate[]`; the signals feed only `ppr`/`rank`. A Candidate becomes a `Fact`
 * ONLY after S2 `extract` grounds it and it clears the 2-door bar (GEN-4). This is genesis-HOME; it is
 * NOT the @atlas/knowledge staging `Candidate`.
 *   - `site`    — the anchored structural unit (the drift oracle rides `StructRef.subtreeHash`).
 *   - `signals` — the mined ranking heuristics (GEN-6).
 *   - `ppr`     — personalized-PageRank score over the def→ref graph (GEN-11, deterministic).
 *   - `rank`    — the total order position (stable, ties broken deterministically — GEN-11).
 */
export interface Candidate {
  readonly site: StructRef
  readonly signals: MinedSignals
  readonly ppr: number
  readonly rank: number
}

/**
 * A grounded ABSTENTION (GEN-12). When S2 `extract` finds no grounded fact at a site, it
 * emits a `WhyNot` — abstention is a VALID outcome, never a manufactured fact. GENESIS-HOME (frozen
 * nowhere below).
 *
 * [PINNED — oracle-pin-map §12] atlas-genesis §S2/GEN-12 names "a grounded why-not" (:149). The minimal
 * carrier is `site` (grounded to the anchored StructRef) + a `reason` (honest justification text) — no
 * speculative fields. NOT an invented record.
 */
export interface WhyNot {
  readonly site: StructRef // the anchored site the model abstained on (grounded)
  readonly reason: string // the why-not body — honest justification text (GEN-12)
}

/**
 * One open ratification question for the S3 interview (GEN-5). Transcribed EXACTLY from atlas-genesis:194 —
 *   `OpenQ = { kind: 'owner'|'tier'|'contested'|'intent', site, options?: string[], rankReason }`.
 * The interview is batched + ranked (blast×tier), never one-at-a-time, capped at the top 20 Q/session.
 *
 * [FLAG — `site` type] the reference lists `site` untyped; it is the anchored site under question →
 * transcribed as the frozen `StructRef` (mirrors `Candidate.site`).
 * [PINNED — oracle-pin-map §genesis] `rankReason` is the blast×tier rank justification text
 * (atlas-genesis:194 surface literal) → `string`. NOT a record.
 */
export interface OpenQ {
  readonly kind: "owner" | "tier" | "contested" | "intent"
  readonly site: StructRef // [FLAG] reference untyped — the anchored site under question
  readonly options?: readonly string[]
  readonly rankReason: string // justification text — blast×tier rank reason (atlas-genesis:194)
}

/**
 * The per-stage cost line (GEN-13 — "report cost per stage"). GENESIS-HOME.
 *
 * [PINNED — oracle-pin-map §12] GEN-13 floor: `stage` + `llmCalls` only. LLM-call count is the GEN-3 cost
 * oracle; token / wall-clock / ceiling legs are NOT invented (no golden forces them). `stage` is the
 * reference-grounded `PipelineStage` (§The pipeline S0→S4) — a stricter transcription of the `string` floor.
 */
export interface StageCost {
  readonly stage: PipelineStage
  readonly llmCalls: number // the GEN-3 cost oracle — a function of the frontier, never of size
}

/** The whole-run per-stage cost report (GEN-13). One `StageCost` per pipeline stage. */
export type CostReport = readonly StageCost[]

/**
 * The resume cursor (GEN-8). An interrupted run resumes from the LAST COMPLETED RANKED SITE; a malformed
 * rev yields a partial report carrying this token, NEVER a throw. GENESIS-HOME.
 *
 * [PINNED — oracle-pin-map §genesis, GEN-8] sites are visited in a deterministic rank order (GEN-2/11), so
 * the resume cursor is the last completed rank. Minimal single-leg carrier; additional legs (partial
 * skeleton hash, spent budget) are NOT invented.
 */
export interface ResumeToken {
  readonly lastCompletedRank: number // resume from the last completed ranked site (GEN-8)
}

/**
 * What ONE site on the planned frontier came to. The RUN LEDGER's row (GEN-8 + GEN-12g).
 *
 * The five arms are the outcomes the run controller can actually distinguish, and they are deliberately
 * NOT collapsed: `abstained` (a site was visited and the grounded GEN-12 `WhyNot` came back) and
 * `unvisited` (the run never spent a call there) are different facts about coverage, and a ledger that
 * cannot tell them apart is the defect this row exists to remove. `unrecorded` is the honest third case —
 * the site WAS visited and produced no fact, but the `visit` port returned bare facts, so the `WhyNot` it
 * had is not reachable from here. It reports that it cannot report, rather than manufacturing an
 * abstention reason nothing grounded.
 *
 * GENESIS-HOME, and built from vocabulary that already exists: the site is the anchored `StructRef` the
 * `Candidate` already carries, the abstention is the `WhyNot` GEN-12 already defines, and `facts` names the
 * seeded `Fact`s by their own `id`. No parallel record of a site, a fact or an abstention is introduced.
 */
export type SiteOutcome =
  | {
      readonly outcome: "seeded"
      readonly rank: number //          the GEN-2/11 rank position this site was driven at
      readonly site: StructRef //       the anchored site (grounded — the same ref the Candidate carried)
      readonly facts: readonly string[] // the seeded facts, by their own `id` — WITH WHAT, not just how many
    }
  | {
      readonly outcome: "abstained"
      readonly rank: number
      readonly site: StructRef
      readonly whyNot: WhyNot //        the grounded GEN-12 abstention, kept — not re-derived, not invented
    }
  | {
      readonly outcome: "unrecorded"
      readonly rank: number
      readonly site: StructRef
      readonly note: string //          WHY the outcome could not be recorded — about the port, not the site
    }
  | {
      readonly outcome: "interrupted"
      readonly rank: number
      readonly site: StructRef //       `visit` threw (GEN-8c catches it WITHOUT a cause) — the site is not done
    }
  | {
      readonly outcome: "unvisited"
      readonly rank: number
      readonly site: StructRef
      /** WHY no call was spent: the GEN-2 hard ceiling was already reached (the cold tail born-from-work
       *  inherits), or the run stopped at an earlier interrupted site and never got here. */
      readonly cause: "ceiling" | "after-interrupt"
    }

/**
 * The RUN LEDGER (GEN-8 + GEN-12g): one `SiteOutcome` per PLANNED site, so a run's coverage of its own
 * frontier can be reconciled from what the run produced instead of inferred from a count.
 *
 * A COUNT IS NOT A LEDGER. "N abstained" does not let anyone establish that no site was dropped; only a row
 * per site does, and only rows let a dropped site be told from an abstaining one. `sites − facts` is not a
 * residual either — one site may yield more than one fact — which is why `facts` rides on the row.
 *
 * ADDITIVE + ABSENT-TOLERANT, the `builtAt`/`sameAs`/`derivedAt` precedent: `GenesisReport.coverage` is
 * OPTIONAL and a report that predates the ledger simply has none. An ABSENT ledger means "this run recorded
 * no coverage" — it never means "this run covered nothing".
 */
export interface RunCoverage {
  /** Where the row set came from. `'planned'` — `plan` returned a frontier and every row below accounts for
   *  one of its sites. `'unavailable'` — planning itself failed (GEN-8b/8c), so the run never HAD a frontier:
   *  this ledger claims no coverage, and in particular does not claim the repository was empty. */
  readonly frontier: "planned" | "unavailable"
  /** Sites the run was handed by `plan`. Compared against `sites.length`, this is the check itself: a gap
   *  means the controller drove a frontier it did not account for. */
  readonly planned: number
  /** One row per planned site — the ledger. Ordered by the GEN-2/11 rank the run drove them in. */
  readonly sites: readonly SiteOutcome[]
}

/**
 * The total run report (GEN-8). Transcribed EXACTLY from atlas-genesis:195 —
 *   `GenesisReport = { seeded, ratified, open, llmCalls, budgetSpent, resumeToken? }`.
 * `atlas-genesis` is TOTAL: a malformed rev returns a partial report + `resumeToken`, never a throw.
 *   - `seeded`      — the grounded facts auto-admitted by S2 (each grounded, GEN-4).
 *   - `ratified`    — the human-ratified facts from the S3 interview (KNOW-8).
 *   - `open`        — the deferred/unanswered ratification questions (capped at 20/session, GEN-5).
 *   - `llmCalls`    — total LLM calls (GEN-2 budget-bounded; a function of the frontier, GEN-3).
 *   - `budgetSpent` — sites spent against the `--budget` ceiling.
 *   - `resumeToken` — present ONLY on a partial/interrupted run (GEN-8).
 *
 * [FLAG — `cost`, surface-vs-acceptance tension] the §Surface literal (:195) lists 6 fields with NO
 * `cost`, yet GEN-13 + acceptance-13 require the `GenesisReport` "report per-stage cost under the ceiling".
 * Transcribed as an OPTIONAL `cost?: CostReport` to honor GEN-13 without contradicting the frozen literal.
 * Flagged for the two references to reconcile whether per-stage cost is a first-class report field.
 */
export interface GenesisReport {
  readonly seeded: readonly Fact[]
  readonly ratified: readonly Ratified[]
  readonly open: readonly OpenQ[]
  readonly llmCalls: number
  readonly budgetSpent: number
  /** MODEL CALLS ACTUALLY MADE — including the ones whose results were DISCARDED (task #158).
   *
   *  It is a SECOND counter rather than a correction to `llmCalls`, because the two answer different
   *  questions and only one of them is about money. `llmCalls` counts sites whose result was USED — it is
   *  incremented per folded site, so a site that faulted, or one whose batch-mate faulted first, does not
   *  appear in it. That is right for a coverage claim and WRONG for a cost claim: those calls were issued
   *  and, against a real provider, billed. Under a bounded pool up to `POOL_WIDTH - 1` calls can be issued
   *  and discarded when a lower-ranked batch-mate faults, and a sequential run already discarded the
   *  faulting call itself.
   *
   *  `modelCalls - llmCalls` is therefore the DISCARDED count, and it is the number an operator is owed:
   *  cost is the axis this product is measured on, so a spend figure that quietly excluded calls we paid
   *  for would make the one number we are trying to win a false claim.
   *
   *  OPTIONAL in the TYPE only because `GenesisReport` literals are constructed in frozen test fixtures
   *  this change may not edit. Every path in the run controller SETS IT, ALWAYS, INCLUDING ZERO — a field
   *  that appeared only when non-zero would read as "this never happens". */
  readonly modelCalls?: number
  /** [#210] WHICH model produced this run's answers — "which CLI + version", NOT a cost basis
   *  (`captureModelIdentity`, mine-proposer.ts; ADR-0011). Wired ⇒ the captured identity string (cmd+args
   *  plus a best-effort `--version` probe); unwired ⇒ the sentinel `'unwired:no-model-configured'` (the SAME
   *  literal `NO_MODEL_IDENTITY` names at the cli layer — genesis does not import it, since the cli sits
   *  ABOVE genesis in the ARCH layering and importing upward would invert it; the two copies are kept in
   *  sync BY VALUE, checked by a cross-package test, never by a shared runtime import).
   *
   *  OPTIONAL in the TYPE only, for the `modelCalls` frozen-fixture reason above; every path in the run
   *  controller SETS IT, including the unwired sentinel — a field that appeared only when a real model ran
   *  would make "which model" unreadable on exactly the runs an operator most needs to ask that about. */
  readonly modelIdentity?: string
  /** [#209] THE WITNESS, part 1: a count of the admitted facts that carry an answer-provenance receipt
   *  (`answerRef`, #195 leg b — the CAS id of the model's answer bytes as actually STORED; a content-address,
   *  so `answerRef` itself already IS the digest of that stored content — no separate per-fact digest field
   *  exists or is needed, #195's later revision). A fact minted before #195, or authored outside the mine
   *  door (e.g. `atlas emit`), carries no `answerRef` and is not counted — fail-closed, an absent receipt is
   *  never fabricated into a phantom one.
   *
   *  SCOPED CLAIM, PRECISELY: next to `modelCalls` (issued), this makes the CARDINALITY gap between "issued"
   *  and "stored" visible in the artifact, and every counted `answerRef` is independently dereferenceable to
   *  real stored bytes (per-answer traceability). It does NOT, by itself, prove no dropped answer was masked
   *  by a stale-but-valid `answerRef` substituted at the same rank — nothing on the ISSUED side is
   *  fingerprinted at emission time, so a full issued-vs-stored equivalence proof is a FURTHER step this
   *  field does not claim. */
  readonly answersStored?: number
  /** [#209] THE WITNESS, part 2: a stable digest (the kernel's default BLAKE3 encoder, KERNEL-2) over the
   *  SORTED `answerRef`s counted by `answersStored`. Two runs whose STORED answer SETS differ produce a
   *  DIFFERENT digest even when every other report field (including `modelCalls`) agrees — the property the
   *  2026-08-04 byte-identical-report defect needed and did not have: that run's answers were 87.5%
   *  destroyed and its report was indistinguishable from a clean one. Sorted, not admission-order, so two
   *  runs that stored the SAME set in a different order witness IDENTICALLY, and two that stored a
   *  DIFFERENT set never do. Present iff `answersStored` is (same optionality reason); the digest over the
   *  EMPTY set (no admitted fact carries a receipt) is still a real, present value — "no receipts" is a fact
   *  this field records honestly, never an excuse to omit it. */
  readonly answersDigest?: string
  readonly cost?: CostReport // [FLAG] GEN-13/A-13 require per-stage cost; §Surface literal omits it
  readonly resumeToken?: ResumeToken // present only on a partial/interrupted run (GEN-8)
  /** The per-site run ledger (GEN-8/12g). OPTIONAL for the same reason `cost` is: the §Surface literal
   *  (:195) lists six fields and none of them is a site ledger, while GEN-12g requires abstention to be a
   *  valid RECORDED outcome — which, dropped, it was not. Absent ⇒ this run recorded no coverage (an
   *  artifact from before the ledger); it never means the run covered nothing. */
  readonly coverage?: RunCoverage
}

// ── GEN-13 / GEN-14 cost-discipline surface — EXTRACTED to `budget-types.ts` at the 400-LOC godfile
// ceiling (this WP, #210/#209 — see that file's header). `LoopConfig` / `DeepeningLoops` / `MarginalValueStop`
// / `GenesisBudget` / `Mechanism` / `EscalationDecision` / `BudgetApi` all now live there and are RE-EXPORTED
// below so the package surface (`import type { GenesisBudget } from '@atlas/genesis'`) is byte-identical.
export type {
  LoopConfig,
  DeepeningLoops,
  MarginalValueStop,
  GenesisBudget,
  Mechanism,
  EscalationDecision,
  BudgetApi,
} from "./budget-types.js"

// ── S2 extract surface, co-located here (was ref/extract.ts) ──────────────────────────────────────────
// Consumed by extract.ts + loops.ts (≥2), so housed here beside the shared model. S2 is the ONLY LLM entry
// (GEN-2): highest-PPR-first, one bounded call/site, hard budget + marginal-value stop; the LLM only
// PROPOSES (GEN-12), admission is MECHANICAL, abstention is a valid grounded `WhyNot`.

/**
 * The S2 output. Transcribed EXACTLY from atlas-genesis:188 —
 *   `extract(...): { facts: Fact[], abstained: WhyNot[] }`.
 * `facts` = the grounded candidates that cleared the 2-door bar (GEN-4); `abstained` = the grounded
 * why-nots where no grounded fact was found (GEN-12). Abstention is first-class — a site
 * that yields no fact yields a `WhyNot`, never a forced fact.
 */
export interface ExtractResult {
  readonly facts: readonly Fact[]
  readonly abstained: readonly WhyNot[]
}

export interface ExtractApi {
  /** S2 propose→verify (GEN-2, the ONLY LLM entry). Consumes the RANKED `Candidate[]`, spends ≤1 bounded
   *  call per site highest-PPR-first under `budget`, and HALTS at the budget ceiling or the marginal-value
   *  stop. NEVER calls an un-ranked site (GEN-2). GEN-12: the model only proposes; admission is mechanical
   *  (grounding re-derives; obviousness is scored, never a door — ADR-0012; a predicate additionally passes the teeth gate).
   *  Returns grounded facts + grounded abstentions.
   *
   *  [FLAG — `budget` carrier] the surface `extract(cands, budget)` (atlas-genesis:188) leaves `budget`
   *  untyped; transcribed as the `GenesisBudget` policy — it carries the hard site ceiling
   *  (`min(frontier_size, 200)`, GEN-2) plus the GEN-13/14 escalation + deepening dials. A bare numeric
   *  `--budget N` maps to `GenesisBudget.ceiling`. */
  extract(cands: readonly Candidate[], budget: GenesisBudget): ExtractResult
}

// ── S0 scan surface, co-located here (was ref/scan.ts) ────────────────────────────────────────────────
// Consumed by rank.ts + seed.ts + run-controller.ts (≥2), so housed here beside the shared model. S0 is a
// DETERMINISTIC `$0`-LLM pure function of (repo, rev): AST + def/ref tags (tree-sitter), cross-file
// resolution (SCIP / stack-graphs), BLAKE3 content-address. Byte-identical re-runs; ships ZERO facts.

/**
 * The S0 output — the addressable substrate, nothing more (GEN-1). GENESIS-HOME (`Skeleton` is frozen
 * nowhere below). "3 axes + content-address every node (= atlas-init)" (atlas-genesis:24, :186).
 *   - `axes`     — the ≥3 content-addressed axis hierarchies (spatial / territory / dependency), reused
 *     verbatim from the @atlas/index `Axes` (each object stored once in the CAS, INDEX-10).
 *   - `manifest` — the territories manifest, every territory at `T2/advisory` with ZERO invariants; T0
 *     only flagged, never promoted (KNOW-6/7). Reused from the @atlas/index `Manifest`.
 *
 * [PINNED — oracle-pin-map §genesis, settled by upstream @atlas/index] atlas-genesis frames S0 as
 * "= atlas-init" (the TOOLS-5 move-in). `Skeleton` = `axes` + `manifest`, both IMPORTED from the now-frozen
 * @atlas/index: the built axis-views (`Axes`) + the T2 territory overlay (`Manifest`). The INDEX-13
 * unresolved-edge ledger (`Axes.edges`) and per-node CAS ids ride inside `Axes`. NOT invented beyond this.
 */
export interface Skeleton {
  readonly axes: Axes // the ≥3 content-addressed axis hierarchies (INDEX-10)
  readonly manifest: Manifest // territories at T2/advisory, ZERO invariants, T0 flagged (KNOW-6/7)
}

export interface ScanApi {
  /** S0 structural skeleton (GEN-1). DETERMINISTIC `$0`-LLM pure function of (repo, rev): tree-sitter +
   *  SCIP / stack-graphs + BLAKE3 content-address. Re-running on the same rev ⇒ byte-identical skeleton;
   *  no LLM handle reachable. Ships zero facts (territories at T2, T0 flagged only).
   *
   *  [FLAG — arg types] the surface `scan(repo, rev)` (atlas-genesis:186) leaves both untyped. `repo`
   *  transcribed as `string` (a repo path/handle); `rev` transcribed as `string` (a free-form git rev —
   *  deliberately NOT `Hash`, since GEN-8 requires a MALFORMED rev yield a partial skeleton, never a
   *  throw — a malformable input is a raw string, not a branded digest). Flagged for the WP. */
  scan(repo: string, rev: string): Skeleton
}
