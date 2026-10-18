// @atlas/cli — src/cli.ts  (CLI-1/2: the `atlas` entrypoint)
//
// The argv → outcome entrypoint: parse the command TOTALLY (never a throw), route it through the ONE wired
// handler (@atlas/adapter-io), render the verdict deterministically, and return a process exit code. The
// handler is assembled LAZILY (only after a successful, non-`mine` parse) so `main([])` — the `bin.ts`
// smoke path — returns a structured error WITHOUT touching the (WIRE-deferred) assembler.
//
// [GODFILE RELIEF] the verdict/process-outcome helpers moved to sibling `cli-verdict.ts` VERBATIM (inert
// extraction) — this file was at the godfile-guard's 600 LOC ceiling before the `slots`/`draft` dispatch.

import type { Hash } from "@atlas/contracts"
import {
  reportIndexPlan,
  relationsVerdict,
  negationsVerdict,
  transitionsVerdict,
  testVacuitiesVerdict,
  verifyFactVerdict,
} from "@atlas/adapter-io"
import type {
  DeriveRelationsRun,
  IndexPlanReport,
  NegationLeg,
  OwnLeg,
  PromoteOut,
  RelationLeg,
  ReverifyReport,
  TestVacuityLeg,
  TestVacuityProducer,
  TransitionLeg,
  TransitionProducer,
  VerifyFactLeg,
  WiredHandler,
  BudgetReport,
  TerritoriesLeg,
} from "@atlas/adapter-io"
import type { AnchorsApi, CheckApi, DoctorSource, DraftApi, SlotsApi, Tool } from "@atlas/tools"
import type { Awareness, MemoryRecord, Orientation, TurnHeader } from "@atlas/memory"
import { anchorsVerdict } from "./anchors.js"
import { slotsVerdict } from "./slots.js"
import { draftVerdict } from "./draft.js"
import { checkVerdict } from "@atlas/adapter-io"
import { runDoctor } from "./doctor.js"
import { ensureAtlasIgnored } from "./gitignore.js"
import { renderHelp } from "./help.js"
import { COMMAND_LEG } from "./map.js"
import { marshalArgs } from "./marshal.js"
import { runOwn } from "./own.js"
import { runTransitionCli } from "./transition.js"
import { runTestVacuityCli } from "./test-vacuity.js"
import { parse } from "./parse.js"
import { renderRefusal, renderVerdict } from "./render.js"
import type { CliVerdict } from "./render.js"
import { emit, emitCli, errorVerdict, refusalVerdict, withNote } from "./cli-verdict.js"
import {
  dispatchMine,
  dispatchVerifyStore,
  dispatchMemoryRecall,
  dispatchMemoryHeader,
  dispatchMemoryAwareness,
  dispatchMemoryOrientation,
  dispatchBudget,
  dispatchTerritories,
  dispatchExport,
  dispatchImport,
  dispatchPromote,
  dispatchDeriveRelations,
} from "./cli-dispatch.js"

/** Optional dependency injection seam (additive): tests inject a FAKE `WiredHandler` + a FAKE read-only
 *  `DoctorSource`; prod assembles both at the composition-root WP. */
export interface CliDeps {
  readonly handler?: WiredHandler
  readonly doctorSource?: DoctorSource
  /**
   * The PROVENANCE refusal for the composed runtime's durable store, or absent when it is trustworthy
   * (`@atlas/adapter-io` `readProvenanceRefusal`). PRESENT means `.atlas/` is TRACKED BY GIT — it arrived by
   * COMMIT rather than through a governed door — so nothing in it can be shown to have passed a gate.
   *
   * It is rendered HERE, before dispatch, for a reason the leg-level guards cannot cover: `doctor`
   * sub-dispatches to `DoctorApi` without going through the handler at all. One refusal at the entrypoint
   * makes every command legible in the CLI's own prose, and gives the whole invocation ONE outcome class
   * (a governance rejection, exit 2) rather than one per dispatch route.
   *
   * [AMENDED] this used to add "…instead of through the handler's catch-all, which labels every leg throw
   * `malformed args`" — that catch-all is fixed: it now attributes each throw to the caller's arguments, a
   * door's refusal, or a fault inside Atlas (`@atlas/tools` `src/fault.ts`), and `resolveNode` is wrapped
   * too. The entrypoint refusal is kept because it is the only place that covers `doctor`, not because the
   * handler would mislabel it.
   */
  readonly readRefusal?: string
  /**
   * The ADVISORY MESSAGE for a `tracked-provable` durable store (TRAVEL-BY-REPROOF, `ComposedRuntime.
   * readAdvisory`) — present ONLY when the store is being served NARROWED (a committed `projection`/`cas`,
   * filtered to facts that replay `re-proven`), so it is APPENDED as a trailing line on every routed
   * command's normal output, the SAME `withNote` mechanism `init`'s gitignore note uses — never a refusal
   * (the command still runs and its exit code is untouched), just legibility about why a committed store
   * might be serving fewer facts than it holds. ABSENT for every other case (nothing narrowed, or
   * `readRefusal` present instead and the command never reaches here).
   */
  readonly readAdvisory?: string
  /**
   * The composition root's governed PROMOTION leg (`ComposedRuntime.promote`) — KNOW-8's route out of
   * staging. Injected on the SAME seam as `handler` and for the same reason: the CLI must never stand up a
   * second runtime, or the store it promotes INTO stops being the store `atlas query` reads back.
   *
   * It is NOT reached through `handler.handle`, because it is not a `Tool`: `GOVERNANCE_SURFACE` stays 5 and
   * `WRITE_PATHS` stays `{atlas-emit, atlas-link}` — ADR-0008 pre-decided that a curator door is an ordinary
   * USE of the existing emit door, not new surface. `promote` publishes through `createGovernedEmit`, the
   * very leg `atlas-emit` binds; what it does not have is a tool token to dispatch on.
   *
   * ABSENT ⇒ `atlas promote` fails closed with the same "runtime is not composed yet" guidance every other
   * routed command gives, never a silent success over nothing.
   */
  readonly promote?: (at: Hash) => PromoteOut
  /**
   * The `atlas doctor index` provider. DEFAULTED (not deferred): production reads `process.cwd()` through
   * the real `reportIndexPlan`, so the leg is REACHABLE from the shipped bin the day it lands — the seam
   * exists so a test can hand it a fixture report without a repository, not so the wiring can be postponed.
   * It is deliberately NOT part of the composed runtime: the leg touches neither the store nor the handler.
   */
  readonly indexPlan?: () => IndexPlanReport
  /**
   * The composition root's `own_<scope>` READ leg (`ComposedRuntime.own`) — RETR-12's curated briefing.
   * Injected on the SAME seam as `handler` and `promote`, and for the same reason: the CLI must never stand
   * up a second runtime, or the store it briefs from stops being the store `atlas query` reads back.
   *
   * It is NOT reached through `handler.handle`, because it is not a `Tool`: `GOVERNANCE_SURFACE` stays 5,
   * and this door writes nothing at all — it is a read, composed by index reads over the durable projection.
   *
   * ABSENT ⇒ `atlas own` fails closed with the same "runtime is not composed yet" guidance every other
   * routed command gives, never a silent empty briefing over nothing — which is the failure mode that
   * matters most for THIS door, since an empty briefing is also a legitimate answer.
   */
  readonly own?: OwnLeg
  /**
   * The composition root's grounded-relation READ leg (`ComposedRuntime.relations`, #99a) — the `relationsOf`
   * fold over the durable projection. Injected on the SAME seam as `handler`/`promote`/`own`, and for the
   * same reason: the CLI must never stand up a second runtime, or the relations it reads stop being the ones
   * off the store `atlas query` reads back.
   *
   * It is NOT reached through `handler.handle`, because it is not a `Tool`: `GOVERNANCE_SURFACE` stays 5, and
   * this door writes nothing at all — it is a read. ABSENT ⇒ `atlas relations` fails closed with the same
   * "runtime is not composed yet" guidance every other routed command gives, never a silent empty result.
   */
  readonly relations?: RelationLeg
  /**
   * The composition root's grounded-negation + abstention READ leg (`ComposedRuntime.negations`, #99b) — the
   * `negationsOf`/`abstentionsOf` folds over the durable projection. Injected on the SAME seam as
   * `handler`/`relations`, and for the same reason: the CLI must never stand up a second runtime, or the
   * negatives + abstentions it reads stop being the ones off the store `atlas query` reads back.
   *
   * It is NOT reached through `handler.handle`: it is not a `Tool`, opens no governed surface
   * (`GOVERNANCE_SURFACE` stays 5), and writes nothing. ABSENT ⇒ `atlas negations` fails closed with the same
   * "runtime is not composed yet" guidance every other routed command gives, never a silent empty result — the
   * failure mode that matters most here, since a silent empty is exactly the invisible abstention #202 forbids.
   */
  readonly negations?: NegationLeg
  /**
   * The composition root's grounded-transition READ leg (`ComposedRuntime.transitions`, #234) — the
   * `transitionsOf` fold over the durable projection (with derive-on-read lineage supersession, D-T3). Injected
   * on the SAME seam as `relations`/`negations`, and for the same reason: the CLI must never stand up a second
   * runtime, or the transitions it reads stop being the ones off the store `atlas query` reads back. Not a
   * `Tool`, opens no governed surface (`GOVERNANCE_SURFACE` stays 5), writes nothing. ABSENT ⇒ `atlas
   * transitions` fails closed with the same "runtime is not composed yet" guidance.
   */
  readonly transitions?: TransitionLeg
  /**
   * The composition root's reachable 2-rev transition PRODUCER (`ComposedRuntime.transition`, #234) — reads a
   * unit's REAL content at two git revs and admits + persists a JUSTIFIED transition (D-T1). Injected on the
   * SAME seam as `promote`/`deriveRelations` (a producer that WRITES), for the same reason: the CLI must not
   * stand up a second runtime, or the store it persists into stops being the store `atlas transitions` reads.
   * ABSENT ⇒ `atlas transition` fails closed with the same "runtime is not composed yet" guidance.
   */
  readonly transition?: TransitionProducer
  /**
   * The composition root's grounded test-vacuity READ leg (`ComposedRuntime.testVacuities`, #95) — the
   * `testVacuitiesOf` fold over the durable projection. Injected on the SAME seam as `relations`/`transitions`,
   * and for the same reason: the CLI must never stand up a second runtime, or the facts it reads stop being the
   * ones off the store `atlas query` reads back. Not a `Tool`, opens no governed surface (`GOVERNANCE_SURFACE`
   * stays 5), writes nothing. ABSENT ⇒ `atlas test-vacuities` fails closed with the same "runtime is not composed
   * yet" guidance.
   */
  readonly testVacuities?: TestVacuityLeg
  /**
   * The composition root's reachable single-anchor test-vacuity PRODUCER (`ComposedRuntime.testVacuity`, #95) —
   * walks the repo's HEAD test units, runs `scanTestVacuity`, and admits + persists every proven
   * test-vacuity fact of any proven shape (0-false-proven). Injected on the SAME seam as `transition`/`deriveRelations`
   * (a producer that WRITES), for the same reason: the CLI must not stand up a second runtime, or the store it
   * persists into stops being the store `atlas test-vacuities`/`atlas node` reads. ABSENT ⇒ `atlas test-vacuity`
   * fails closed with the same "runtime is not composed yet" guidance.
   */
  readonly testVacuity?: TestVacuityProducer
  /**
   * The composition root's sound-genesis PROVEN-family feed (`ComposedRuntime.verifyFact`) — the
   * `verify{Dependency,Count,Negation}` oracles (@atlas/genesis) over the live symbol-reverse view. Injected on
   * the SAME seam as `relations`/`negations`, and for the same reason: the CLI must never stand up a second
   * runtime, or the index it proves over stops being the one the composed handler reads.
   *
   * It is NOT reached through `handler.handle`: it is not a `Tool`, opens no governed surface
   * (`GOVERNANCE_SURFACE` stays 5), and writes nothing — a program oracle over the code index. ABSENT ⇒
   * `atlas verify-fact` fails closed with the same "runtime is not composed yet" guidance every other routed
   * command gives, never a silent proof over nothing.
   */
  readonly verifyFact?: VerifyFactLeg
  /**
   * The composition root's REVERIFY-GATE thunk (`ComposedRuntime.reverify`) — re-proves every `seal:'proven'`
   * fact's OWN witness against the live index (`re-proven`/`broken`/`unverifiable`). Injected on the SAME
   * seam as `verifyFact`, and for the same reason: the CLI must never stand up a second runtime, or the index
   * it re-proves over stops being the one the composed handler reads.
   *
   * It is NOT reached through `handler.handle`: it is not a `Tool`, opens no governed surface
   * (`GOVERNANCE_SURFACE` stays 5), and writes nothing — a program oracle over the durable store's own
   * witnesses. ABSENT ⇒ `atlas verify-store` fails closed with the same "runtime is not composed yet"
   * guidance every other routed command gives, never a silent pass over nothing.
   */
  readonly reverify?: () => ReverifyReport
  /**
   * The composition root's #99 SOUND-RELATION derive-and-persist leg (`ComposedRuntime.deriveRelations`, WP-R7)
   * — the mechanical projection of the index's resolved cross-unit references to PROVEN `depends-on` relations,
   * driven end to end and LANDED in the durable store. Injected on the SAME seam as `promote` (the other WRITE
   * leg intercepted before the handler), and for the same reason: the CLI must never stand up a second runtime,
   * or the store it persists into stops being the store `atlas relations`/`atlas query` read back.
   *
   * It is NOT reached through `handler.handle`: it opens no new governed surface (`GOVERNANCE_SURFACE` stays 5)
   * and publishes through the EXISTING emit door (ADR-0008), so there is no `Tool` token to route. ABSENT ⇒
   * `atlas derive-relations` fails closed with the same "runtime is not composed yet" guidance every other
   * routed command gives, never a silent projection over nothing.
   */
  readonly deriveRelations?: () => DeriveRelationsRun
  /** The composition root's read-only `anchors` DISCOVERY planner (`ComposedRuntime.anchors`, WP-10.A1 / ADR-0004)
   *  — `createAnchors` over the ONE `GroundingComputer` (AUTHOR-1), the SAME grounding seam the emit truth-gate
   *  re-derives against. Injected like `relations`/`transitions`: not a `Tool` (GOVERNANCE_SURFACE stays 5),
   *  persists NOTHING (AUTHOR-2). ABSENT ⇒ `atlas anchors` fails closed, never a silent empty listing. */
  readonly anchors?: AnchorsApi["anchors"]
  /** The composition root's read-only `slots` DISCOVERY planner (`ComposedRuntime.slots`, WP-10.A2-a / AUTHOR-5)
   *  — the closed `PredicateSlot` vocabulary, each with its meaning. Injected like `anchors`: not a `Tool`
   *  (GOVERNANCE_SURFACE stays 5), persists NOTHING. ABSENT ⇒ `atlas slots` fails closed. */
  readonly slots?: SlotsApi["slots"]
  /** The composition root's read-only `draft` COMPOSITION planner (`ComposedRuntime.draft`, WP-10.A2-a /
   *  AUTHOR-6/7) — `draft({anchor, slot, claim})` composes a candidate `GroundedFact` off the SAME
   *  `groundingComputer` `anchors` reads (AUTHOR-1). Injected on the SAME seam; not a `Tool`, persists NOTHING.
   *  `atlas draft` also reads `deps.slots` to validate the slot argument against ONE vocabulary. ABSENT ⇒
   *  `atlas draft` fails closed. */
  readonly draft?: DraftApi["draft"]

  /** The composition root's read-only `check` DRY-RUN planner (ComposedRuntime.check, WP-10.A3 / AUTHOR-11/12)
   *  — `check(candidate, at)` folds the governed emit door's WHOLE gate chain over a candidate GroundedFact at
   *  a rev WITHOUT any write. `atlas check` composes the candidate with `deps.draft` (SAME three-field
   *  discipline, SAME slot vocabulary via `deps.slots`) then dry-runs it. ABSENT ⇒ `atlas check` fails closed. */
  readonly check?: CheckApi["check"]

  /** The composition root's MEM-4b explicit-recall READ leg (`ComposedRuntime.memoryRecall`, WP-11.W8).
   *  Injected on the SAME seam as `relations`/`anchors`: not a `Tool` (the write half `atlas-memory-emit`
   *  is the `GOVERNANCE_SURFACE` member), opens no write path. ABSENT ⇒ `atlas memory-recall` fails closed. */
  readonly memoryRecall?: (query: unknown) => readonly MemoryRecord[]
  /** The composition root's MEM-1/4/7 running-turn header READ leg (`ComposedRuntime.memoryHeader`,
   *  WP-11.W8). Injected on the SAME seam as `memoryRecall`. ABSENT ⇒ `atlas memory-header` fails closed. */
  readonly memoryHeader?: () => TurnHeader
  /** The composition root's MEM-11/12 SHARED Awareness slab READ leg (`ComposedRuntime.memoryAwareness`,
   *  WP-11.W8). Injected on the SAME seam as `memoryRecall`. ABSENT ⇒ `atlas memory-awareness` fails closed. */
  readonly memoryAwareness?: () => Awareness
  /** The composition root's MEM-6 DERIVED, SHARED Orientation slab READ leg (`ComposedRuntime.
   *  memoryOrientation`, WP-11.W8). Injected on the SAME seam as `memoryRecall`. ABSENT ⇒
   *  `atlas memory-orientation` fails closed. */
  readonly memoryOrientation?: () => Orientation
  /** The composition root's RETR-8 budget READ leg (`ComposedRuntime.budget`, WP-3-RETR). The per-kind
   *  hits/hitRate calibration ledger over the served-injection record set (honest zero today — no
   *  production writer). ABSENT ⇒ `atlas budget` fails closed. */
  readonly budget?: () => BudgetReport
  /** The composition root's RETR-13 MISS-oracle READ leg (`ComposedRuntime.territories`, WP-3-RETR). The
   *  per-territory off-atlas rate over the served-turn record set (honest zero) + the registered
   *  territories. ABSENT ⇒ `atlas territories` fails closed. */
  readonly territories?: TerritoriesLeg
  /**
   * The STORE-INSTANCE `atlas export <outDir>` / `atlas import <bundle> <targetDir>` legs (EPIC-1-b
   * PERSIST-9) — dump the WHOLE durable CAS of cwd to `<outDir>/atlas-okf.json`, and replay an OKF bundle
   * 1:1 INTO A FRESH EMPTY STORE TARGET ONLY (a target already hosting a store is refused, exit 1). Never
   * touch the live `.atlas/` nor write the guarded projection sidecar (ADR-0003 — an import cannot become a
   * back-channel FACT write). DEFAULTED, exactly like `indexPlan`; the seam lets a test inject a fake verdict.
   */
  readonly okfExport?: (outDir: string) => CliVerdict
  readonly okfImport?: (bundlePath: string, targetDir: string) => CliVerdict
}

/**
 * The `atlas` entrypoint: parse argv, route through the one wired handler, return a process exit code.
 * TOTAL — a malformed invocation renders a structured non-zero error, never a throw / `process.exit`.
 */
export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  // ENTRY-CLI-5 — the help door. Intercepted BEFORE `parse()` (not a member of `COMMANDS`/`COMMAND_LEG`:
  // it opens no leg, needs no composed runtime, and is reachable even over an uncomposed/refused store, the
  // one invocation that must never itself require the thing it explains how to reach). `atlas help` /
  // `atlas --help` / `atlas -h` all render the SAME derived text, exit 0. Empty argv is DELIBERATELY left to
  // fall through to `parse()`'s existing `no command` error (CLI-1b totality, unchanged) rather than being
  // widened to mean help — that would be a behavior change to an already-pinned path, not an addition.
  if (argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(renderHelp())
    return 0
  }

  const parsed = parse(argv)
  if (!parsed.ok) {
    return emit(errorVerdict(parsed.error))
  }

  const { command, positionals, flags } = parsed

  // PROVENANCE — refuse the whole invocation over a COMMITTED durable store, with the reason, BEFORE any
  // door is opened. `init` is deliberately EXEMPT and it is the only exemption: it reads the tree
  // structurally, touches no durable state, and it is the command that writes the `.gitignore` rule which
  // stops this happening again — refusing the remedy along with the symptom would leave a user with an
  // Atlas that is off and no supported way to turn it back on.
  //
  // EXIT CODE — 2 (`rejected`), not 1 (`error`), and the difference is the whole contract a script has with
  // this binary. `EXIT` is `ok:0 · error:1 · rejected:2`, where 1 means "your invocation was wrong" and 2
  // means "your invocation was fine and a governance gate declined it". The provenance tripwire is a
  // governance gate: nothing under `.atlas/` can be shown to have passed the truth, authz or ratification
  // gates, so it is refused for the same reason and in the same family as an unauthorized or unratified
  // write — every one of which already exits 2. It exited 1 only because this gate happens to fire in the
  // CLI before the door, and WHERE a control runs is an implementation detail; an exit code classifies the
  // OUTCOME. Nothing pinned it either way (S20 asserts `not.toBe(0)`), so it is pinned now, in both
  // directions: the write doors AND the read doors.
  if (deps.readRefusal !== undefined && command !== "init") {
    return emitCli(renderRefusal(refusalVerdict(deps.readRefusal)))
  }

  if (command === "mine") {
    // CLI-4 / SOUND-DEFAULT-MINE — the whole dispatch body lives in `cli-dispatch.ts` (`dispatchMine`, godfile
    // relief, inert extraction) — see that function's own doc comment for the full rationale (ADR-0011 model
    // errors, #243 wire-mine-history, #140 unaddressable-cas).
    return dispatchMine()
  }

  if (command === "promote") {
    // CLI-7: `atlas promote` drives the composed governed PROMOTION leg ONE pass (ADR-0008 — no new governed
    // surface; the rendered `CliVerdict` reaches the console over the SAME emit/exit path as every command).
    return dispatchPromote(deps.promote)
  }

  if (command === "derive-relations") {
    // #99 WP-R7: `atlas derive-relations` drives the SOUND-RELATION projection ONE pass (ADR-0008 — publishes
    // through the existing emit door; fails closed on an uncomposed runtime exactly as `promote`).
    return dispatchDeriveRelations(deps.deriveRelations)
  }

  if (command === "own") {
    // CLI-8: `atlas own <scope>` composes the RETR-12 curated briefing for one scope-unit through the
    // composition root's `own` leg — `@atlas/retrieval`'s `createOwn` over the SAME durable store + built
    // axes the query readback rides. Like `node` it is intercepted before the handler (it is not a `Tool`:
    // it opens no governed surface, and `GOVERNANCE_SURFACE` stays 5), and like every other command its
    // rendered `CliVerdict` reaches the console over the SAME emit/exit path (uniform bytes).
    //
    // It fails closed on an uncomposed runtime for the same reason the READ commands do: composing a second
    // runtime here would brief from a store that is not the one `atlas query` reads.
    if (!deps.own)
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    return emitCli(runOwn(deps.own, positionals[0] ?? ""))
  }

  if (command === "doctor") {
    // CLI-1a: `doctor` sub-dispatches to the read/advisory `DoctorApi` legs over the INJECTED read-only
    // `DoctorSource` — it NEVER touches `deps.handler` (opens no write door; carries no write authority).
    // Fails closed (no source / unknown subcommand) with guidance + non-zero exit, never a throw.
    // `index` is the one leg outside the `DoctorApi`: it diagnoses the SCIP index of the repository at the
    // cwd (which is the repository the entrypoint composes over) and, like every other leg, it only READS —
    // it prints the indexer command for the operator to run and never spawns one.
    const dv = runDoctor(positionals, deps.doctorSource, deps.indexPlan ?? (() => reportIndexPlan(process.cwd())))
    process.stdout.write(dv.stdout)
    return dv.exitCode
  }

  if (command === "node") {
    // N6/TOOLS-10: `atlas node <addr>` — the READ-ONLY per-node door. It resolves a node by its CONTENT
    // ADDRESS through the ONE wired handler's `resolveNode` over the injected read-only `NodeSource`; it opens
    // NO write door (writes still funnel through `atlas-emit`, TOOLS-1). Rendered through the SAME shared
    // `renderVerdict` path (exit 0 on a hit carrying the `GroundedFact`; a structured `error` + exit 1 on a
    // miss / an uncomposed runtime). Never a throw — the handler's `resolveNode` is total (TOOLS-2).
    if (!deps.handler) {
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    }
    const addr = positionals[0] as Parameters<WiredHandler["resolveNode"]>[0]
    return emit(deps.handler.resolveNode(addr, "cli"))
  }

  if (command === "relations") {
    // CLI-9/#99a: `atlas relations <unit> [out|in|both]` — the READ-ONLY grounded-relation door. It reads the
    // bidirectional fold (`relationsOf`, @atlas/knowledge / ADR-0015 D2) over the composition root's
    // `relations` leg — the SAME durable projection `atlas query` reads back, never a second runtime. Like
    // `node`/`own` it is intercepted before the handler (it is not a `Tool`: it opens no governed surface,
    // GOVERNANCE_SURFACE stays 5, WRITE_PATHS untouched). Rendered through the SHARED `renderVerdict`/`emit`
    // path (exit 0 with the edges on `data`; a structured error + exit 1 on an uncomposed runtime OR an
    // out-of-vocabulary direction). Never a throw — `relationsVerdict` + `relationsOf` are both total.
    if (!deps.relations)
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    return emit(relationsVerdict(deps.relations, positionals[0] ?? "", positionals[1]))
  }

  if (command === "negations") {
    // CLI-10/#99b: `atlas negations <scope> [--abstained]` — the READ-ONLY grounded-negation + abstention door.
    // It reads the `negationsOf`/`abstentionsOf` folds (@atlas/knowledge / ADR-0015 D3) over the composition
    // root's `negations` leg — the SAME durable projection `atlas query` reads back, never a second runtime.
    // Like `relations`/`node`/`own` it is intercepted before the handler (not a `Tool`: opens no governed
    // surface, GOVERNANCE_SURFACE stays 5, WRITE_PATHS untouched). Rendered through the SHARED
    // `renderVerdict`/`emit` path (exit 0 with the negatives + abstentions on `data`; a structured error + exit
    // 1 on an uncomposed runtime). Never a throw — `negationsVerdict` + both folds are total. The `--abstained`
    // flag FOCUSES the render on the honest abstentions; both are always in the data, so the abstention is
    // observable regardless (the #202 close).
    if (!deps.negations)
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    return emit(negationsVerdict(deps.negations, positionals[0] ?? "", flags.abstained === "true"))
  }

  if (command === "transitions") {
    // #234/ADR-0015 D4: `atlas transitions <unit>` — the READ-ONLY grounded-transition door. It reads the
    // `transitionsOf` fold (@atlas/knowledge) over the composition root's `transitions` leg — the SAME durable
    // projection `atlas query` reads back, never a second runtime. Like `relations`/`negations` it is
    // intercepted before the handler (not a `Tool`: opens no governed surface, GOVERNANCE_SURFACE stays 5,
    // WRITE_PATHS untouched). Rendered through the SHARED `renderVerdict`/`emit` path (exit 0 with the
    // transitions on `data`, the current head marked TRANSITIONED and predecessors SUPERSEDED by derive-on-read
    // supersession; a structured error + exit 1 on an uncomposed runtime). Never a throw — total.
    if (!deps.transitions) {
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    }
    return emit(transitionsVerdict(deps.transitions, positionals[0] ?? ""))
  }

  if (command === "transition") {
    // #234/ADR-0015 D4: `atlas transition <unit> <revBefore> <revAfter>` — the reachable 2-rev transition
    // PRODUCER. It drives the composition root's `transition` leg, which reads the unit's REAL content at each
    // rev through the arbitrary-rev index, admits a JUSTIFIED transition (no oracle — D-T1) and PERSISTS it
    // THROUGH the governed emit door (KNOW-11 actor-scope authz + ARCH-9 anchor apply — an unauthorized actor is
    // REFUSED). Like `promote`/`derive-relations` it is a WRITE command intercepted before the handler that
    // publishes through the existing emit door (opens no NEW governed surface). Its rendered `CliVerdict` reaches
    // the console over the SAME emit/exit path. It fails closed on an uncomposed runtime exactly as `promote` does.
    if (!deps.transition) {
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    }
    return emitCli(runTransitionCli(deps.transition, positionals[0] ?? "", positionals[1] ?? "", positionals[2] ?? ""))
  }

  if (command === "test-vacuities") {
    // #95/ADR-0015 D5: `atlas test-vacuities <unit>` — the READ-ONLY grounded test-vacuity door. Reads the
    // `testVacuitiesOf` fold over the composition root's `testVacuities` leg (the SAME projection `atlas query`
    // reads back), intercepted before the handler like `relations`/`transitions` (READ authority; no write path).
    if (!deps.testVacuities) {
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    }
    return emit(testVacuitiesVerdict(deps.testVacuities, positionals[0] ?? ""))
  }

  if (command === "test-vacuity") {
    // #95/ADR-0015 D5: `atlas test-vacuity <path>` — the reachable single-anchor PRODUCER. Drives the composition
    // root's `testVacuity` leg (walk HEAD test units → `scanTestVacuity` → seal proven → PERSIST THROUGH the
    // governed emit door: KNOW-11 authz + ARCH-9 anchor + the HEAD truth gate; a sound test is NEVER proven — the
    // 0-false-proven rail). A WRITE command over the existing emit door, like `transition`; fails closed uncomposed.
    if (!deps.testVacuity) {
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    }
    return emitCli(runTestVacuityCli(deps.testVacuity))
  }

  if (command === "anchors") {
    // WP-10.A1.CLI / ADR-0004: `atlas anchors <path>` — the READ-ONLY DISCOVERY PLANNER over the composition
    // root's frozen `anchors` leg. Intercepted before the handler like `relations`/`test-vacuities` (not a `Tool`;
    // persists NOTHING, AUTHOR-2). Rendered through the SHARED `emit` path — exit 0 carrying the `AnchorsOut` (an
    // empty listing is a legible answer WITH its honest reason); a missing path / uncomposed runtime → exit 1.
    if (!deps.anchors)
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    return emit(anchorsVerdict(deps.anchors, positionals[0] ?? ""))
  }

  if (command === "slots") {
    // WP-10.A2-a.CLI / AUTHOR-5: `atlas slots` — READ-ONLY DISCOVERY PLANNER, intercepted before the handler
    // like `anchors` (not a `Tool`; persists NOTHING). No positional; an uncomposed runtime → exit 1.
    if (!deps.slots)
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    return emit(slotsVerdict(deps.slots))
  }

  if (command === "draft") {
    // WP-10.A2-a.CLI / AUTHOR-6/7: `atlas draft <anchor> <slot> <claim>` — READ-ONLY COMPOSITION PLANNER,
    // intercepted before the handler like `anchors`/`slots` (not a `Tool`; persists NOTHING). The author types
    // EXACTLY three things (AUTHOR-6d); `id`/`grounding`/`rev` are ALWAYS computed, never a flag. `deps.slots`
    // validates the slot argument against ONE closed vocabulary (no second transcribed list).
    if (!deps.draft || !deps.slots) {
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    }
    const verdict = draftVerdict(
      deps.draft,
      deps.slots,
      positionals[0] ?? "",
      positionals[1] ?? "",
      positionals[2] ?? "",
    )
    // WP-10.A2-a.CLI-JSON — `atlas draft ... --json`: the CLI arm of the AUTHOR-8 round trip (`draft | emit`)
    // was closed by product doors ONLY over MCP — the default render here prints a human-text SUBSET of the
    // `DraftOut` envelope (draft id / tier / slot / claim / rev / operation / route), never the whole thing, so
    // there was no way to CAPTURE the envelope `atlas emit <file> --at <rev>` reads (`marshalEmit` already
    // accepts it — recognised structurally by BOTH `.fact` and `.rev`, see marshal.ts). `--json` is a NEW
    // branch, gated on a successful draft ONLY (an `ok:false` verdict has no envelope to print, so it falls
    // through to the SAME human `emit(verdict)` path as today — the failure rendering is untouched). On success
    // it prints the RAW `DraftOut` — `JSON.stringify`'d whole, never hand-picked fields, so `fact`'s full
    // `GroundedFact` (with its grounding) survives the round trip intact — and exits 0, mirroring the human
    // path's own exit code for the same verdict.
    if (flags.json === "true" && verdict.ok) {
      process.stdout.write(`${JSON.stringify(verdict.data)}\n`)
      return 0
    }
    return emit(verdict)
  }

  if (command === "check") {
    // WP-10.A3.CLI / AUTHOR-11/12: `atlas check <anchor> <slot> <claim>` — READ-ONLY DRY-RUN of the governed
    // emit door's WHOLE gate chain over a candidate, WITHOUT any write. Composes the candidate through the SAME
    // `draftVerdict` planner (SAME three-field discipline, SAME closed slot vocabulary via `deps.slots`), then
    // dry-runs the drafted fact at its own drafted rev. Intercepted before the handler like `draft` (not a
    // `Tool`; persists NOTHING, AUTHOR-2). The `wouldEmit` verdict and the first-refusing gate agree with the
    // real door's BY CONSTRUCTION (PROP-AUTH-11, the SAME `runGateChain` fold), never a second gate ladder. A
    // bad slot / empty field fails at the SAME surface as `atlas draft` (the composition refusal is emitted as-is).
    if (!deps.check || !deps.draft || !deps.slots) {
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    }
    const drafted = draftVerdict(
      deps.draft,
      deps.slots,
      positionals[0] ?? "",
      positionals[1] ?? "",
      positionals[2] ?? "",
    )
    // `Verdict.ok` is a plain boolean (not a discriminated union), so narrow `.data` explicitly — a failed
    // compose (bad slot / empty field) OR a defensively-absent envelope both fall through to the SAME rejection.
    if (!drafted.ok || !drafted.data) return emit(drafted)
    return emit(checkVerdict(deps.check, drafted.data.fact, drafted.data.rev))
  }

  if (command === "verify-fact") {
    // The sound-genesis PROVEN-family read door — `atlas verify-fact <kind> <target> --scope <s> [--world <w>]
    // [--min <n>] [--exact]`. It PROVES / REFUTES / ABSTAINS on a typed dependency/count/negation claim over the
    // composition root's `verifyFact` leg — the SAME symbol-reverse view built off the index the wired handler
    // reads, never a second runtime. Like `relations`/`negations`/`node` it is intercepted before the handler
    // (not a `Tool`: opens no governed surface, GOVERNANCE_SURFACE stays 5, WRITE_PATHS untouched). Rendered
    // through the SHARED `verifyFactVerdict`/`emit` path — exit 0 carrying the oracle's verdict on `data`
    // (proven/refuted/abstain are all valid ANSWERS, not errors — the sound gate declining to decide is exit 0,
    // never a crash); a structured error + exit 1 on a malformed invocation OR an uncomposed runtime. Never a
    // throw — `verifyFactVerdict` + all three oracles are total.
    if (!deps.verifyFact) {
      return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
    }
    return emit(
      verifyFactVerdict(deps.verifyFact, positionals[0] ?? "", positionals[1] ?? "", {
        scope: flags.scope,
        world: flags.world,
        min: flags.min,
        exact: flags.exact === "true",
      }),
    )
  }

  if (command === "verify-store") {
    // REVERIFY-GATE — the whole dispatch body (incl. the #244 wrong-dir refusal) lives in `cli-dispatch.ts`
    // (`dispatchVerifyStore`, godfile relief, inert extraction) — see that function's own doc comment.
    return dispatchVerifyStore(deps.reverify)
  }

  // WP-11.W8 / CAMPAIGN-11 — the four memory READ_SURFACE doors. Each is intercepted before the handler
  // like `relations`/`anchors` (not a `Tool`; opens no write path) and its dispatch body lives in
  // `cli-dispatch.ts` (godfile relief, the SAME siting `dispatchMine`/`dispatchVerifyStore` use).
  if (command === "memory-recall") return dispatchMemoryRecall(deps.memoryRecall, flags)
  if (command === "memory-header") return dispatchMemoryHeader(deps.memoryHeader)
  if (command === "memory-awareness") return dispatchMemoryAwareness(deps.memoryAwareness)
  if (command === "memory-orientation") return dispatchMemoryOrientation(deps.memoryOrientation)

  // WP-3-RETR — the RETR-8 budget + RETR-13 MISS-oracle READ doors. Intercepted before the handler (not a
  // `Tool`; opens no write path — the same siting `memory-*`/`relations` use). ABSENT deps fail closed.
  if (command === "budget") return dispatchBudget(deps.budget)
  if (command === "territories") return dispatchTerritories(deps.territories)
  // EPIC-1-b — the two OKF STORE-INSTANCE doors (`atlas export` / `atlas import`): not `Tool`s, headless over
  // `process.cwd()` — export dumps the whole CAS; import replays INTO A FRESH EMPTY target only (ADR-0003).
  if (command === "export") return dispatchExport(deps.okfExport, positionals[0] ?? "")
  if (command === "import") return dispatchImport(deps.okfImport, positionals[0] ?? "", positionals[1] ?? "")

  // The remaining SIX governance commands (init/query/emit/reconcile/link/memory-emit) each route to a
  // `Tool` through the one wired handler.
  const tool = COMMAND_LEG[command] as Tool
  // The handler is INJECTED (dependency-inverted). Building the real one needs a fully-composed
  // `WireConfig` — including the adapter-less `seams` (heuristic/gate/classifier/driftFacts/resolveAnchorAt)
  // that WIRE-1 does NOT construct; assembling those from the core factories + the disk store is the runtime
  // composition-root WP. Until it lands, the production entrypoint fails closed WITH guidance rather than
  // constructing an incomplete config; tests (and the composition root) inject `deps.handler`.
  if (!deps.handler) {
    return emit(errorVerdict("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"))
  }
  // ARG-MARSHALLING: map the parsed positionals/flags to the NAMED arg shape THIS command's leg reads
  // (init→{path}, query→{scope}, emit→{node,at}, reconcile→{mergeBase,options}). Without it every routed
  // command fails closed with `malformed-args` (the door reads its own published schema and reports the
  // argument it wanted by name). TOTAL: a missing --at / unreadable emit fact file → a
  // structured error + guidance + non-zero exit, never a throw (CLI-1b).
  // `init` is the move-in command, and moving in has a DEPLOYMENT dependency the product never discharged:
  // Atlas refuses a durable store that is TRACKED BY GIT, so a repo with no ignore rule is one `git add -A`
  // away from a silently disabled Atlas. The rule is installed HERE, at the entrypoint, and not behind the
  // `atlas-init` leg — `createInit` is a pure planner (ADR-0004 AUTHOR-2) and stays one. No knowledge byte
  // is touched, so `WRITE_PATHS` and the CLI-2 authority matrix are unchanged; see `gitignore.ts`.
  //
  // AFTER the unwired-runtime guard above, deliberately: a command that cannot run must not leave a changed
  // working tree behind. It is against `process.cwd()` — the repository root the entrypoint composes over —
  // not against the `path` argument, which may name a SUBTREE, and a subtree is not where `.gitignore` lives.
  const ignoreNote = command === "init" ? ensureAtlasIgnored(process.cwd()).note : undefined
  const marshalled = marshalArgs(command, positionals, flags)
  if (!marshalled.ok) {
    // AUTHOR-7b/7c: a `--at` naming a DIFFERENT rev than a drafted fact carries is a well-formed invocation a
    // gate declines, not a usage mistake — `marshalArgs` (`emit`'s marshaller) flags it `refusal: true` so it
    // renders exit-2 `renderRefusal`, like the entrypoint's provenance gate — DISTINCT from every other marshal
    // failure (missing `--at`, unreadable file, malformed JSON), which stay exit-1 as before (back-compat).
    return marshalled.refusal
      ? emitCli(renderRefusal(refusalVerdict(marshalled.error)))
      : emit(errorVerdict(marshalled.error))
  }
  const verdict = deps.handler.handle(tool, marshalled.args)
  // The gitignore outcome AND the TRAVEL-BY-REPROOF advisory ride the SAME single process-outcome path as
  // everything else (uniform bytes) — appended lines, never a second write to stdout, and never a changed
  // exit code: neither one makes the command's own outcome wrong, both are legibility ADDED to it.
  return emitCli(withNote(withNote(renderVerdict(verdict), ignoreNote), deps.readAdvisory))
}
