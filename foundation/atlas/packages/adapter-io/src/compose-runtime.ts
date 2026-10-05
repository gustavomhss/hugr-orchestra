// @atlas/adapter-io — src/compose-runtime.ts  (COMPOSE-A — the `ComposedRuntime` shape, extracted)
//
// MECHANICAL, byte/behaviour-preserving extraction of the `ComposedRuntime` interface out of `compose.ts`
// at the godfile-guard HARD ceiling (600 LOC) — the same shape WP-10.A1.CLI used for `cli.ts`. This module
// declares NOTHING new: every field, every doc comment, is transcribed verbatim from `compose.ts`. The
// composition root (`compose.ts`) imports the type back and RE-EXPORTS it under the same name, so every
// existing import site (`adapter-io/src/index.ts`'s `export type { ComposedRuntime, … } from './compose.js'`,
// and every downstream `import type { ComposedRuntime } from '@atlas/adapter-io'`) is untouched — this file
// is reachable ONLY through `compose.ts`'s re-export, never imported directly by another module.

import type { Hash } from "@atlas/contracts"
import type { AnchorsApi, CheckApi, DoctorSource, DraftApi, SlotsApi } from "@atlas/tools"
import type { WiredHandler } from "./wire.js"
import type { PromoteOut } from "./governed-promote.js"
import type { OwnLeg } from "./own-source.js"
import type { RelationLeg } from "./relation-source.js"
import type { NegationLeg } from "./negation-source.js"
import type { TransitionLeg, TransitionProducer } from "./transition-source.js"
import type { TestVacuityLeg, TestVacuityProducer } from "./compose-test-vacuity.js"
import type { VerifyFactLeg } from "./verify-fact-source.js"
import type { ReverifyReport } from "./reverify-store.js"
import type { DeriveRelationsRun } from "./relation-derive-run.js"
import type { Awareness, MemoryRecord, Orientation, TurnHeader } from "@atlas/memory"
import type { BudgetLeg, TerritoriesLeg } from "./calibration-ledger.js"

/** The composed runtime: the ONE governed durable `WiredHandler` every entrypoint drives, PLUS the real
 *  read-only `DoctorSource` `atlas doctor` reads over — both built from the SAME store + revIndex so they
 *  can never diverge (WIRE-1). The CLI passes both; the MCP entrypoint drives only the handler. */
export interface ComposedRuntime {
  readonly handler: WiredHandler
  readonly doctorSource: DoctorSource
  /**
   * The governed PROMOTION leg (KNOW-8) — `promote(at)` lifts the explorer's staged candidates into governed
   * knowledge THROUGH the emit door. It rides beside the handler for the same reason `doctorSource` does: it
   * opens no new governed surface (`GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays `{atlas-emit,
   * atlas-link}`) so it is not a `Tool` and has no leg to dispatch to — ADR-0008 pre-decided that a curator
   * door is an ordinary USE of the existing emit door. It is built over the SAME durable store PATH and the
   * SAME seams the handler's emit leg and query readback ride — a `DiskStore` holds no state of its own (all
   * of it is the sidecar + CAS files it names), which is why `driftFacts` above can already read back what
   * the handler wrote — so a promoted fact is visible to the very next `atlas query`.
   */
  readonly promote: (at: Hash) => PromoteOut
  /**
   * The `own_<scope>` READ leg (RETR-12) — `own(scope)` composes the curated, mechanically-ranked briefing
   * for a scope-unit through `@atlas/retrieval`'s `createOwn`, over the feed in `own-source.ts`.
   *
   * IT IS BUILT FROM `store` AND `axes`, THE SAME TWO OBJECTS THE HANDLER'S QUERY LEG READS, and that is the
   * whole reason it is composed here rather than in the CLI: a briefing assembled over a second store would
   * be a different repository's knowledge wearing this repository's scope name. `DiskStore` holds no state of
   * its own (all of it is the sidecar + CAS files it names), so a fact emitted through the handler in the
   * same process is visible to the very next `own` — the feed re-reads the live projection per call.
   *
   * It rides BESIDE the handler for the same reason `doctorSource` and `promote` do: it is not a `Tool`.
   * `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` stays `{atlas-emit, atlas-link}` — this is a READ door,
   * it opens no write path, and there is nothing for `WiredHandler.handle` to route.
   *
   * NO AUTHZ GATE, DELIBERATELY (KNOW-11b): reads are universal in Atlas. The actor is a self-asserted
   * string (see the posture note on {@link composeRuntime}), so gating a read on it would refuse an honest
   * caller and stop a dishonest one for exactly as long as it takes to set one environment variable.
   */
  readonly own: OwnLeg
  /** The read-only `anchors` DISCOVERY planner (WP-10.A1 / ADR-0004, AUTHOR-3/4) — `anchors(path)` lists the
   *  groundable units under `path` (qualifiedPath/kind/current subtreeHash), declares every language hole, and
   *  reports the `rev`. Built over the SAME `axes` the emit truth-gate re-derives against (the one
   *  {@link deriveGroundingAxes} seam, AUTHOR-1), so a fact grounded from a listed anchor is accepted by the
   *  gate by construction. Rides beside the handler like `own`: NOT a `Tool`, opens no write path (AUTHOR-2). */
  readonly anchors: AnchorsApi["anchors"]
  /** The read-only `slots` DISCOVERY planner (WP-10.A2-a / ADR-0004, AUTHOR-5) — `slots()` returns EXACTLY
   *  the closed `PredicateSlot` vocabulary, each with its meaning. Rides beside the handler like `anchors`:
   *  NOT a `Tool`, no injected port (it reads a compile-time union, not the index), opens no write path. */
  readonly slots: SlotsApi["slots"]
  /** The read-only `draft` COMPOSITION planner (WP-10.A2-a / ADR-0004, AUTHOR-6/7) — `draft({anchor, slot,
   *  claim})` composes a candidate `GroundedFact` whose identity is minted by the product's `nodeKey`
   *  formula and whose grounding comes from the SAME `groundingComputer` `anchors` reads (AUTHOR-1), so a
   *  drafted fact re-derives against the gate's own oracle by construction. Rides beside the handler like
   *  `anchors`: NOT a `Tool`, persists nothing (AUTHOR-2). */
  readonly draft: DraftApi["draft"]
  /** The read-only `draftSupersede` RETIRE/SUPERSEDE VARIANT (WP-10.A2-b / ADR-0004, AUTHOR-13) — IDENTICAL
   *  composition to `draft` (SAME grounding seam, SAME identity mint, SAME `IncumbentPort`); the drafted
   *  fact's `authoring` is `'SUPERSEDED'` instead of `'ADVISORY'`. Opens NO new write door — a supersede
   *  reaches the store only through the SAME `atlas-emit` gate chain any other draft does (AUTHOR-13b/d). */
  readonly draftSupersede: DraftApi["draftSupersede"]
  /** The read-only `check` DRY-RUN planner (WP-10.A3 / ADR-0004, AUTHOR-11/12) — `check(candidate, at)` folds
   *  the governed emit door's WHOLE gate chain (`shape → truth → authz → ratify`) over a candidate fact
   *  WITHOUT any write, via the injected `GateChainRunner` port (`@atlas/tools` `check.ts`) implemented over
   *  `runGateChain` (`check-source.ts`, WP-10.A3.ADAPTER). Its verdict agrees with the real door's BY
   *  CONSTRUCTION (PROP-AUTH-11) — same store, same truth-gate, same policy, same actor, same ratify token.
   *  Rides beside the handler like `draft`: NOT a `Tool`, opens no write path (AUTHOR-2). */
  readonly check: CheckApi["check"]
  /**
   * The grounded-relation READ leg (#99a / ADR-0015 D2) — `relations(unit, direction)` returns the
   * `family:'relation'` facts touching a unit, both directions, via the `relationsOf` fold.
   *
   * IT IS BUILT FROM `store`, THE SAME OBJECT THE HANDLER'S QUERY LEG READS, and that is the whole reason it
   * is composed here rather than in a transport: the relations touching a unit are read off the very
   * projection `atlas query` reads back, so the two can never diverge. `DiskStore` holds no state of its own
   * (all of it is the sidecar + CAS files it names), so a relation emitted through the handler in the same
   * process is visible to the very next `atlas relations` — the leg re-reads the live projection per call.
   *
   * It rides BESIDE the handler for the same reason `doctorSource`/`promote`/`own` do: it is not a `Tool`.
   * `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` is untouched — this is a READ door, it opens no write
   * path, and there is nothing for `WiredHandler.handle` to route.
   */
  readonly relations: RelationLeg
  /**
   * The grounded-negation + abstention READ leg (#99b / ADR-0015 D3) — `negations(scope)` returns the
   * `family:'negation'` negatives the truth door admitted AND the honest ABSTENTIONS it filed under a scope,
   * via the `negationsOf`/`abstentionsOf` folds. Built from `store`, the SAME object the handler's query leg
   * reads — passed, not rebuilt — so `atlas negations <scope>` and `atlas query <scope>` are two projections
   * of ONE store. It rides BESIDE the handler for the same reason `relations`/`own` do: it is not a `Tool`,
   * `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` is untouched — a READ door, no write path. This leg is what
   * makes `negationsOf`/`abstentionsOf` running code rather than reference models, and it is the surface that
   * makes a fired abstention observable (closes #202).
   */
  readonly negations: NegationLeg
  /** The grounded-transition READ leg + reachable 2-rev PRODUCER (#234 / ADR-0015 D4) — `transitions(unit)`
   *  reads the lineage's 2-rev records (head TRANSITIONED + predecessors SUPERSEDED, D-T3); `transition(unit,
   *  before, after)` reads REAL content at two revs and persists a JUSTIFIED transition (D-T1) THROUGH the
   *  governed emit door (KNOW-11 authz + ARCH-9 anchor — `governed-emit-transition.ts`). */
  readonly transitions: TransitionLeg
  readonly transition: TransitionProducer
  /** The single-anchor test-vacuity READ leg + reachable PRODUCER (#95 / ADR-0015 D5) — `testVacuities(unit)`
   *  reads the unit's proven test-vacuity facts of ANY shape (single-anchor, no lineage); `testVacuity()` walks
   *  the repo's HEAD test units, runs `scanTestVacuity`, and persists every proven fact THROUGH the governed emit
   *  door (KNOW-11 authz + ARCH-9 anchor + the HEAD truth gate — `governed-emit-test-vacuity.ts`). */
  readonly testVacuities: TestVacuityLeg
  readonly testVacuity: TestVacuityProducer
  /** The sound-genesis PROVEN-family feed (`atlas verify-fact`) — PROVES/REFUTES/ABSTAINS on a typed
   *  dependency/count/negation claim over the live symbol-reverse view (off the SAME `scipOutput` the `axes`
   *  are). A READ door, and the ONE production caller that makes `verify{Dependency,Count,Negation}`
   *  (@atlas/genesis) running code — see `verify-fact-source.ts`. */
  readonly verifyFact: VerifyFactLeg
  /** The REVERIFY-GATE pass (`atlas verify-store`) — re-proves every `seal:'proven'` fact against the LIVE
   *  index into `re-proven`/`broken`/`unverifiable` (see `reverify-store.ts`). Rides the SAME `verifyFact` leg
   *  (no second oracle) + the SAME `driftFacts` readback (no second store read) — a THUNK. A READ door,
   *  GOVERNANCE_SURFACE stays 5. */
  readonly reverify: () => ReverifyReport
  /**
   * The #99 SOUND-RELATION derive-and-persist pass (`atlas derive-relations`, WP-R7) — the mechanical projection
   * of the index's resolved cross-unit references to PROVEN `depends-on` relations, driven end to end and LANDED
   * in the durable store. It is the ONLY reachability seam that makes `relation-derive.ts` running code: it
   * composes `buildMineAdmission` (now carrying the sound `verifyRelation` oracle) + `ground`-over-`Axes` and
   * emits every proven relation through the SAME `origin:'promoted'` governed emit door promote publishes through
   * (`relationEmit` below), so the seal + re-derivable witness reach the durable row + CAS bytes. Rides beside
   * the handler like `promote`: a WRITE leg opening no NEW governed surface (`GOVERNANCE_SURFACE` stays 5 — an
   * ordinary USE of the emit door, ADR-0008). A THUNK (paid only on demand); NO LLM anywhere (AR-23). */
  readonly deriveRelations: () => DeriveRelationsRun
  /**
   * The PROVENANCE refusal for this repo's durable store, or `undefined` when reads may proceed
   * (`read-provenance.ts` / TRAVEL-BY-REPROOF `read-access.ts`). PRESENT means every read serves nothing and
   * every write refuses — TODAY that is `tracked-staging` (ADR-0008 candidates, no replayable witness) or
   * the fail-closed leg of `tracked-provable` (re-verification could not run). ABSENT no longer means
   * "nothing is tracked" — see `readAdvisory` below for the narrowed middle case, where reads DO proceed but
   * only over what re-proves.
   *
   * It is surfaced HERE, on the composed runtime, because the refusal has to be legible on doors that the
   * handler does not own: `atlas doctor` sub-dispatches to `DoctorApi` without touching the handler, and
   * `atlas node` reaches `resolveNode`, which the frozen handler does NOT wrap in a try/catch. One value the
   * entrypoint can render once covers all of them, in the entrypoint's own prose, instead of each door
   * rediscovering the condition — and the leg-level guards stay as the backstop for every other caller.
   */
  readonly readRefusal?: string
  /**
   * The MEM-4b explicit-recall READ leg (`ComposedRuntime.memoryRecall`, WP-11.W8 / CAMPAIGN-11) —
   * `recall(query)` over the durable memory log (`memory-store.ts`), the seat's ONE path to consultable
   * `task`/`pr`/`logbook` memory (an unqualified query answers `[]`; explicit, never free). Rides beside the
   * handler like `own`/`relations`: NOT a `Tool` (the write half, `atlas-memory-emit`, is the
   * `GOVERNANCE_SURFACE` member), opens no write path — a `READ_SURFACE` member (`atlas-memory-recall`).
   */
  readonly memoryRecall: (query: unknown) => readonly MemoryRecord[]
  /**
   * The MEM-1/4/7 running-turn header READ leg (`ComposedRuntime.memoryHeader`, WP-11.W8) — a THUNK that
   * assembles the composed actor's `TurnHeader` fresh each call, over the SAME `awareness`/`orientation`
   * stores `memoryAwareness`/`memoryOrientation` below read (never a second decision). `READ_SURFACE`
   * member `atlas-memory-header`; opens no write path.
   */
  readonly memoryHeader: () => TurnHeader
  /**
   * The MEM-11/12 SHARED Awareness slab READ leg (`ComposedRuntime.memoryAwareness`, WP-11.W8) — a THUNK
   * that assembles the slab fresh from the real Atlas root each call (`awareness-store.ts`), byte-identical
   * across every member reading the same repo state. `READ_SURFACE` member `atlas-memory-awareness`; opens
   * no write path.
   */
  readonly memoryAwareness: () => Awareness
  /**
   * The MEM-6 DERIVED, SHARED Orientation slab READ leg (`ComposedRuntime.memoryOrientation`, WP-11.W8) —
   * a THUNK over the tracked orientation log (`orientation-store.ts`), byte-identical across every member.
   * `READ_SURFACE` member `atlas-memory-orientation`; opens no write path.
   */
  readonly memoryOrientation: () => Orientation
  /**
   * The RETR-8 budget leg (`atlas budget`, WP-3-RETR) — the per-kind hits/hitRate calibration ledger
   * (`ledgerFrom`) over the served-injection record set. The set is the HONEST ZERO today (`own-source.ts`
   * `hits: 0` — no production writer records served injections), so every kind renders at its ratified
   * BASE_CAP floor; the writer is the next work-package. Rides beside the handler like `own`/`relations`:
   * not a `Tool` (`GOVERNANCE_SURFACE` stays 5), opens no write path — a READ door.
   */
  readonly budget: BudgetLeg
  /**
   * The RETR-13 MISS-oracle leg (`atlas territories`, WP-3-RETR) — the per-territory off-atlas rate
   * (`offAtlasFrom`) over the served-turn record set (honest zero: no served-turn log exists) + the
   * registered territories (the admin-declared `authz.scopes` keys). Never throws; rate 0 on no history.
   * The OPEN-DEFINE θ is bound in ONE place (`OFF_ATLAS_THRESHOLD`, calibration-ledger.ts) and the CLI
   * renders a calibration prompt for every territory that crosses it. A READ door; no write path.
   */
  readonly territories: TerritoriesLeg
  /**
   * The ADVISORY MESSAGE for a `tracked-provable` store (TRAVEL-BY-REPROOF) — present ONLY when the durable
   * store is being served NARROWED (filtered to facts that replay `re-proven`), so a user whose committed
   * store serves fewer facts than it holds is told WHY in the product's own voice rather than left to notice
   * a shrunk count. ABSENT for every other case: nothing narrowed (`trusted`), or nothing served at all
   * (`readRefusal` present instead).
   */
  readonly readAdvisory?: string
}
