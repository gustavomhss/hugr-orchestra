// @atlas/adapter-io — src/compose.ts  (COMPOSE-A: the runtime composition root + the real seams)
//
// The capstone: `composeRuntime(repoPath)` stands up a FULLY GOVERNED, DURABLE `WiredHandler` over the real
// adapters, the real GROUND truth-gate, the real KNOW-11 authz policy, and the real KNOW-15 write path. It
// supplies the seams the WIRE assembler injects — the ones that have no raw adapter:
//   - `heuristic` — the T0-candidate keyword matcher, driven by the admin policy's declared keyword set.
//   - `gate`      — the REAL GROUND truth-gate (`bindGate({ isGrounded, driftDetect })`) adapted to the
//                   tools `TruthGate` surface: the incoming verdict is a predicate's `.status`, or `HOLDS`
//                   injected for an advisory (no Status field); freshness is re-derived against the index
//                   `Axes` built ONCE at the repo root (the `at` sha is vestigial — the gate re-derives
//                   against the built index, not a passed sha).
//   - reconcile seams — the REAL arbitrary-rev drift seams over `createRevIndex(repoPath)` (COMPOSE-C):
//                   `resolveAnchorAt` re-derives an anchor's `StructRef` at a rev, `reDerives` is the
//                   `driftDetect` oracle at a rev, and `driftFacts` is the durable projection's grounded
//                   facts (read back from CAS — invariant 6). Reconcile now DETECTS real structural drift.
//
// This module OWNS the runtime seam construction; `assembleHandler` (wire.ts) OWNS the leg assembly. Their
// composition is the driver — no per-entrypoint copy (WIRE-1).

import { join } from "node:path"
import type { Hash } from "@atlas/contracts"
import { asHash } from "@atlas/kernel"
import { createSymbolReverse, nodeHashOfPath } from "@atlas/index"
import type { Axes } from "@atlas/index"
import { bindReconcile, currentNodes } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import { bindHits } from "@atlas/knowledge"
import { asNodeKey } from "@atlas/kernel"
import { createAnchors, createSlots, createDraft, createCheck } from "@atlas/tools"
import type { T0Heuristic, TruthGate } from "@atlas/tools"
import { walkFileTree } from "./fs.js"
import { deriveGroundingAxes, buildGroundingComputer, buildGate } from "./grounding-computer.js"
import { buildCheckPort } from "./check-source.js"
import { buildDraftIncumbentPort } from "./draft-incumbent-source.js"
import { readScipOrEmpty, readScipIndexerName } from "./scip.js"
import { loadPolicy } from "./policy.js"
import type { AtlasPolicy } from "./policy.js"
import { createRevIndex } from "./rev-index.js"
import { runGit, headSha } from "./run-git.js"
import { createDoctorSource, isMechanicalAt } from "./doctor-source.js"
import { createGovernedEmit } from "./governed-emit.js"
import { buildTargetEscapes } from "./escape/target-escapes.js"
import { buildDynamicReach } from "./escape/dynamic-reach.js"
import { createGovernedPromote } from "./governed-promote.js"
import { createOwnLeg } from "./own-source.js"
import { budgetLeg, territoriesLeg } from "./calibration-ledger.js"
import { createRelationLeg } from "./relation-source.js"
import { runDeriveRelations } from "./relation-derive-run.js"
import type { DeriveRelationsRun } from "./relation-derive-run.js"
import { createNegationLeg } from "./negation-source.js"
import { createTransitionLeg, createTransitionProducer } from "./transition-source.js"
import { buildTestVacuityFeed, buildTestVacuityLegs } from "./compose-test-vacuity.js"
import { createVerifyFactLeg } from "./verify-fact-source.js"
import { reverifyStore, makeScopeHasDocs, driftPairsOf, danglingOf } from "./reverify-store.js"
import type { DocExists } from "./reverify-store.js"
import { createDiskStore, rehydrateProjection } from "./store.js"
import { gitStoreProvenance } from "./store-provenance.js"
import type { SidecarTrust } from "./store-provenance.js"
import { buildReadAccess, trackedProvableAdvisory } from "./read-access.js"
import { assembleHandler, bindFreshnessOracle, edgeModelVersion } from "./wire.js"
import type { WireConfig, WireSeams } from "./wire.js"
import type { ComposedRuntime } from "./compose-runtime.js"
import { createDurableMemory } from "./memory-store.js"
import { createMemoryEmit } from "./memory-emit.js"
import { createMemoryRead } from "./memory-read.js"
import { createDurableOrientation } from "./orientation-store.js"
import { createAwarenessStore } from "./awareness-store.js"
import { makeScannerAdapter } from "./scanner.js"

// The `mine` ADMISSION SUPPLY (REQ-CLI-4d), split to its own file at the LOC ceiling and RE-EXPORTED here so
// the composition root's SURFACE is unchanged — see that file's header for why the seam is real, and for the
// measurement that made it necessary (0 candidates staged on every repository `atlas mine` was ever run on).
export { buildMineAdmission } from "./compose-mine-admission.js"
export type { MineAdmission, Reground } from "./compose-mine-admission.js"

// `ComposedRuntime` — extracted to `compose-runtime.ts` at the godfile-guard HARD ceiling (mechanical,
// byte/behaviour-preserving: the interface body is transcribed verbatim there). Imported above and
// RE-EXPORTED here under the same name so every existing import site is untouched (`adapter-io/src/
// index.ts`'s `export type { ComposedRuntime, … } from './compose.js'`).
export type { ComposedRuntime } from "./compose-runtime.js"

/** Where `composeRuntime` looks for the optional SCIP dump under a repo (empty axes if absent, per §7). */
const SCIP_REL = join(".atlas", "index.scip")
/** The durable CAS root under a repo (D4). */
const CAS_REL = join(".atlas", "cas")

/** The exhaustive-projection ROW-COUNT CEILING for `atlas derive-relations` (F2/AR-28/AR-30) — a resolved-edge
 *  count above this makes the run FAIL LOUD (an `overBudget` refusal, never a partial set labelled complete).
 *  Sized well above Atlas's own resolved intra-repo edge count (low thousands) with headroom; a DELIBERATE knob. */
const DERIVE_RELATIONS_BUDGET = 50_000

/**
 * The T0-candidate keyword heuristic (TOOLS-5): a territory is a T0 candidate iff its name contains one of
 * the admin-declared keywords. An EMPTY keyword set (the fail-closed default) flags NOTHING — the heuristic
 * proposes nothing on its own until an admin declares the set. Pure + total.
 */
export function buildHeuristic(policy: AtlasPolicy): T0Heuristic {
  return { isCandidate: (t) => policy.t0Heuristic.keywords.some((k) => t.name.includes(k)) }
}

// `buildGate` — the REAL GROUND truth-gate adapted to the tools `TruthGate` surface — now lives with the ONE
// grounding computer it shares an `Axes` with (grounding-computer.ts, AUTHOR-1: gate and `anchors` planner are
// one seam). RE-EXPORTED so the barrel + `../src/compose.js` importers stay byte-unchanged.
export { buildGate }
/**
 * The LOCAL git identity (`git config user.email`) at `repoPath`, or `undefined`. TOTAL — never throws:
 * no git, no configured email, a non-repo/absent path, or ANY execFile failure ⇒ `undefined`; an empty
 * result ⇒ `undefined`. Uses the shared no-shell git seam (`runGit`, #74).
 *
 * SECURITY, STATED PRECISELY BECAUSE THE PREVIOUS WORDING WAS NOT. This is a LOCAL-MACHINE source only: the
 * value is never derived from an emitted fact or a tool-call payload, so a WRITE REQUEST cannot choose who
 * it is attributed to. That is the whole of the property, and the earlier note here — "so it cannot be used
 * to spoof the KNOW-11 write actor" — overstated it into something false. `git config user.email` is a line
 * in a file the caller owns and can rewrite; `ATLAS_ACTOR` overrides it outright. Neither is verified.
 * See {@link composeRuntime} for the posture in full.
 */
export function gitUserEmail(repoPath: string): string | undefined {
  try {
    const email = runGit(repoPath, ["config", "user.email"]).trim()
    return email.length > 0 ? email : undefined
  } catch {
    return undefined
  }
}

/**
 * Stand up the FULLY GOVERNED, DURABLE runtime handler for a repo. Builds the index `Axes` ONCE at the
 * root, resolves the admin policy + the write-actor identity, assembles the real seams, and hands them to
 * the shared WIRE assembler, which wires the governed durable emit leg (truth-door → authz → upsert →
 * durable persist). Returns THE one `WiredHandler`. Also builds the real read-only `DoctorSource`
 * (`atlas doctor`'s port) from the SAME store + revIndex.
 *
 * ACTOR RESOLUTION (KNOW-11): `actor = ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? ''` — the env var wins
 * (a `??` fall-through only on absent, so an explicit empty `ATLAS_ACTOR` stays empty); otherwise the LOCAL
 * git identity; otherwise empty. It is passed EXPLICITLY into the WIRE config (`config.actor`) — no
 * `process.env` mutation, no global state. Fail-closed is preserved: an actor not in a policy scope is
 * denied, and empty policy scopes deny every write.
 *
 * ── THIS IS NOT AUTHENTICATION, AND KNOW-11 MUST NOT BE READ AS THOUGH IT WERE ───────────────────────────
 * There is no authentication anywhere in Atlas. `actor` is a CLAIM. `ATLAS_ACTOR` is set by whoever starts
 * the process; the git-config fallback is a line in a file that same person owns. Nothing verifies either,
 * and nothing in the system COULD — there is no key, no session, no challenge, no third party. Any caller
 * can present as any actor the policy names, by setting one environment variable.
 *
 * So KNOW-11 is an ANTI-ACCIDENT GUARDRAIL, not an adversarial control (`docs/reference/atlas-architecture.md`
 * §3.3 / ARCH-12 — the same posture, stated for the architecture; this note exists because the posture was
 * documented ONLY there while the code here read the other way). It stops the wrong seat from casually
 * writing another team's scope, which is the failure a local developer tool actually suffers. It stops
 * nobody who does not want to be stopped. Every authz gate downstream — the confused-deputy incumbent gate,
 * scope monotonicity, the disclosure ordering between `unauthorized for target` and `unverifiable target` —
 * is correct ABOUT THE ACTOR IT IS GIVEN and inherits this ceiling: they are the structure a real identity
 * would plug into, not a substitute for one.
 *
 * WHAT THE ENV-ONLY SOURCING DOES BUY, precisely, since it was previously written up as "the spoof-guard"
 * and that name claimed too much: the actor is never read from an emitted fact or a tool-call payload, so a
 * write REQUEST cannot choose the identity it is judged as, and a fact that travels between repos carries no
 * authority with it. That is a real and necessary property. It is not resistance to spoofing.
 *
 * IF THE TRANSPORT EVER BECOMES REMOTE OR MULTI-TENANT (ARCH-12 says this in the same words), the env-var
 * actor and the world-readable policy both become live vulnerabilities and this seam MUST be replaced with a
 * real identity before that transport ships. Pinned by `test/actor-is-unauthenticated.test.ts`.
 */
export function composeRuntime(repoPath: string): ComposedRuntime {
  // Resolve the KNOW-11 write actor at the composition root: ATLAS_ACTOR (env) wins; else the LOCAL git
  // identity (`git config user.email`); else empty (fail-closed ⇒ every write denied). Passed EXPLICITLY to
  // the assembler below (no global env write).
  //
  // NOT AUTHENTICATION — see the doc block above. This line reads a self-asserted string; it does not
  // establish who anyone is, and no code downstream of it does either.
  const actor = process.env.ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? ""
  // The KNOW-8 ratify token for a full-ratify (T0/predicate/contested) commit. Env-sourced ONLY
  // (`ATLAS_RATIFY_TOKEN`) — the SAME payload-free channel as the actor; there is NO git/machine fallback (a
  // ratifier signature is deliberate, not a local default). ABSENT ⇒ passed as absent below ⇒ the door fails
  // closed on a full-ratify fact (a T0 fact requires the `billy` token). NEVER sourced from an emitted fact.
  const ratifyToken = process.env.ATLAS_RATIFY_TOKEN

  const policy = loadPolicy(repoPath)
  const scipPath = join(repoPath, SCIP_REL)
  // Fold sub-file AST units BEFORE `build` (F1), the SAME transform `assembleHandler` applies to its index
  // FileTree, so the truth-gate re-derives freshness against an index that carries `::` symbol nodes. A
  // symbol-grounded fact therefore resolves FRESH and its `::` primaryAnchor lets `deriveSubsumes` fire.
  // `foldAstUnits` is a no-op until `initAst()` has been awaited (the entrypoint bins do this once, before
  // composeRuntime); this keeps composeRuntime SYNC for its many direct callers while the production doors
  // (which spawn these bins) get real sub-file granularity.
  const scipOutput = readScipOrEmpty(scipPath)
  // #99 F1 — the indexer identity the collapsed-local gate trusts, read from the raw dump's
  // `metadata.toolInfo.name` (the frozen `ScipOutput` projection drops it). `undefined` on a missing/foreign
  // dump ⇒ the heuristic stays OFF (fail-closed). Threaded into BOTH symbol-reverse feeds built below.
  const indexerName = readScipIndexerName(scipPath)
  // Capture the RAW (unfolded) file tree so the sound-negation `dynamicReach` leg can scan file bytes off the
  // SAME walk `build` folds — no second FS traversal, no divergent view of what the repo contains.
  const rawTree = walkFileTree(repoPath)
  // THE ONE GROUNDING DERIVATION (AUTHOR-1): the emit truth-gate (`buildGate(axes)`) and the `anchors` planner
  // both route through this single seam (`deriveGroundingAxes` — the SOLE fold→build on the grounding path;
  // rev-index.ts's arbitrary-rev oracle routes through it too), so neither can derive a different `subtreeHash`
  // for an anchor. `fileTree` (the folded input) rides back for DEDUP-COMPOSITION (#241, threaded below).
  const { axes, fileTree } = deriveGroundingAxes(rawTree, scipOutput)
  // THE ONE GROUNDING COMPUTER (AUTHOR-1) over the axes just derived — the `anchors` planner's backing seam;
  // `createAnchors` (frozen `@atlas/tools` leg) wraps it with the honest-empty invariant. Same `axes`/`rawTree`
  // the gate rides, same HEAD sha the durable store stamps — provably one seam. A PLANNER (no write path).
  const groundingComputer = buildGroundingComputer({ axes, rawTree, rev: headSha(repoPath) ?? "" })
  const anchorsLeg = createAnchors(groundingComputer)
  // THE `slots` DISCOVERY PLANNER (WP-10.A2-a / ADR-0004, AUTHOR-5) — no injected port: it reads the
  // compile-time `PredicateSlot` union, not the index, so it needs no `groundingComputer`.
  const slotsLeg = createSlots()
  // #96 F2 — the SAME N0 completeness view the emit leg rides (`() => index.symbolReverse()`, wire.ts:217),
  // built ONCE off the SAME `scipOutput` the axes above are built from, so the promote leg (below) reaches
  // `emitNegation` with its deps satisfied instead of fail-closing `scope-empty` for every promoted negation.
  const symbolReverseView = createSymbolReverse(scipOutput, { indexerName })

  // ADR-0016 M2b — the TWO v2 negation closure legs, built ONCE off the same `scipPath`/`repoPath`/`rawTree`
  // the other legs ride. `targetEscapes` = `escape(X)` (raw SCIP ranges ⋈ tree-sitter, canonicalized);
  // `dynamicReach` = the door-local opaque-channel scan of S. Both return `undefined` when they cannot be
  // built SOUNDLY (AST grammars not warmed — `composeRuntime` is sync for many callers, so `initAst()` may not
  // have run — or the dump is unreadable). The door runs the target-relative gate IFF BOTH are wired; if either
  // is absent it falls back to the sound `holeSources() ∩ S` blanket, so we wire NEITHER unless BOTH exist (a
  // half-gate is never run). This mirrors the `foldAstUnits` no-op-until-`initAst` degrade a few lines above.
  const targetEscapes = buildTargetEscapes({ scipPath, repoPath })
  const dynamicReach = buildDynamicReach(rawTree)
  const escapeLegs = targetEscapes !== undefined && dynamicReach !== undefined ? { targetEscapes, dynamicReach } : {}

  // The REAL reconcile drift seams (COMPOSE-C). `revIndex` builds the code index at an arbitrary rev:
  //   - `reDerives`         — a fact re-derives iff its grounding is still FRESH at the topic sha.
  //   - `resolveAnchorAt`   — the anchor's `StructRef` at a rev (the drift-source diffs mergeBase vs topic).
  //   - `driftFacts`        — the current grounded facts from the durable projection. Governed-emit
  //     `store.put`s the WHOLE `GroundedFact` (invariant 6), so `store.get(contentHash)` reads it back.
  const revIndex = createRevIndex(repoPath)
  // N11: the doctor/reconcile store stamps the same freshness watermark (HEAD at persist) as the handler's.
  // PROVENANCE (the root the doors hang from): git is owned HERE, so the tripwire that asks whether the
  // durable store is TRACKED — i.e. arrived by commit rather than through a door — is built here and
  // injected, exactly as the N11 watermark is. One `git ls-files`, memoized for the life of the runtime.
  //
  // TRAVEL-BY-REPROOF (owner-authorized 2026-08-18): the question is now THREE-WAY, not two
  // (`store-provenance.ts` `StoreProvenance`) — `trusted` below stays the BOOLEAN write-gate every existing
  // caller (`store` itself, for writes) rides, byte-identical to before (`true` iff `provenance()` is
  // `'trusted'`); the RICHER answer — what a READ may see for `tracked-staging` vs `tracked-provable` — is
  // `readAccess`, built below once `verifyFactLeg` (its oracle) exists.
  const provenance = gitStoreProvenance(repoPath)
  const trusted: SidecarTrust = () => provenance() === "trusted"
  const store = createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), trusted)
  // THE `draft` + `draftSupersede` COMPOSITION PLANNERS (WP-10.A2-a/b / ADR-0004, AUTHOR-6/7/9/10/13) — over
  // the SAME `groundingComputer` `anchors` rides (AUTHOR-1: one grounding seam), so a drafted fact's
  // `subtreeHash` is exactly the value the emit truth-gate will re-derive against, PLUS the `IncumbentPort`
  // (`@atlas/tools` `draft.ts`) built here over the SAME `store` the durable emit door and the `check`
  // dry-run leg (below) ride — never a second store, never a second occupancy notion.
  const draftLeg = createDraft(groundingComputer, buildDraftIncumbentPort(store))
  // `driftPairs` carries each fact ALONGSIDE its own `CurrentNode` (`reverify` needs `node.primaryAnchor` for
  // the anchor-binding check, #199); `driftFacts` is the same pairing's `.fact` projection — ONE store read.
  const driftPairs = driftPairsOf(store)
  const driftFacts = driftPairs.map((p) => p.fact)
  // THE SOUND-GENESIS PROVEN-FAMILY ORACLE, built ONCE and shared by BOTH `verifyFact` (the CLI's
  // `atlas verify-fact`) and `reverify` (`atlas verify-store`) below — the ONE production oracle, never a
  // duplicate that could drift from it.
  const verifyFactLeg = createVerifyFactLeg(scipOutput, { indexerName })
  // THE ANCHOR-EXISTENCE CHECK (#199 fix-round round 3, tamper binding (d)) — reverifyFact's PROOF that a
  // fact's own anchor names a document the live index actually has, not merely that it stands in the right
  // RELATION to the witness's scope. Built from the SAME `scipOutput.documents` list `createVerifyFactLeg`
  // already iterates for its own `pathByHash` table (`verify-fact-source.ts`) — NO second index build, no
  // new seam, one `Set` over data already in memory.
  const docPaths = new Set(scipOutput.documents.map((d) => d.relativePath))
  const docExists: DocExists = (p) => docPaths.has(p)
  const scopeHasDocs = makeScopeHasDocs(scipOutput.documents) // #240 follow-up — ∃ doc under a negation's scope
  // THE ONE SHARED TEST-VACUITY FEED (#95 D5), built HERE — BEFORE `buildReadAccess` — because its `replay`
  // needs only `rawTree` + `axes` (in hand), NEVER `readAccess.store`. Early build lets the `tracked-provable`
  // serve re-prove proven test-vacuities (#249); reused below so producer + BOTH replay sites scan ONE `testUnitsOf` (#186/N10).
  const tvFeed = buildTestVacuityFeed(rawTree, axes)
  // THE READ-SIDE ANSWER (TRAVEL-BY-REPROOF, `read-access.ts`): what every read leg below is allowed to see.
  // `trusted` ⇒ `store` verbatim, no new cost. `tracked-staging` ⇒ a refusal, unchanged in kind. `tracked-
  // provable` ⇒ a raw re-read filtered to the facts that replay `re-proven` against `verifyFactLeg` — the
  // SAME oracle `atlas verify-fact`/`atlas verify-store` already ride, never a second one built here.
  const readAccess = buildReadAccess({
    provenance,
    casPath: join(repoPath, CAS_REL),
    headSha: () => headSha(repoPath),
    gatedStore: store,
    verifyFactLeg,
    docExists,
    scopeHasDocs,
    // #249 — thread the replay so `tracked-provable` RE-PROVES proven test-vacuities instead of dropping them
    // `unverifiable`. `readAccess.reverified` is now computed WITH it, keeping the `reverify()` `??` consistent.
    replay: tvFeed.replay,
  })

  // WP-D3B-B.USE-OR-SEAL (ARCH-D3b item 2, INV-AUTH-16) — the ONE served-use ledger, bound here (the
  // composition root) and injected into the WIRE server seam. This is what CLOSES the "no production
  // writer" deficit the wp card named: `atlas query`'s serve path (`projection-query-index.cover`)
  // calls `logHit` per advisory node it delivers, so a real query MOVES the counter. The three deps are
  // the honest KNOW-17 seams, none fabricated:
  //   • `servedSet`  — the served/pack SNAPSHOT = the current nodes of the SAME read store the serve
  //     path iterates (`currentNodes(proj)`), never a synthetic list. Decay-relevant only; the serve
  //     path itself never calls `decay` (that stays a future KNOW-17 consumer's — GEN-16).
  //   • `archive`    — KN-12 "archived to CAS, never deleted": re-ASSERT the fact bytes into the CAS
  //     (content-addressed, idempotent — `put` dedups), so a decayed node's bytes outlive the projection
  //     row. NOT a delete, never a no-op that LIES.
  //   • `calibrate`  — the OPEN-DEFINE door-2 `f(hits)` (KNOW-17b). Bound here as the PASS-THROUGH
  //     `observed → observed` — the "no invented regime" default (ADR-0012: usefulness is never an
  //     admission veto). A real calibration policy is a later knob; the seam exists to receive it.
  const hits = bindHits({
    servedSet: () => currentNodes(rehydrateProjection(readAccess.store)).map((n) => asNodeKey(n.nodeKey)),
    archive: (nodeId) => {
      const proj = currentNodes(rehydrateProjection(readAccess.store))
      const node = proj.find((n) => n.nodeKey === nodeId)
      if (node === undefined) return // a node not in the served set has nothing to archive
      const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined
      if (fact === undefined) return // CAS bytes already absent ⇒ nothing to re-assert (never a throw)
      store.put(fact) // KNOW-12: re-assert into CAS — idempotent, never deletes.
    },
    calibrate: (observedHits: number) => observedHits, // OPEN-DEFINE door-2 — pass-through, no veto
  })

  // THE ONE TRUTH-GATE INSTANCE — built once here so `seams.gate` (the durable emit door's gate) and the
  // `check` dry-run below (next) share the IDENTICAL adapted gate over the SAME `axes`, never two instances
  // that could drift apart.
  const truthGate = buildGate(axes)

  // THE `check` DRY-RUN PLANNER (WP-10.A3 / ADR-0004, AUTHOR-11/12) — the `GateChainRunner` port
  // (`@atlas/tools`) implemented over `runGateChain` (WP-10.A3.ADAPTER, `check-source.ts`) with the IDENTICAL
  // dependency bag `promotedEmit`/the operator emit door below are composed over: the SAME `store`, the
  // SAME `truthGate`, the SAME `policy`, the SAME `actor`, the SAME `ratifyToken`. A dry run and a real
  // `atlas emit` for the SAME fact at the SAME rev can only diverge on a store mutation BETWEEN the two
  // calls — never on which gate predicate ran (PROP-AUTH-11).
  const checkPort = buildCheckPort({
    store,
    gate: truthGate,
    policy,
    actor,
    ...(ratifyToken !== undefined ? { ratifyToken } : {}),
  })
  const checkLeg = createCheck(checkPort)

  const seams: WireSeams = {
    heuristic: buildHeuristic(policy),
    gate: truthGate,
    // N10 — the reconcile classifier is CONTENT-ADDRESSED: a drifted fact is MECHANICAL iff its recorded
    // content re-derives SOMEWHERE at the new sha (`resolveBySubtreeAt`), not just at the SAME
    // qualifiedPath. The original predicate was PATH-KEYED, so a genuinely moved-but-alive fact read `false`
    // ⇒ was ALWAYS `semantic`, making `mechanical` structurally unreachable for real drift.
    //
    // IT IS NOW THE SAME BODY DOCTOR RUNS, not a second copy of it, and that is the whole point of the
    // import. This site used to inline its own predicate over `primaryAnchor(fact)` — `entries[0]` alone —
    // while doctor's classifier spanned every drifted citation. Two copies of one question, free to
    // diverge, and they had: a fact whose NON-PRIMARY citation had rotted away resolved its primary anchor
    // at the new sha, classified `mechanical`, and this gate — `exitCode = |semantic| > 0 ? 2 : 0`, the
    // answer a CI job merges on — reported CLEAN over a knowledge base holding a dead citation. MEASURED
    // end to end through this composition root (`test/reconcile-entry-symmetry.test.ts`): `exitCode 0`,
    // `semantic []` before; `exitCode 2`, `semantic ['mixed']` after.
    //
    // BLAST RADIUS, STATED BECAUSE IT IS A MERGE GATE MOVING: a repo whose grounding is multi-entry and
    // whose non-primary citation has rotted will now FAIL `atlas reconcile` (exit 2, re-author) where it
    // used to pass. A single-entry grounding, and a multi-entry one whose drifted citations all re-derive
    // somewhere, are UNCHANGED (exit 0) — pinned in both directions by that test.
    classifier: { reconcile: bindReconcile((fact, newSha) => isMechanicalAt(revIndex, fact, newSha)) },
    driftFacts,
    resolveAnchorAt: revIndex.resolveAnchorAt,
    // N10 secondary — the DETECTION half needs the content-addressed resolver too, so `driftAt` can surface a
    // PURE RENAME (old path deleted at HEAD ⇒ path-keyed `now` undefined ⇒ no pair under the old logic ⇒ the
    // moved fact was silently dropped before the classifier ever saw it). Same frozen revIndex method N9 uses.
    resolveBySubtreeAt: revIndex.resolveBySubtreeAt,
  }

  // WP-11.W8 / CAMPAIGN-11 — the durable MEMORY doors, over their OWN separate log (`.atlas/memory.jsonl`,
  // `.atlas/orientation.jsonl` — NOT the knowledge CAS `store` above). D1: the owner is `actor`, the SAME
  // env/git-resolved identity every other governed write door rides (KNOW-11) — this composition root
  // resolves it once and threads it here; no door downstream reads it from a fact/payload or accepts one
  // as a caller-supplied argument (that would reopen the confused-deputy hole D1/D3 closed).
  const memoryStore = createDurableMemory(repoPath)
  const orientationStore = createDurableOrientation(repoPath)
  const awarenessStore = createAwarenessStore(repoPath)
  // MEM-9b/9c — the real pre-write scanner: binds `gitleaks`/`trufflehog` when one is on PATH, else a
  // named fail-closed refusal (never a silent pass — `scanner.ts`'s own header, A9).
  const memoryScanner = makeScannerAdapter()
  const memoryEmitDoor = createMemoryEmit({ store: memoryStore, actor, scanner: memoryScanner })
  const memoryReadDoor = createMemoryRead({ store: memoryStore, actor })

  const config: WireConfig = {
    repoPath,
    casPath: join(repoPath, CAS_REL),
    scipPath,
    seams,
    actor,
    memoryEmit: memoryEmitDoor,
    // N2: the STRUCTURAL axes the CLOSED three-mode retrieval surface reads (`edges` drive the dependency blast
    // radius). Only the axes are threaded — the fact-dependent read model is rebuilt PER QUERY from the live
    // durable store inside the query leg (retrieval-model.ts), so `--by dependency|trigger` reflects an
    // in-session `atlas-emit` EXACTLY as `--by scope` does (no frozen startup snapshot). `byTrigger` stays a
    // documented dormant mode (no trigger producer exists).
    axes,
    // The provenance tripwire rides the ASSEMBLED store too — that is the one `atlas query`/`atlas emit`
    // actually read and write. Threading it only onto the store built above would guard doctor/reconcile
    // and leave both user-facing doors open.
    trusted,
    // TRAVEL-BY-REPROOF — the read-side answer, THREADED so `wire.ts`'s query/node legs read the SAME
    // (possibly filtered) store `own`/`relations`/`negations`/`doctorSource` below read, never a second
    // independent decision. `readRefusal` ABSENT ⇒ `wire.ts` falls back to `trusted`-gated behaviour
    // (`trusted`/case 1) — see `read-access.ts` for the three-way split this collapses.
    readStore: readAccess.store,
    ...(readAccess.refusal !== undefined ? { readRefusal: readAccess.refusal } : {}),
    // WP-D3B-B.USE-OR-SEAL: the ONE served-use ledger, injected so the query serve path writes it.
    hits,
    // Conditional spread keeps `ratifyToken` ABSENT (not `undefined`) when unset — exactOptionalPropertyTypes.
    ...(ratifyToken !== undefined ? { ratifyToken } : {}),
    // DEDUP-COMPOSITION (#241) — the artifacts THIS FUNCTION already built above, off the SAME `repoPath`/
    // `scipPath`/`rawTree`, threaded so `assembleHandler` (wire.ts) consumes them instead of independently
    // rebuilding every one — the walk, the SCIP decode+projection, the AST fold, the axes `build`, the
    // symbol-reverse view and the two v2 escape legs (measured ~7s of an ~8s single pass, PAID TWICE per
    // command before this). See the `WireConfig` doc block (wire.ts) for the coherence obligation this
    // places on this call site: every field below MUST come from this SAME pass, and it does — none of
    // them is rebuilt or re-derived between here and its own construction above.
    rawTree,
    fileTree,
    scipOutput,
    symbolReverse: symbolReverseView,
    // `indexerName` may be a real `undefined` (no/foreign indexer) — conditional spread keeps it ABSENT
    // rather than `undefined` (exactOptionalPropertyTypes), matching `ratifyToken`'s discipline above.
    ...(indexerName !== undefined ? { indexerName } : {}),
    // `targetEscapes`/`dynamicReach` are threaded INDIVIDUALLY (not `escapeLegs`, the both-or-neither pair
    // `governedEmit`'s negation deps need): `assembleHandler` re-derives its OWN both-or-neither gate from
    // whichever of these it ends up with (config-supplied or, when a caller omits one, rebuilt here) — so
    // threading them individually cannot desync the two doors' half-gate discipline from each other.
    ...(targetEscapes !== undefined ? { targetEscapes } : {}),
    ...(dynamicReach !== undefined ? { dynamicReach } : {}),
  }

  // The real read-only diagnostic port — built over `readAccess.store` (TRAVEL-BY-REPROOF: the durable
  // store `atlas doctor` reads is the SAME possibly-filtered one every other read leg reads, never a second
  // decision) + revIndex the governed emit leg rides. The trust seam passed here now answers "may this leg
  // read at all" (`true` for `trusted`/`tracked-provable`, `false` for `tracked-staging`/fail-closed) —
  // `readAccess.store` itself already carries the FILTER for `tracked-provable`, so the boolean only needs
  // to gate the flat-refusal case, exactly as `doctor-source.ts`'s `refuseUntrustedRead` expects.
  const doctorSource = createDoctorSource(
    readAccess.store,
    revIndex,
    () => readAccess.refusal === undefined,
    join(repoPath, CAS_REL),
  ) // ADR-0022: the CAS root, from the ONE place that already knows it

  // The provenance verdict, resolved ONCE by `buildReadAccess` above and handed to the entrypoint.
  // Conditional spread keeps it ABSENT (not `undefined`) on a healthy repo — `exactOptionalPropertyTypes`,
  // and the same discipline `ratifyToken` uses above. `tracked-provable` success is NOT a refusal (case 2
  // narrows, it does not refuse) — `readAccess.refusal` is only present for `tracked-staging` or the
  // fail-closed leg, which is exactly the population this used to name.
  const readRefusal = readAccess.refusal
  // The ADVISORY MESSAGE (TRAVEL-BY-REPROOF): present ONLY for a successful `tracked-provable` serve —
  // legible, in the product's own voice, about WHY a committed store might be serving fewer facts than it
  // holds. `undefined` for `trusted` (nothing to explain) and for a refusal (the refusal text already says
  // why nothing is served).
  const readAdvisory = readAccess.reverified !== undefined ? trackedProvableAdvisory(readAccess.reverified) : undefined

  // THE `origin:'promoted'` EMIT DOOR — the ONE builder BOTH the promote leg (KNOW-8) AND the sound-relation +
  // transition producers ride. Composed from the SAME parts the `atlas-emit` leg is (this store, gate, policy,
  // actor, ratify token) and differs in EXACTLY one field: `origin:'promoted'`. That origin is load-bearing two
  // ways — the door DERIVES it from having read the row out of staging (without it a staged T2 ∧ advisory ∧
  // grounded candidate fast-paths to `auto-accept` and the KNOW-8 token is never consulted, `governed-emit-
  // route.ts`), AND it is the ONLY channel a sound-minted `proven` seal survives (an authored write strips every
  // seal at gate 0). The `#96 F2` negation channels (`symbolReverse`/`axes`/`nodeHashOfPath`/`edgeModel`) are
  // threaded IDENTICALLY to the emit leg (wire.ts:217-220): without them `emitNegation` fail-closes and ABSTAINS
  // `scope-empty` for EVERY promoted negation (governed-emit-negation.ts:178). `...escapeLegs` = the ADR-0016 M2b
  // v2 target-relative legs (both or neither; empty spread ⇒ the sound blanket fallback).
  //
  // FACTORED TO ONE BUILDER so the promote/relation/transition write legs cannot diverge in their door deps. A
  // fresh `createGovernedEmit` per call is NOT a second door: it is a pure factory over its deps (no module
  // state, no cache), and every instance publishes through the SAME durable files by the SAME atomic
  // `commitProjection` protocol — exactly the concurrency case that protocol was written for, since two
  // `atlas emit` PROCESSES are already two instances. A second door would be a second gate ladder or write
  // medium; neither exists here.
  const promotedEmit = () =>
    createGovernedEmit({
      store,
      gate: seams.gate,
      policy,
      actor,
      origin: "promoted",
      ...(ratifyToken !== undefined ? { ratifyToken } : {}),
      symbolReverse: () => symbolReverseView,
      axes,
      nodeHashOfPath,
      edgeModel: edgeModelVersion(),
      ...escapeLegs,
    }).emit

  const promoteLeg = createGovernedPromote({ store, emit: promotedEmit() })

  // THE #99 SOUND-RELATION DERIVE-AND-PERSIST LEG (`atlas derive-relations`, WP-R7). It publishes proven
  // `depends-on` relations through the SAME `promotedEmit` door above (also the transition producer's door). The
  // leg is a THUNK; `runDeriveRelations` re-composes `buildMineAdmission` (now carrying the sound `verifyRelation`
  // oracle) + `ground`-over-`axes` over the SAME index every other leg reads.
  const relationEmit = promotedEmit()
  const deriveRelationsLeg = (): DeriveRelationsRun =>
    runDeriveRelations({
      axes,
      scipOutput,
      ...(indexerName !== undefined ? { indexerName } : {}),
      emit: relationEmit,
      // The anchor rev the write is stamped at (the repo's live HEAD, read through the shared no-shell git seam).
      // The composed truth-gate ignores it (it re-derives freshness against the built `axes`), threaded honestly.
      at: asHash(headSha(repoPath) ?? ""),
      maxRelations: DERIVE_RELATIONS_BUDGET,
    })

  // #95 D5 — the THREE test-vacuity legs built from the ONE shared feed `tvFeed` above (the SAME feed the
  // `tracked-provable` serve filter already re-proved over). Producer rides `relationEmit`; `replay` feeds `reverify`.
  const tvLegs = buildTestVacuityLegs(tvFeed, readAccess.store, relationEmit, asHash(headSha(repoPath) ?? ""))

  return {
    handler: assembleHandler(config),
    doctorSource,
    promote: promoteLeg.promote,
    // THE #99 SOUND-RELATION DERIVE LEG (`atlas derive-relations`). Rides beside the handler like `promote` — a
    // WRITE leg that opens no new governed surface (publishes through the existing emit door). Thunked so the
    // projection + store write are paid only on demand.
    deriveRelations: deriveRelationsLeg,
    // THE `own_<scope>` READ LEG. `readAccess.store` (TRAVEL-BY-REPROOF) and `axes` here are the very
    // objects the handler's query leg reads — passed, not rebuilt — so `atlas own <scope>` and
    // `atlas query <scope>` are two projections of ONE (possibly filtered) store, and `policy` is the same
    // loaded `.atlas/policy.json` the write door gates on (it supplies the terrain OWNER, which is the
    // declared scope membership, not a second notion of ownership).
    own: createOwnLeg({ axes, store: readAccess.store, policy }),
    // THE `anchors` DISCOVERY PLANNER (WP-10.A1 / ADR-0004) — the ARCH-3 binding that makes `createAnchors`
    // running code (its production caller), over the ONE grounding computer. Read-only; not a `Tool`.
    anchors: anchorsLeg.anchors,
    // THE `slots` DISCOVERY PLANNER (WP-10.A2-a / ADR-0004) — the ARCH-3 binding that makes `createSlots`
    // running code (its production caller). No port injected (see the `slotsLeg` build site above).
    slots: slotsLeg.slots,
    // THE `draft` COMPOSITION PLANNER (WP-10.A2-a / ADR-0004) — the ARCH-3 binding that makes `createDraft`
    // running code (its production caller), over the SAME grounding computer `anchors` reads.
    draft: draftLeg.draft,
    // THE `draftSupersede` RETIRE/SUPERSEDE VARIANT (WP-10.A2-b / ADR-0004, AUTHOR-13) — the SAME
    // composition as `draft`, opening NO new write door; the drafted fact differs only in `authoring`.
    draftSupersede: draftLeg.draftSupersede,
    // THE `check` DRY-RUN PLANNER (WP-10.A3 / ADR-0004, AUTHOR-11/12) — the ARCH-3 binding that makes
    // `createCheck` running code (its production caller), over the `GateChainRunner` port built above
    // (`buildCheckPort` → `runGateChain`, WP-10.A3.ADAPTER). Read-only; not a `Tool`; opens no write path.
    check: checkLeg.check,
    // THE GROUNDED-RELATION READ LEG (#99a). `readAccess.store` is the very object the handler's query leg
    // reads — passed, not rebuilt — so `atlas relations <unit>` and `atlas query <unit>` are two projections
    // of ONE store, and a relation emitted through the emit door is visible to the very next `relations` call.
    relations: createRelationLeg(readAccess.store),
    // THE GROUNDED-NEGATION + ABSTENTION READ LEG (#99b). Same `readAccess.store` the query leg reads —
    // passed, not rebuilt — so `atlas negations <scope>` reads the SAME projection `atlas query` reads back,
    // and a fired abstention is observable off it (#202). Read-only; no governed token, GOVERNANCE_SURFACE
    // stays 5. N4 (billy F1): threaded the SAME family-aware freshness oracle the query readback rides —
    // `driftDetect` over the `axes` built once above PLUS the §3 clause-4 `edgeModel === edgeModelVersion()`
    // conjunct for a negation — so `atlas negations` surfaces a per-row FRESH/DRIFTED verdict (a re-opened
    // scope OR an extractor bump reads DRIFTED). `currentEdgeModel` is `edgeModelVersion()`, the SAME value
    // the door stamps.
    negations: createNegationLeg(readAccess.store, bindFreshnessOracle(axes, edgeModelVersion())),
    // #234 — READ leg off the SAME store the query leg reads. The PRODUCER routes THROUGH the governed door (`relationEmit`; transition branch = `governed-emit-transition.ts`) so KNOW-11 authz + ARCH-9 anchor apply (billy #234 — no gate-less write).
    transitions: createTransitionLeg(readAccess.store),
    transition: createTransitionProducer(revIndex, relationEmit, asHash(headSha(repoPath) ?? "")),
    testVacuities: tvLegs.testVacuities, // #95 D5 READ leg (from `tvLegs` above; replay is its third leg, fed to `reverify`)
    testVacuity: tvLegs.testVacuity,
    // THE SOUND-GENESIS PROVEN-FAMILY FEED (`atlas verify-fact`). Off the SAME `scipOutput` the axes ride — a
    // program oracle over the immutable code index, built once and closed over (see verify-fact-source.ts).
    verifyFact: verifyFactLeg,
    // THE REVERIFY-GATE PASS (`atlas verify-store`). MUST see the SAME population `readAdvisory`
    // (`trackedProvableAdvisory`, above) describes — #199 fix-round finding 3 caught this NOT holding: on a
    // `tracked-provable` store `driftFacts` is built off the WRITE-gated `store`, whose `loadProjection()`
    // BLANKS to `undefined` whenever `trusted()` reads `false` (always true for a tracked store — see
    // `store-provenance.ts`), so the old `reverifyStore(driftFacts, …)` here always reported the all-zero
    // "nothing to re-verify" report on the SAME runtime where the read leg's advisory said "N of N re-proven
    // and served" — a live, user-visible contradiction (measured on this repo's own `.atlas/`: advisory said
    // 17/17, `reverify()` said 0/0).
    //
    // FIX: reuse `readAccess.reverified` — the FULL row-by-row report `buildReadAccess`/`buildProvable`
    // already computed off the RAW (un-gated) store for `tracked-provable`, the exact pass
    // `trackedProvableAdvisory` summarizes — so both surfaces read the identical rows, no second oracle
    // replay, no second raw store read. `readAccess.reverified` is `undefined` for `trusted` (case 1, the
    // read leg pays NO new cost there, by design) and for `tracked-staging` (case 3, flat refusal) — for
    // BOTH of those this falls back to the pre-existing `reverifyStore(driftPairs, verifyFactLeg)` pass over
    // the WRITE-gated store, byte-identical to the prior behaviour (for `trusted`, that store is not
    // blanked; for `tracked-staging`, it blanks to `[]`, matching that leg's own refusal).
    // Wave 3 (#95 D5) — `tvLegs.replay` is now LIVE: a committed proven test-vacuity re-proves against HEAD.
    // `danglingOf` is read HERE and not inside `reverifyStore`, so the pass stays a pure function of what it
    // was handed. Omitting it is what made `verify-store` answer an "honest zero" over 17 unresolvable
    // seal:'proven' rows on this very repository.
    reverify: () =>
      readAccess.reverified ??
      reverifyStore(driftPairs, verifyFactLeg, docExists, scopeHasDocs, tvLegs.replay, danglingOf(store)),
    // WP-11.W8 — the four CAMPAIGN-11 memory READ doors (`READ_SURFACE`, ADR-0005). Each rides the SAME
    // `memoryReadDoor`/`awarenessStore`/`orientationStore` built above — never a second store, never a
    // second scan of `.atlas/memory.jsonl`. Bound onto `atlas-query` in `cli/src/map.ts`'s `COMMAND_LEG`
    // (the SAME "second projection of a READ oracle" convention `doctor`/`node`/`anchors` already use —
    // `layer-guard.mjs`'s `boundReadDoor` kind (b)), not `Tool`s of their own: the write half
    // (`atlas-memory-emit`) is the `GOVERNANCE_SURFACE` member; these open no write path.
    memoryRecall: memoryReadDoor.recall,
    memoryHeader: () => memoryReadDoor.header(awarenessStore.read(), orientationStore.orientation()),
    memoryAwareness: () => awarenessStore.read(),
    memoryOrientation: () => orientationStore.orientation(),
    // WP-3-RETR — the RETR-8 budget + RETR-13 MISS-oracle READ legs (`atlas budget` / `atlas territories`).
    // Both ride the honest zero: no production writer records served injections per kind (own-source.ts
    // `hits: 0`) or served off-atlas turns, and neither feed is fabricated — see calibration-ledger.ts.
    budget: budgetLeg(),
    territories: territoriesLeg(policy),
    ...(readRefusal !== undefined ? { readRefusal } : {}),
    ...(readAdvisory !== undefined ? { readAdvisory } : {}),
  }
}
