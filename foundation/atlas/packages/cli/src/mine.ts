// @atlas/cli — src/mine.ts  (CLI-4: drive the genesis bootstrap from the CLI)
//
// Drive the FROZEN genesis run-controller (@atlas/genesis) over a repo as ONE governed pass and project the
// outcome to a `CliVerdict` (CLI-4). This facet ONLY COMPOSES the frozen parts: it re-orders NO stage
// (`scan→rank→extract→admit→…`), invents NO admission of its own (the gate forwards the frozen `admit`
// verbatim, GEN-4/12), and every write is CANDIDATE-ONLY — the controller hard-codes `ratified: []`, so
// never-ratified is a STRUCTURAL property of the seam, not a stamp this driver applies.
//
// The five `ControllerDeps` ports (plan/visit/upsert/changed/handoffTo) are assembled INLINE from the real
// adapters (`createSkeletonSource`/`createSiteProposer`/`createHistorySource`/`createDiskStore`) + the genesis stage-builders
// (`createScan`/`createMine`/`runExtract`/`admit`). Each seam is INJECTABLE (`Partial<MineDeps>`) so a
// conformance test supplies a recorded proposer + an injected frontier + a gate double and never touches a
// live model (mirrors packages/e2e/test/s02-genesis-mining.e2e.test.ts). `upsert` routes through the KNOW-15
// write-decision (`@atlas/knowledge` `upsert`/`routeWrite`), NEVER a bare `store.put`.
//
// DESTINATION (ADR-0008): every write this driver makes lands in the STAGING sidecar. `mine` is the explorer
// and KNOW-8 lets the explorer write only CANDIDATES; it holds no truth gate, no authz and no ratifier, so it
// must not — and now structurally CANNOT — write the knowledge projection. WHERE A CANDIDATE GOES NEXT is
// `atlas promote` (WP-PROMOTE), the governed curator door: it reads this sidecar back and presents each row to
// the `atlas-emit` door with the KNOW-18 fast path disabled, so the ratifier really runs. That door is the
// reason the sentence below about severance is now only HALF the story — severance is what protects the
// explorer, ratification is what protects the curator — and it is why every trap this file records about a
// mined nodeKey colliding with a governed node is live again at promotion time, against the REAL projection. NONE of `loadProjection`,
// `persistProjection` or `commitProjection` is CALLED here (they are named only in prose), and that absence
// IS the guarantee: the fixtures make all THREE throw, so a re-introduced call fails the suite loudly.
// CONCURRENCY: the write door is `commitStaging`, whose `decide` re-runs the WHOLE pass body on contention.
// It is also the ONLY staging door there is — the unconditional `persistStaging` this file used to call was
// last-writer-wins by definition, and was deleted in task #83 once a probe showed nothing called it.

import { makeRunController, createScan, createMine, runExtract, makeSeed } from "@atlas/genesis"
import type {
  ControllerDeps,
  Plan,
  FrontierOptions,
  GenesisBudget,
  GenesisReport,
  Candidate,
  ExtractResult,
  Fact,
  SiteProposer,
  EmitGate,
  HistorySource,
  SkeletonSource,
  Skeleton,
  Ratified,
  SeedDeps,
} from "@atlas/genesis"
import { existsSync, readFileSync } from "node:fs"
import { asSubtreeHash, id } from "@atlas/kernel"
import type { Awareness } from "@atlas/memory"
import { createDiskStore, headSha, createSkeletonSource, gitSidecarTrust } from "@atlas/adapter-io"
import { resolveProposer, resolveMineBudget, NO_MODEL_IDENTITY } from "./mine-proposer.js"
import type { MineSlot } from "./mine-proposer.js"
import { resolveFrontier } from "./mine-frontier.js"
import { createProposerPool, makeVisitAll, proposerPoolAvailable } from "./mine-pool.js"
import type { ProposerPool, SiteVisit } from "./mine-pool.js"
import { composedGate } from "./mine-gate.js"
import { decideStaging } from "./mine-decide.js"
import type { MintedFact } from "./mine-decide.js"
import type { CommitRefusal, DiskStore } from "@atlas/adapter-io"
import { join } from "node:path"
import { StagingCommitError as StagingRefusalError } from "./mine-staging.js"
import { foldVerdict } from "./mine-render.js"
import type { MinePass } from "./mine-render.js"
import type { CliVerdict } from "./render.js"

/** The projection + prose of a finished pass (mine-render.ts) — RE-EXPORTED so the module surface is
 *  unchanged by the file split. */
export { mineOutcome, mineWhyEmpty } from "./mine-render.js"
export type { MineOutcome, MinePass } from "./mine-render.js"

/** [SOUND-DEFAULT-MINE] The DRIVER-LEVEL multi-arm loop (mine-arms.ts) — RE-EXPORTED so `runMineArms` and its
 *  per-arm collector reach the CLI and the suites off the same module surface as the single-pass drivers. */
export { driveMineArms, runMineArms, foldArms } from "./mine-arms.js"
export type { ArmPass, PassRunner } from "./mine-arms.js"

/**
 * The injected seams the `mine` driver assembles into `ControllerDeps`. Every member is INJECTABLE
 * (`runMine(repo, deps?)` takes a `Partial`); an omitted member falls back to a real adapter (proposer /
 * history / store / skeleton / GATE) or an honest fail-closed default (handoff) so `runMine(repo)` alone is
 * a valid, total call — never a live model, never a fabricated fact.
 *
 * `gate` MOVED SIDES in that sentence (REQ-CLI-4d). It used to fall back to an abstaining stub, and because
 * nothing in production injected one, `atlas mine` staged ZERO candidates on every repository it was ever
 * run against. The fallback is now the composition root's real gate over the frozen `admit` seams — see
 * `mine-gate.ts` for the measurement and for why the driver still invents no admission.
 */
export interface MineDeps {
  readonly rev: string //                the git rev the pass runs at
  readonly proposer: SiteProposer //     S2 — the ONE bounded LLM entry (GEN-2); default abstains (no model wired)
  readonly history: HistorySource //     S1 — mined ranking signals + frontier (GEN-6)
  readonly skeleton: SkeletonSource //   S0 — the structural skeleton source (GEN-1); default = the REAL walk
  readonly store: DiskStore //           the durable CAS + the STAGING sidecar candidates persist to (ADR-0008)
  readonly gate: EmitGate //             the 2-door admission gate — forwards the frozen `admit` verbatim
  readonly handoffTo: () => void //      S4 — the born-from-work terminator (a no-op for a mine pass)
  readonly budget?: GenesisBudget //     the hard site ceiling; omitted ⇒ the controller's defaultBudget
  readonly scope?: string //             a subtree to seed instead of the whole repo (GEN-13)
  /** #182 — how wide the structural frontier is cut, and where its ordering priors come from. Omitted ⇒
   *  resolved from `ATLAS_FRONTIER` + this pass's own skeleton source (see `withDefaults`). Injectable so
   *  a test can pin either arm without touching the environment. */
  readonly frontier?: FrontierOptions
  /** The environment the OPERATOR config is located in (`$ATLAS_MODEL_CONFIG` / `$XDG_CONFIG_HOME`),
   *  defaulted to `process.env`. Threaded so a test is HERMETIC: without it `runMine(repo)` reads the
   *  developer's own `~/.config/atlas/model.json` and would execute their model binary in a unit test. */
  readonly env?: NodeJS.ProcessEnv
  /** [SOUND-DEFAULT-MINE] The mining ARM this single pass runs, threaded to `resolveProposer` as its
   *  explicit-slot override so the multi-arm driver (`runMineArms`) can drive a specific arm WITHOUT mutating
   *  `process.env`. Omitted ⇒ byte-identical to today (`resolveMineSlot(env)` picks the arm). Ignored when a
   *  `proposer` is injected — an injected proposer bypasses `resolveProposer` entirely (see `withDefaults`). */
  readonly slot?: MineSlot
  /** [GEN-9] The post-pass Awareness seed assembly — a PRODUCTION caller of `genesis/seed.ts`'s `makeSeed`
   *  (`assembleAwareness` below). Injectable so a suite can pin/break the wire (§MUTATION); omitted ⇒ the
   *  real assembly over this repo's ratified/definite set (`assembleAwareness`). */
  readonly seedAwareness?: (ratified: readonly Ratified[], skeleton: Skeleton) => Awareness
  /** [#210] Override the model identity `resolveProposer` would have derived — the seam an injected-proposer
   *  TEST uses to assert a specific identity lands on the report, since an injected `proposer` bypasses
   *  `resolveProposer` entirely (see `withDefaults`) and so carries no identity of its own. Production never
   *  supplies this: the CLI path always leaves it unset and inherits `resolveProposer`'s own capture. */
  readonly modelIdentity?: string
}

/** The two pass-level events the frozen `GenesisReport` has no field for: a wiring FAULT that the
 *  controller's GEN-8c catch would otherwise swallow anonymously, and the count of structural seeds
 *  dropped for having no path. Observers only — the driver reads no value back from either. */
export interface PassWatch {
  readonly onFault?: (e: Error) => void
  readonly onSeedsDropped?: (dropped: number) => void
}

/** All deepening loops OFF — a mine pass is the single-pass baseline (GEN-13/14, Δ=0). */
const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const

/** A one-site extract budget: the controller already enforces the run ceiling; `visit` extracts its one cand. */
const SINGLE_SITE: GenesisBudget = { ceiling: 1, deepening: { review: OFF, enrich: OFF, expand: OFF } }

/**
 * The S0 default is the REAL structural source (`createSkeletonSource`, adapter-io) — the frozen walk +
 * optional SCIP dump + `@atlas/index` build + the `atlas-init` T2 territory move-in, composed.
 *
 * It used to be a hand-built `emptySkeleton()` whose `axes.edges` was `[]`. Because `structuralSeeds`
 * (genesis/rank.ts:321) ranks by dep-graph DEGREE and reads ONLY `axes.edges`, an empty skeleton yielded 0
 * seeds ⇒ `rank` 0 candidates ⇒ the controller visited 0 sites and made 0 model calls. That made the
 * ABSENT SKELETON — not the absent model — the operative cause of a 0-candidate run: wiring a real proposer
 * on top of it would still have produced 0. GEN-8b is unaffected: the real source is itself fail-closed, so
 * an unwalkable/non-git repo or a malformed rev still degrades to an honestly-empty (never fabricated)
 * skeleton rather than throwing.
 */
function defaultSkeleton(repoPath: string): SkeletonSource {
  return createSkeletonSource(repoPath)
}

/**
 * [COLD-GRAMMAR FOOTGUN, #243 — EXPLAINED, not gated here] `createSkeletonSource`'s AST refinement
 * (`foldAstUnits`, adapter-io) is a SILENT no-op until `initAst()` resolves (module-level grammar
 * singletons still null) — a deliberate, documented degrade so importing the barrel never forces a WASM
 * load. Cold, the spatial tree carries file-level nodes only; warm, it also carries item/block children.
 * `subtreeHash` is a hash of the SUBTREE, so a `file` node's own hash differs between the two states.
 *
 * A caller that stages citations cold and only LATER reads them back through a WARM re-derivation (the
 * shape `atlas promote` takes — every promote path goes through `bin.ts`, which awaits `initAst()` before
 * composing anything) gets a mismatch on every citation: `ungrounded: citation does not re-derive FRESH at
 * source (TOOLS-7b/GROUND-6)`, with nothing on the mine side saying why. A previous seat burned a full
 * diagnostic round on exactly this (#237 lineage).
 *
 * NOT gated with a throw here, on purpose, after measuring the blast radius: a mechanical `!astWarmed()`
 * guard in `withDefaults` cannot distinguish that caller from the many HERMETIC callers in this suite that
 * drive the real skeleton cold and never intend to re-derive against a warm one (they stage and read back
 * within the SAME cold pass, or assert on ranking/coverage/gate-wiring, never on cross-process promotion) —
 * a guard here made six real, correct test files fail closed for a risk they do not carry. `mine.ts` cannot
 * see the caller's future intent (whether the citations it mints will ever meet a warm re-derivation), so
 * this is not cheaply detectable AT THIS SEAM. `astWarmed()` is exported publicly (adapter-io) so any
 * caller who DOES intend to promote what it stages can assert it themselves before driving `mine`; the
 * actual guarantee against this footgun in PRODUCTION is structural, not a runtime check: `bin.ts` awaits
 * `initAst()` before EVERY command (mine and promote both), so the two can never disagree on the shipped
 * binary — pinned by `test/mine-cold-grammar.test.ts`, which asserts that ordering in `bin.ts`'s own source.
 */

/** The admission seam resolution (mine-gate.ts) — RE-EXPORTED so the module surface is unchanged by the
 *  file split. `makeAdmitGate` now HAS a production caller: `composedGate`, the REQ-CLI-4d supply this
 *  driver falls back to below. */
export { makeAdmitGate, unwiredGate, UNWIRED_GATE_REASON } from "./mine-gate.js"

/** The staging refusal vocabulary, its thrown discriminant, and what a staged ROW DECLARES about itself
 *  (`MINED_SCOPE`/`MINED_TIER`) — all extracted to `mine-staging.ts` at the LOC ceiling, along the same
 *  seam. RE-EXPORTED here because `StagingCommitError` and `MINED_SCOPE` are part of this module's
 *  published surface. */
export { StagingCommitError, STAGING_REFUSAL_TEXT, MINED_SCOPE, MINED_TIER } from "./mine-staging.js"

/** The honest fail-closed default history: no signals, empty frontier ⇒ the structural fallback ranks 0
 *  sites (GEN-15b). A real pass INJECTS `createHistorySource(repo, rev)`; the default never shells git.
 *  (Inlined rather than `createHistorySource(...)` — see the NOTE on the stale consumed adapter-io dist.) */
function defaultHistory(): HistorySource {
  return {
    commitCount: () => 0,
    shallow: () => false,
    blameConcentration: () => 0,
    frontier: () => [],
    signals: () => ({ hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }),
  }
}

/**
 * GEN-9 — the post-pass Awareness seed, wired to run in PRODUCTION (WP-8.29.GEN: "a ref-model becomes
 * SHIPPED when a production caller invokes its code"). Assembled from the run's OWN ratified/definite set
 * (`report.ratified`) via `seed.ts` `makeSeed(...).seed(...)` — the RATIFIED set, never a staged candidate
 * and never a synthesized line. A source-less facet (here: `constitution` on a candidate-only run, whose
 * `ratified` is structurally `[]`) renders the labeled `UN-SEEDED` sentinel — never fabricated (GEN-9c).
 *
 * The two injected index seams (`locateConventions` / `rootAnchor`) are BUILT over this repo, mirroring the
 * awareness-store's own real-file reads (`CONVENTIONS.md@sha`, repo-root sha). They ignore the `Skeleton`
 * (seed.ts treats it opaquely, consuming it ONLY through these deps), so the mine path — which never re-
 * holds a concrete `Skeleton` after the controller drives its own plan — passes a placeholder. It is not an
 * invented source: both deps derive from real bytes on disk.
 *
 * [ADR-0008] This assembles from `report.ratified` + the filesystem ONLY. It NEVER reads the knowledge
 * projection — `mine` structurally cannot (the projection doors are trapped), so seeding cannot become a
 * back-door into governed knowledge.
 */
function assembleAwareness(repoPath: string, ratified: readonly Ratified[]): Awareness {
  let sha = ""
  try {
    sha = headSha(repoPath) ?? ""
  } catch {
    sha = ""
  }
  const deps: SeedDeps = {
    locateConventions: () => {
      const path = join(repoPath, "CONVENTIONS.md")
      if (!existsSync(path)) return undefined // absent ⇒ the `taste` facet renders UN-SEEDED (GEN-9c)
      const text = readFileSync(path, "utf8")
      return {
        path: "CONVENTIONS.md",
        anchor: { kind: "file", qualifiedPath: "CONVENTIONS.md", subtreeHash: asSubtreeHash(id(text)) },
      }
    },
    rootAnchor: () => ({ kind: "repo", qualifiedPath: "@root", subtreeHash: asSubtreeHash(sha) }),
  }
  return makeSeed(deps).seed({} as unknown as Skeleton, ratified)
}

/** The filled seams PLUS the two facts about the S2 resolution that the seams themselves cannot answer —
 *  see `ResolvedProposer` (mine-proposer.ts) for why `modelWired` cannot be recovered from `deps`. */
interface ResolvedDeps {
  readonly deps: MineDeps
  readonly modelWired: boolean
  readonly promptDigest?: string
  /** [#210] ALWAYS present — `NO_MODEL_IDENTITY` when no model is wired, never absent-that-reads-as-unasked.
   *  Read off `deps.modelIdentity` (an injected-proposer test's override), else `resolveProposer`'s own
   *  capture, else the sentinel. */
  readonly modelIdentity: string
}

/** Fill the injectable seams: a real adapter for the store, honest fail-closed seams for the rest. */
function withDefaults(repoPath: string, deps?: Partial<MineDeps>): ResolvedDeps {
  const rev = deps?.rev ?? "HEAD"
  // Resolved ONCE, and only when the caller injected no proposer — resolution reads the operator's config
  // off disk, and an injected proposer means that file is none of this pass's business.
  const resolved =
    deps?.proposer === undefined ? resolveProposer(repoPath, deps?.env ?? process.env, deps?.slot) : undefined
  // HOISTED out of the literal below: the REQ-CLI-4d gate is built over THE SAME `SkeletonSource` this pass
  // ranks its sites from, so the gate and the frontier can never resolve two different indexes.
  const skeleton = deps?.skeleton ?? defaultSkeleton(repoPath)
  // #182 — the frontier arm, resolved ONCE from the threaded env and this pass's own skeleton source, so
  // the seam that enumerates units and the seam that orders them are the same object (one fold, one truth).
  // [PROVABLE-FRONTIER] The resolved sound arm's provability predicate is MERGED IN on top: an INJECTED
  // `deps.frontier` still wins for its OWN fields (subFile/prior), but the provability precondition — which
  // only `resolveProposer` can build (it holds the SCIP reader) — is added so `createMine` reorders the
  // ranked frontier provable-first. Absent for the advisory arm (`resolved.provableFirst` undefined) ⇒ no
  // reorder, byte-identical. `runMineArms` re-resolves per slot, so EACH arm gets ITS OWN slot's predicate.
  const frontier: FrontierOptions = {
    ...(deps?.frontier ?? resolveFrontier(deps?.env ?? process.env, skeleton)),
    ...(resolved?.provableFirst !== undefined ? { provableFirst: resolved.provableFirst } : {}),
  }
  // [MINE-BUDGET-CAP] An INJECTED budget always wins (a test pins its own ceiling); only when none is injected
  // does the CLI path read `ATLAS_MINE_BUDGET`. Unset ⇒ `undefined`, so the controller's `defaultBudget`
  // applies and the run is byte-identical to today (the cap is opt-in). This rides `deps.budget` on through
  // `runMineArms` too, so EACH arm the multi-arm loop drives is capped at the same N.
  const budget = deps?.budget ?? resolveMineBudget(deps?.env ?? process.env)
  const d: MineDeps = {
    frontier,
    rev,
    proposer: deps?.proposer ?? resolved!.proposer,
    history: deps?.history ?? defaultHistory(),
    skeleton,
    // PROVENANCE (the third seam this store takes, alongside the N11 watermark). `mine` built its store
    // WITHOUT it, so a repo whose `.atlas/` arrived by COMMIT was staged into as though a door had produced
    // it — and `STAGING_REFUSAL_TEXT.untrusted`, which was already written, could never fire. Staging is not
    // a serving path, so nothing was being SERVED; what was missing is the seam, and the next reader who
    // wires staging into a door would have inherited the hole rather than found it. `gitSidecarTrust` is the
    // same memoized `git ls-files` the composition root injects — one question per pass, not per write.
    store:
      deps?.store ??
      createDiskStore(join(repoPath, ".atlas", "cas"), () => headSha(repoPath), gitSidecarTrust(repoPath)),
    // REQ-CLI-4d — THE ADMISSION SUPPLY. The fallback is no longer an abstaining stub: it is the
    // composition root's gate over the frozen `admit` seams (`composedGate` → `buildMineAdmission`,
    // adapter-io/src/compose.ts), built LAZILY over this pass's own skeleton axes. The driver still invents
    // no admission (REQ-CLI-4c) — it wires a gate it does not author, exactly as it wires the store above.
    gate: deps?.gate ?? composedGate(skeleton, repoPath, rev),
    handoffTo: deps?.handoffTo ?? ((): void => {}),
    ...(budget !== undefined ? { budget } : {}),
    ...(deps?.scope !== undefined ? { scope: deps.scope } : {}),
    ...(deps?.env !== undefined ? { env: deps.env } : {}),
    ...(deps?.seedAwareness !== undefined ? { seedAwareness: deps.seedAwareness } : {}),
  }
  // WIRED is read off the RESOLUTION, never off `deps`: the resolved proposer is installed on the RIGHT of a
  // `??` above, so `deps?.proposer !== undefined` is ALWAYS FALSE on the CLI path — which is how a run with
  // `llmCalls 2` printed "no proposer model is wired" four lines away from its own cost.
  const modelWired = deps?.proposer !== undefined || (resolved?.wired ?? false)
  // [#210] identity: an injected override wins (a test asserting a specific stamp over an injected proposer),
  // else `resolveProposer`'s own capture (the CLI path, `resolved` undefined only when a proposer WAS
  // injected), else the honest sentinel — NEVER left undefined, which is what let the port go dormant.
  const modelIdentity = deps?.modelIdentity ?? resolved?.modelIdentity ?? NO_MODEL_IDENTITY
  return {
    deps: d,
    modelWired,
    modelIdentity,
    ...(resolved?.promptDigest !== undefined ? { promptDigest: resolved.promptDigest } : {}),
  }
}

/**
 * Assemble the five frozen `ControllerDeps` ports from the injected seams (inline glue — `Plan`/`EmitGate`
 * have no genesis-side factory; this composition IS the driver):
 *   - `plan`      — S0 `createScan` (the canonical skeleton) + S1 `createMine` (rank the frontier), in order.
 *   - `visit`     — per-site `runExtract([cand], …, { proposer, gate })` → the gate's admitted `.facts`.
 *   - `upsert`    — the KNOW-15 write-decision, dedup-by-id, committed durably to STAGING (ADR-0008).
 *   - `changed`   — the INDEX-12 delta seam (unused by a single `genesis()` pass; supplied for the surface).
 *   - `handoffTo` — the S4 terminator (a no-op for a mine pass); `onRefusal` — see `MinePass`.
 */
export function buildControllerDeps(
  repoPath: string,
  d: MineDeps,
  onRefusal?: (r: CommitRefusal) => void,
  watch?: PassWatch,
  pool?: ProposerPool,
  modelIdentity?: string,
): ControllerDeps {
  // THE ONE PER-SITE EXPRESSION — both `visit` and `visitAll` route through it, so neither can produce
  // different facts for a site: there is exactly one place facts come from (see `SiteVisit`, mine-pool.ts).
  const visitWith: SiteVisit = (cand, proposer) => runExtract([cand], SINGLE_SITE, { proposer, gate: d.gate })
  const mine = createMine({
    skeleton: d.skeleton,
    history: d.history,
    ...(watch?.onSeedsDropped !== undefined ? { onSeedsDropped: watch.onSeedsDropped } : {}),
    ...(d.frontier !== undefined ? { frontier: d.frontier } : {}), // #182 — the A/B arm + its priors
  })
  const scan = createScan(d.skeleton)
  // STAGING, NOT KNOWLEDGE (ADR-0008 / KNOW-8). `mine` is the explorer — no truth gate, no KNOW-11 authz, no
  // KNOW-8 ratification — so it writes only CANDIDATES, through the STAGING sidecar: the same shape at a different
  // path. This driver never CALLS a projection door, which is what closes #87 — mining cannot mutate governed
  // knowledge because it cannot REACH it, not because a check says no. Reproduced at a REAL minted-key collision
  // (a mined nodeKey EQUAL to a ratified T0 node's): `projection.json` comes back byte-identical.
  const grounded = new Map<string, Fact>() // KNOW-15 idempotent grounded set, keyed by the MINTED nodeKey (0 duplicates)
  // [#209] the answer-provenance receipts of every row this pass has SETTLED with one — cumulative across
  // commits the SAME way `grounded` is (a `Set`, not a per-call list), so a contended retry that re-mints the
  // same key never double-counts and a `resume`/`rerun` leg folds in on top of what an earlier leg witnessed.
  // Read by `answerReceipts` below; fail-closed — a row that minted with NO `answerRef` (MintedFact carries
  // none) contributes nothing.
  const answerRefs = new Set<string>()

  // THE WHOLE PASS BODY AS ONE PURE DECISION is `decideStaging` (mine-decide.ts) — extracted at the LOC ceiling
  // when #195 added the scrub→CAS answer-receipt to the write. `grounded` is threaded in (the caller keeps it
  // across settled commits); the decision stays a pure function of `(staged, incoming, grounded)`.
  return {
    plan: (repo, rev, _scope): Plan => ({
      malformed: false,
      skeleton: scan.scan(repo, rev),
      sites: mine.mine(repo, rev),
    }),
    // A `ModelCommandError` is REPORTED on its way past, then re-thrown unchanged so GEN-8c still classifies
    // the site as an interruption. It is the one throw here that is NOT about this site: the model binary is
    // missing / timed out / exited non-zero for the whole run, and `describeModelFailure` (llm.ts:152) has
    // already put the command and its stderr in the message. Swallowed, it reached the user as an anonymous
    // partial — `exit 1 · llmCalls 0 · resume at rank -1`, with nothing to act on.
    // The WHOLE `ExtractResult` is returned, not `.facts`. Picking the facts off here is what made the run's
    // coverage unfalsifiable: each site's grounded `WhyNot` died in this expression, one layer above the
    // controller, so a site that ABSTAINED and a site that was silently DROPPED reached the report
    // identically — and `mineWhyEmpty` printed "every one abstained" from `facts === 0` alone, a word the run
    // had no grounds for. `ControllerDeps.visit` accepts either arm; handing back the wide one is the only
    // change needed for the per-site ledger to carry real abstentions instead of `unrecorded`.
    visit: (cand): ExtractResult => {
      try {
        return visitWith(cand, d.proposer)
      } catch (e) {
        if ((e as { name?: unknown } | null)?.name === "ModelCommandError") watch?.onFault?.(e as Error)
        throw e
      }
    },
    // CONCURRENCY, ONLY WHEN A POOL WAS SUPPLIED (task #158): `visitAll` runs the batch's model calls in
    // parallel, then admits each site here in rank order through the SAME `visitWith` the arm above uses.
    ...(pool !== undefined ? { visitAll: makeVisitAll(pool, visitWith, watch?.onFault) } : {}),
    upsert: (incoming): readonly Fact[] => {
      // THE CANDIDATE SIDECAR, NEVER THE KNOWLEDGE PROJECTION. An unconditional persist carries no decision
      // to re-run and so cannot be made concurrency-safe, which is why this door is the only one left.
      const r = d.store.commitStaging<Map<string, MintedFact>>((staged) => decideStaging(staged, incoming, grounded))
      if (!r.settled) {
        // VISIBLE. Nothing was written, so returning the grounded set unchanged would report a successful
        // pass over a write that did not happen — the silent loss this seam removes.
        onRefusal?.(r.refusal)
        throw new StagingRefusalError(r.refusal)
      }
      // fold in only what actually settled — and [#209] its answerRef alongside it, when the row minted one.
      for (const [key, f] of r.out) {
        grounded.set(key, f)
        if (f.answerRef !== undefined) answerRefs.add(f.answerRef)
      }
      return [...grounded.values()]
    },
    changed: (_prior, _rev) => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
    handoffTo: () => d.handoffTo(),
    // [#210] threaded, never re-derived — see `withDefaults`/`resolveProposer` for where the string is built.
    ...(modelIdentity !== undefined ? { modelIdentity } : {}),
    // [#209] the FINAL accumulated set at report-assembly time (`answerRefs` is a closure over the whole
    // pass, so a call after several `upsert`s — or after a `resume`/`rerun` leg — reads everything settled so
    // far, never just the last batch).
    answerReceipts: () => [...answerRefs],
  }
}

/**
 * Drive the frozen run-controller one governed pass, capturing what the report cannot carry.
 *
 * [ADR-0011] A CAPTURED `ModelCommandError` IS RE-THROWN. `createCommandClient` throws it precisely so a
 * broken configuration cannot present itself as "this repo has no facts" — but it is thrown from inside
 * `visit`, and GEN-8c makes that a bare `catch` in the controller, so a missing model binary reached the
 * user as `exit 1, llmCalls 0, "resume at rank -1"` and nothing else: no command name, no stderr. Re-throwing
 * puts it on the SAME governed-refusal path as `ModelConfigError` (cli.ts:110-116) — exit 2, message
 * verbatim — while a genuinely partial run (a budget, a contended commit) keeps its report and exit 1.
 */
export function driveMinePass(repoPath: string, deps?: Partial<MineDeps>): MinePass {
  const resolved = withDefaults(repoPath, deps)
  const d = resolved.deps
  let refusal: CommitRefusal | undefined
  let fault: Error | undefined
  let seedsDropped = 0
  const watch: PassWatch = {
    onFault: (e) => void (fault ??= e),
    onSeedsDropped: (n) => void (seedsDropped += n),
  }
  // POOL ONLY WHEN THE PROPOSER CAME FROM OPERATOR CONFIG (task #158) — a fact about the seam, not a policy:
  // a worker rebuilds its proposer via `resolveProposer(repoPath, env)`, pure in those two args, whereas an
  // INJECTED proposer is a closure and cannot cross a thread. Third conjunct: the pool is a COMPILED
  // artifact (a worker loads a file), so outside `dist/` there is nothing to start.
  const usePool = resolved.modelWired && deps?.proposer === undefined && proposerPoolAvailable()
  const pool = usePool ? createProposerPool(repoPath, d.env ?? process.env) : undefined
  try {
    const ports = buildControllerDeps(repoPath, d, (r) => void (refusal = r), watch, pool, resolved.modelIdentity)
    const report = makeRunController(ports).genesis(repoPath, d.rev, d.budget, d.scope)
    if (fault !== undefined) throw fault // a misconfigured model is not a mining outcome
    // GEN-9 — seed the Awareness sources AFTER the genesis run, from the run's OWN ratified/definite set.
    // On a candidate-only mine pass that set is structurally `[]`, so `constitution` renders UN-SEEDED
    // (never fabricated) while `taste` (CONVENTIONS.md@sha) and the unratified `mission` stub are seeded.
    const seed = (d.seedAwareness ?? ((ratified) => assembleAwareness(repoPath, ratified)))(
      report.ratified,
      {} as unknown as Skeleton,
    )
    return {
      report,
      seed,
      modelWired: resolved.modelWired,
      seedsDropped,
      ...(refusal !== undefined ? { refusal } : {}),
      ...(resolved.promptDigest !== undefined ? { promptDigest: resolved.promptDigest } : {}),
    }
  } finally {
    // `finally`, not a trailing call: `driveMinePass` THROWS on a captured `ModelCommandError`, and a pool
    // left running there holds eight live threads and the CLI never exits.
    pool?.close()
  }
}

/** The `GenesisReport` alone (the write-set carrier) — the shape every existing caller and oracle uses. */
export function driveMine(repoPath: string, deps?: Partial<MineDeps>): GenesisReport {
  return driveMinePass(repoPath, deps).report
}
/** Run the one-time genesis bootstrap over a repo, projecting the outcome to a `CliVerdict` (CLI-4). A pass
 *  that seeds nothing renders WHY, read off its own report — `foldVerdict`/`mineWhyEmpty` (mine-render.ts).
 *
 *  It THROWS exactly one class of error: a `ModelCommandError` the pass captured (see `driveMinePass`). A
 *  misconfigured model is not a mining outcome, and `cli.ts` renders it as the governed refusal it is. */
export async function runMine(repoPath: string, deps?: Partial<MineDeps>): Promise<CliVerdict> {
  const pass = driveMinePass(repoPath, deps)
  return foldVerdict(pass, deps?.budget?.ceiling)
}
