// @atlas/adapter-io — src/reverify-store.ts  (REVERIFY-GATE: re-prove every `proven` seal against the LIVE index)
//
// The versioned-store chapter's premise is that knowledge travels WITH the repo, not that it is trusted
// because it sits in `.atlas/`. A committed durable store authenticates INTEGRITY (content-addressing) and
// says nothing about PROVENANCE — which is why `store-provenance.ts` turns Atlas off when `.atlas/` is
// tracked by git (untouched here, and this module does NOT narrow that tripwire). The way out is not to
// trust the committed fact but to RE-PROVE it: a fact whose own recorded derivation (`witness`,
// `@atlas/knowledge` `PredicateWitness`, #195 SEAL-CARRIES-ITS-WITNESS) replays PROVEN against the CURRENT
// index is true regardless of who committed it or when. This module is that re-prover.
//
// ── THE THREE-BUCKET CLASSIFICATION IS THE WHOLE POINT ──────────────────────────────────────────────────
//   `re-proven`    — the witness replayed through the REAL oracle (the SAME `VerifyFactLeg` `atlas
//                    verify-fact` drives — no second oracle, no duplicated index build) and came back `proven`.
//   `broken`       — replayed and did NOT come back `proven` (abstain/refuted/anything else). The fact no
//                    longer holds against this index — drift, a deleted caller, a moved symbol.
//   `unverifiable` — `seal:'proven'` with NO witness, or an INCOMPLETE one (missing slot/target/scope, or a
//                    slot the witness family does not cover). There is nothing to replay. THIS MUST NEVER BE
//                    COUNTED AS A PASS: a witness-less `proven` seal is precisely the trust-me-it-was-proved
//                    shape the versioned-store chapter exists to eliminate. Cold review of #195 established
//                    this arm is UNREACHABLE in shipped code today (`compose-mine-admission.ts` wires
//                    `typeOracle.expressible: () => false`) — it is checked anyway, and its count is
//                    reported rather than assumed empty.
//
// A fact that carries NO `seal` at all (an ordinary advisory/predicate/relation/negation) is not sealed
// `proven` and is simply not in scope for this pass — it is neither re-proven nor broken nor unverifiable,
// it is UNSEALED, and this module never counts it.
//
// ── `seal:'justified'` IS ALSO OUT OF SCOPE — BY DESIGN, NOT BY OVERSIGHT (196b, A5) ────────────────────
// A `justified` fact (ADR-0017's second seal) has NO mechanical witness: its grounds are a contestable
// `derivation` prose plus a grounding span into the cited bytes, NOT a re-provable `PredicateWitness`
// (`genesis-epistemic-contract.md` §JUSTIFIED — "the justification travels with the fact", contestable, not
// oracle-backed). There is nothing to REPLAY, so this pass treats it EXACTLY like a seal-less advisory: not
// re-proven, not broken, and — the load-bearing distinction — NOT `unverifiable`. `unverifiable` is reserved
// for a `seal:'proven'` fact whose witness is missing or incomplete (the trust-me-it-was-proved shape this
// chapter exists to catch); a `justified` fact has no witness BY CONSTRUCTION and carrying no witness is its
// CORRECT shape, never a defect. Counting it `unverifiable` would slander an honestly-sealed justified fact
// as a broken proven one. So the seal gate below admits ONLY `seal:'proven'` (`justified` and unsealed both
// fall out to `undefined`, uncounted) — the seal's proof-strength, not merely its presence, decides scope.
//
// ── WHY THIS TAKES `NodeFactPair[]`, NOT A STORE PATH ────────────────────────────────────────────────────
// `compose.ts` already builds the projection readback — `currentNodes(rehydrateProjection(store)).map(n =>
// ({ node: n, fact: store.get(n.contentHash) }))` — for the reconcile seams (`driftFacts` is that same
// readback's `.fact` projection). This module reuses exactly that pairing rather than re-reading the store a
// second time: ONE store read, ONE index build, shared by reconcile AND reverify (the sizing note's binding
// constraint — ~800ms to build the index once — is paid ONCE per `composeRuntime` call regardless of how
// many read doors ride it). `CurrentNode` rides alongside each fact because `reverifyFact`'s anchor binding
// (finding 1b, #199 fix-round) needs `node.primaryAnchor`, which `GroundedFact` itself never carries.
//
// PURE + TOTAL: no IO, no clock. `leg` is the ONLY effectful thing touched, and it is INJECTED — never a
// second oracle constructed here (a duplicated oracle that drifts from the shipped one is a known failure
// class in this repo, see `verify-fact-source.ts`'s header).

import type { Hash } from "@atlas/contracts"
import type {
  CurrentNode,
  GroundedFact,
  NegationNode,
  PredicateSlot,
  RelationNode,
  TestVacuityNode,
  TestVacuityShape,
} from "@atlas/knowledge"
import { currentNodes } from "@atlas/knowledge"
import { claimNormFromWitness } from "@atlas/genesis"
import { unitScopeOf } from "./llm.js"
import { underScope } from "./anchor-scope.js"
import type { DiskStore } from "./store.js"
import { rehydrateProjection } from "./store.js"
import type { VerifyFactLeg, VerifyReq } from "./verify-fact-source.js"

// MIRRORS `packages/cli/src/mine-staging.ts` `MINED_TIER`. `adapter-io` cannot import `@atlas/cli` — `cli`
// depends on `adapter-io`, so the reverse would be a layer cycle (the ARCH constitution's `adapter-io` →
// `tools` direction, never the other way) — so this is a LITERAL MIRROR. It is not a duplicated SOURCE OF
// TRUTH so much as a duplicated CONSEQUENCE of one: every `seal:'proven'` fact is minted EXCLUSIVELY by the
// mine pipeline's sound-oracle arm (`buildSound`, `@atlas/genesis` `admit-harness.ts`), and every proposer
// that can reach that arm hardcodes `tier: 'T2'` (`mine-gate.ts`) — so "a `proven` fact's tier is the mined
// tier" is a structural invariant of the shipped mint path, true for EVERY store, not a tracked-store-only
// rule.
//
// STALENESS (#199 fix-round round 2): a mirror with no shared import can silently start enforcing a STALE
// tier if `MINED_TIER` is ever bumped without updating this copy. EXPORTED (not module-private) so
// `packages/cli/test/mined-tier-mirror-pin.test.ts` — which CAN import both `@atlas/cli`'s own
// `MINED_TIER` and this one, `cli` depending on `adapter-io` — pins byte-equality between them; that test
// fails LOUDLY the moment either literal changes without the other. `e2e-blackbox/test/stage.ts`'s former
// third copy is GONE — it now imports `MINED_TIER` from `@atlas/cli` directly (the same `MINED_SCOPE`
// discipline that file already used), so only TWO literals remain: the true source (`mine-staging.ts`) and
// this one unavoidable cross-layer mirror.
export const MINED_TIER = "T2" as const

/** The three re-verification outcomes — see the module header. Closed vocabulary. */
export type ReverifyOutcome = "re-proven" | "broken" | "unverifiable" | "dangling"

/** One sealed fact's re-verification row. `reason` carries the oracle's abstain/refute reason for `broken`,
 *  or a fixed diagnostic for `unverifiable` — always present so a reader never has to re-derive WHY. */
export interface ReverifyRow {
  readonly nodeKey: string
  readonly outcome: ReverifyOutcome
  readonly reason: string
}

/** The whole pass's report. `sealedProven` is the denominator (every fact this pass even considered) —
 *  the three counts below always sum to it, and an EMPTY store (or one with no `proven` seals at all) is
 *  `sealedProven: 0`, distinguishable from a store this pass could not read (that is a separate FAILURE,
 *  not a `ReverifyReport` — see `reverifyStore`'s caller in `compose.ts`, which fails closed on an unreadable
 *  store rather than reporting an empty one). */
export interface ReverifyReport {
  readonly sealedProven: number
  readonly reProven: number
  readonly broken: number
  readonly unverifiable: number
  /**
   * A `seal:'proven'` row whose `contentHash` resolves to NOTHING in the CAS — the fact is on the durable
   * projection, is served as proven, and its bytes are gone.
   *
   * ── THIS BUCKET EXISTS BECAUSE THE PASS USED TO ANSWER ZERO ──────────────────────────────────────────────
   * `driftPairsOf` dropped unresolvable rows — its own doc said so, "dropping rows whose CAS bytes are
   * absent" — and the drop was SILENT and UNCOUNTED. Measured on this repository's own store: 17 rows carry
   * `seal:'proven'` and every one of their objects is missing, and `atlas verify-store` printed
   *
   *     verify-store: 0 sealed-proven fact(s) — 0 re-proven, 0 broken, 0 unverifiable
   *
   * under guidance reading "an honest zero, not a skip". It was precisely a skip, and the sentence denying
   * that is what made it dangerous: the gate whose entire job is to catch a proven fact that stopped being
   * true reported a clean, empty, healthy store — for the one defect it cannot see by looking at facts,
   * because the facts are what went missing.
   *
   * The seal is readable WITHOUT the bytes: it is on the `CurrentNode` in the projection. So there was never
   * a technical reason to drop these rows, only an unexamined `.filter(Boolean)`.
   *
   * It is its OWN bucket rather than folded into `unverifiable` because the three existing buckets are
   * documented as never merging, and this is a different fault: `unverifiable` means the WITNESS is missing
   * or incomplete, a claim that was never properly proved. `dangling` means the FACT is missing — the store
   * is referentially broken, which is a storage incident, not a proof-strength one. `atlas doctor cas`
   * (ADR-0022) is the leg that audits that layer; this bucket is how the governance gate stops hiding it.
   */
  readonly dangling: number
  readonly rows: readonly ReverifyRow[]
}

/** The two witness slots the oracle family actually witnesses today (#195 `witnessOf`: a witness exists
 *  only when `p.target`/`p.scope` are both strings, which the admit path only sets for these two slots). A
 *  witness naming any OTHER slot is, BY CONSTRUCTION of the shipped mint path, unreachable — but this module
 *  does not trust that absence: an out-of-family slot fails closed to `unverifiable`, not a throw and not a
 *  silent `broken`. */
const WITNESSED_SLOTS: ReadonlySet<PredicateSlot> = new Set(["dependency", "count", "definition"])

/** Build the typed `VerifyReq` a witness replays as — the SAME shape `verifyFactVerdict` builds off CLI argv
 *  (`--scope` = `witness.scope`, `--world` defaults to `--scope`), so a re-verified claim is decided by
 *  EXACTLY the invocation `atlas verify-fact` would run if handed the witness back (as `s33-seal-witness`
 *  already demonstrates one row of, by hand, over the CLI). */
function reqOf(
  slot: "dependency" | "count" | "definition",
  target: string,
  scope: string,
  atLeast: number | undefined,
): VerifyReq {
  if (slot === "dependency") {
    return { kind: "dependency", claim: { sourceScope: scope, target, worldScope: scope } }
  }
  // slot === 'definition' (196d) — the SAME shape the CLI leg builds (`verify-fact-source.ts`): a positive
  // witnessed existence, no `worldScope` and no `atLeast` (definition carries neither — it proves the def
  // occurrence lies UNDER `scope`, no cardinality, no closed-world).
  if (slot === "definition") {
    return { kind: "definition", claim: { sourceScope: scope, target } }
  }
  // slot === 'count' — `atLeast` is REQUIRED by the witness contract (#195 `witnessOf`, present only for the
  // count slot); absent here means the stored witness itself is malformed, not something this fold invents —
  // callers reach this branch only after `atLeast` has been checked present (see `reverifyFact`).
  return {
    kind: "count",
    claim: { sourceScope: scope, target, worldScope: scope, atLeast: atLeast ?? 0, exact: false },
  }
}

/** `primaryAnchor` is the fact's OWN anchor (the tightest structural unit its grounding names,
 *  `primaryAnchorId`/KNOW-15d); `scope` is the verify-scope the witness was minted over (`witness.scope`,
 *  the directory the oracle actually ranged over when it proved the claim).
 *
 * TIGHTENED (#199 fix-round, security seat re-attack): a CONTAINMENT rule ("anchor is at or under scope")
 * is monotone in the WIDENING direction — any real reference under a narrow scope is trivially also under
 * every ancestor of it, so a committer was never forced to write the NARROW scope the mine pipeline
 * actually emits (proved live against the real production index: a fact re-anchored to `src/payments/deep/
 * nested/charge.ts` still bound against `witness.scope: 'src'`, an honestly-worded, oracle-backed T2 badge
 * planted at an arbitrary file by citing any true cross-package reference in a broad ancestor directory).
 *
 * The actual relation the mine pipeline PRODUCES — and the only one this check now ADMITS — is `scope IS
 * the anchor's own containing directory`, exactly `unitScopeOf` (`llm.ts`, the SAME function
 * `makeDependencyClaimParser` calls to derive `scope` from `cand.site.qualifiedPath` at mint time). REUSED
 * here, never reimplemented, so the read-side check cannot drift from the write-side relation it is
 * checking (this repo's recurring failure class — #186/N10 — one layer removed: a second COPY of a path
 * relation, not a second oracle). MEASURED against the 17 REAL `seal:'proven'` facts in the main repo's own
 * `.atlas/`: `unitScopeOf(primaryAnchor) === witness.scope` holds for all 17 (e.g. anchor
 * `packages/knowledge/src/write/router.ts`, scope `packages/knowledge/src/write` — the anchor's OWN parent
 * directory, never a grandparent, never a sibling). */
function anchorMatchesWitnessScope(primaryAnchor: string, scope: string): boolean {
  return unitScopeOf(primaryAnchor) === scope
}

/** Whether the live SCIP index has a document at `path` — INJECTED (never a second index build here; see
 *  `reverifyFact`'s doc comment on binding (d) and `compose.ts`, which builds this from the SAME
 *  `scipOutput.documents` list `createVerifyFactLeg`'s own `pathByHash` already iterates). */
export type DocExists = (path: string) => boolean

/** Does the LIVE index contain AT LEAST ONE document under directory `scope`? The negation-family analog of
 *  `DocExists` (#240 follow-up): a negation is a claim ABOUT a directory `scope`, and `verifyNegation` has no
 *  `scope-empty` gate (only the write door does), so a proven negation over a scope whose directory was later
 *  deleted re-proves VACUOUSLY. `reverifyNegation` uses this to read such a stale negation as `broken` instead,
 *  mirroring the write door's gate-1 `scope-empty` abstain and the relation family's `docExists` endpoint
 *  teeth. Built from the SAME `scipOutput.documents` `docExists` is (`compose.ts`), via `underScope`. */
export type ScopeHasDocs = (scope: string) => boolean

/** Build a {@link ScopeHasDocs} from the live index's document list — `∃ doc under directory scope`, via the
 *  same segment-wise `underScope` the read projection scopes on. Kept HERE (beside its consumer) so the
 *  composition root wires it in one line, not four. */
export const makeScopeHasDocs =
  (documents: readonly { readonly relativePath: string }[]): ScopeHasDocs =>
  (scope) =>
    documents.some((d) => underScope(d.relativePath, scope))

/** The FILE half of a `primaryAnchor` — anchors are either a bare file path or `file::item::block` (the
 *  sub-file structural-refinement chain `ast.ts`'s `::` join mints, KNOW-15d) — strip everything from the
 *  first `::` onward, exactly the split `unitScopeOf` (above) already performs on the same string, so the
 *  two functions can never disagree about which FILE an anchor names. */
function anchorFileOf(primaryAnchor: string): string {
  const at = primaryAnchor.indexOf("::")
  return at === -1 ? primaryAnchor : primaryAnchor.slice(0, at)
}

/** Re-verify ONE `seal:'proven'` RELATION fact against the live oracle (#99 sound relation, ADR-0018, WP-R5).
 *
 * This is the READ-SIDE half of the D-d two-layer forgery defense. The write door (`governed-emit.ts`) strips
 * SHAPE-forged proven relations (witness missing / malformed / a non-provable `calls` kind), but it has NO
 * oracle — so a SHAPE-VALID-BUT-FALSE witness (a well-formed `depends-on` triple that names an edge the index
 * does not actually witness, or one bolted onto an unrelated true edge) still persists proven there, exactly as
 * a promoted predicate witness does. It is caught HERE by RE-RUNNING the oracle: no `proven` relation is served
 * unless `verifyRelation` re-proves the edge against the CURRENT index. This CLOSES the #240 trap for the
 * relation family — a `proven` relation is no longer dumped to `unverifiable` for want of a slot; it is replayed.
 *
 * A relation has NO `PredicateSlot`, so the witness is a `RelationWitness{relationKind, target, sourceScope}`
 * and the replay routes through the leg's `kind:'relation'` arm (`verifyRelation`) — NOT `verifyDependency`.
 * `verifyRelation` takes NO `worldScope` (a witnessed positive existence needs no closed-world guard), and the
 * `RelationWitness` carries none, so there is nothing to reconstruct: the stored triple IS the exact oracle call.
 *
 * ── THE RELATION-SHAPED TAMPER BINDINGS (mirror the predicate ones, endpoint-shaped) ────────────────────────
 * A witness that replays PROVEN authenticates only that SOME `sourceScope references target` edge exists — never
 * that THIS relation's tier, endpoints, or that either endpoint names anything REAL. So BEFORE the replay:
 *   (a) TIER      — `fact.tier` must be `MINED_TIER`; a `proven` seal is minted only by the mine pipeline.
 *   (b) ENDPOINT SCOPE — `unitScopeOf(endpointA)` (endpointA is the subject anchor — a location-free unitKey /
 *                 qualifiedPath, per R3) must EQUAL `witness.sourceScope`, the exact verify-scope the oracle
 *                 ranged over — the anchor's own containing directory, never a broader ancestor (the same
 *                 widening-monotone attack the predicate path's binding (b) closes).
 *   (c) BOTH ENDPOINTS EXIST — the FILE half of endpointA AND of endpointB must each name a document the live
 *                 SCIP index actually contains (`docExists`). A relation is a claim about TWO real units; a
 *                 dangling endpoint (renamed/removed file, a fabricated unitKey) is not re-provable and never a
 *                 silent pass — and reading `docExists` on a dangling endpoint must not crash (AR-25).
 * ANY mismatch → `broken` with a `TAMPERED:` reason — ALIGNED with the predicate reverify path (which reports
 * its four tamper bindings `broken`, `reverifyFact` §a–d): a tampered `proven`-sealed relation is not served, and
 * the `TAMPERED:` wording distinguishes it from a drift `broken` ("did NOT re-prove"). `unverifiable` is reserved
 * STRICTLY for the "nothing to replay" shape — a missing or incomplete witness — never a tamper. Dropped, never
 * clamped: silently rewriting a tampered endpoint/tier back to a derived value would hide the tamper attempt. */
export function reverifyRelation(
  nodeKey: string,
  fact: RelationNode,
  leg: VerifyFactLeg,
  docExists: DocExists,
): ReverifyRow {
  const w = fact.witness
  if (w === undefined) {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason:
        "seal:'proven' relation but no witness was recorded — nothing to replay (the trust-me-it-was-proved shape)",
    }
  }
  if (
    typeof w.target !== "string" ||
    w.target.length === 0 ||
    typeof w.sourceScope !== "string" ||
    w.sourceScope.length === 0
  ) {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason: "relation witness is incomplete (missing target/sourceScope) — nothing to replay",
    }
  }
  // ── TAMPER BINDINGS (a)/(b)/(c) — see the doc comment. Checked BEFORE the oracle replay; any failure is
  //    `broken` + `TAMPERED:` (a defect in a proven-sealed relation, aligned with the predicate tamper path),
  //    never a silent pass and never a false re-prove. (`unverifiable` is reserved for a missing/incomplete
  //    witness above — nothing to replay.) ──
  if (fact.tier !== MINED_TIER) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: tier '${String(fact.tier)}' is not the mined tier '${MINED_TIER}' — every seal:'proven' relation is minted by the mine pipeline, so a different tier was chosen by whoever committed it, not proven by anything`,
    }
  }
  const endpointA = fact.endpointA
  if (typeof endpointA !== "string" || endpointA.length === 0 || unitScopeOf(endpointA) !== w.sourceScope) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: endpointA '${endpointA ?? "(none)"}' does not sit directly under the witness's own sourceScope '${w.sourceScope}' (unitScopeOf(endpointA) must equal sourceScope, never a broader ancestor) — the relation is not about the edge its witness proves`,
    }
  }
  const endpointB = fact.endpointB
  if (typeof endpointB !== "string" || endpointB.length === 0) {
    return {
      nodeKey,
      outcome: "broken",
      reason:
        "TAMPERED: endpointB is missing — a relation is a claim about TWO units, so an absent object endpoint is not re-provable",
    }
  }
  if (!docExists(anchorFileOf(endpointA)) || !docExists(anchorFileOf(endpointB))) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: an endpoint of this relation ('${endpointA}' / '${endpointB}') does not name a document the live SCIP index actually contains — a dangling/renamed/fabricated endpoint, not a real unit the witnessed edge is about`,
    }
  }
  // ── REPLAY — route the RELATION witness THROUGH the leg's `kind:'relation'` arm (verifyRelation), carrying
  //    the fact's OWN endpoints so the oracle re-binds BOTH endpoint FILES to the witnessed edge (endpointA a
  //    real referrer, endpointB the definer). A forged endpoint PAIR that survived the shape checks above FAILS
  //    the replay here → `broken`. NOT verifyDependency (no worldScope on the RelationWitness). One index build. ──
  const verdict = leg({
    kind: "relation",
    claim: { relationKind: w.relationKind, target: w.target, sourceScope: w.sourceScope, endpointA, endpointB },
  })
  if (verdict.verdict === "proven") {
    return {
      nodeKey,
      outcome: "re-proven",
      reason: `replayed PROVEN over (${w.relationKind}, ${w.target}, ${w.sourceScope})`,
    }
  }
  return {
    nodeKey,
    outcome: "broken",
    reason: `replay did NOT re-prove — oracle returned '${verdict.verdict}'${verdict.reason !== undefined ? ` (${verdict.reason})` : ""}`,
  }
}

/** Re-verify ONE `seal:'proven'` NEGATION fact against the live oracle (#240 — close the trap that dumped a
 *  proven negation to `unverifiable` for want of a witnessed slot; the analog of the relation fix WP-R5).
 *
 *  A negation is the ONE family where the re-proof needs NO separate witness and NO anchor binding: its
 *  identity legs `(target, scope)` ARE the entire `NegationClaim` (`verify-negation.ts` — "no caller of
 *  `target` under `scope`"), stored on the node itself, so there is no claim-vs-identity gap for a committer
 *  to bolt a true edge onto (the exact hole the relation/predicate anchor bindings close). The negation
 *  routes by `negationKey`, never a `primaryAnchorId` (governed-emit-negation.ts) — so there is no anchor to
 *  bind. The two remaining tamper/staleness vectors are covered directly:
 *    · TIER — a `proven` seal is minted only by the mine pipeline; any other tier is a committer's invention.
 *    · TARGET/SCOPE REALITY + CLOSED-WORLD — re-running `verifyNegation` over the CURRENT index IS the check:
 *      a phantom/`local` target abstains → `broken`; a counterexample caller that APPEARED refutes → `broken`;
 *      a scope that is no longer hole-free abstains (`scope-open`) → `broken`. This is STRONGER than the
 *      `edgeModel` version-stamp the door writes (billy F1) — it re-checks the actual holes, not a proxy.
 *  Only a fresh `proven` (still no caller, still hole-free) re-proves; anything else is `broken`. */
export function reverifyNegation(
  nodeKey: string,
  fact: NegationNode,
  leg: VerifyFactLeg,
  scopeHasDocs: ScopeHasDocs,
): ReverifyRow {
  const { target, scope } = fact
  if (typeof target !== "string" || target.length === 0 || typeof scope !== "string" || scope.length === 0) {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason: "seal:'proven' negation with an incomplete identity (missing target/scope) — nothing to replay",
    }
  }
  if (fact.tier !== MINED_TIER) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: tier '${String(fact.tier)}' is not the mined tier '${MINED_TIER}' — every seal:'proven' negation is minted by the mine pipeline, so a different tier was chosen by whoever committed it, not proven by anything`,
    }
  }
  // ── SCOPE EXISTS (#240 follow-up) — a negation is a claim ABOUT a directory. `verifyNegation` re-proves a
  //    scope with NO documents VACUOUSLY (no callers, no holes ⇒ proven), so a proven negation whose scope
  //    directory was deleted would read `re-proven`. Refuse it as `broken` — mirroring the write door's gate-1
  //    `scope-empty` and the relation family's `docExists` endpoint teeth. Checked BEFORE the replay. ──────────
  if (!scopeHasDocs(scope)) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `the negation's scope '${scope}' no longer names a directory the live SCIP index contains any document under — the region it is a negative about is gone (a deleted/renamed/fabricated scope re-proves only vacuously)`,
    }
  }
  // ── REPLAY — the negation's own identity IS the claim; re-run the closed-world oracle over the LIVE index.
  //    A counterexample caller (refuted) OR a scope no longer hole-free (abstain) both mean the proven negative
  //    no longer holds → `broken`. Only a still-closed, still-empty scope re-proves. ────────────────────────
  const verdict = leg({ kind: "negation", claim: { scope, target } })
  if (verdict.verdict === "proven") {
    return {
      nodeKey,
      outcome: "re-proven",
      reason: `replayed PROVEN — no caller of ${target} under ${scope} (closed-world, hole-free)`,
    }
  }
  return {
    nodeKey,
    outcome: "broken",
    reason: `replay did NOT re-prove — oracle returned '${verdict.verdict}'${verdict.reason !== undefined ? ` (${verdict.reason})` : ""} (a counterexample caller appeared under scope, or the scope is no longer hole-free)`,
  }
}

/** Re-run `scanTestVacuity` over a unit at HEAD and report whether a fact with `(shape, testName)` still appears
 *  — the tree-sitter RE-PROOF leg (#95 D5, the test-vacuity family's re-runnable oracle). INJECTED (never a tree
 *  parse built here — the leg re-reads + re-parses the unit at the composition root, exactly as the SCIP
 *  `VerifyFactLeg` is injected rather than re-derived). `'proven'` iff the shape still holds; `'abstain'` iff the
 *  test changed / vanished / the unit no longer parses. ABSENT (Wave 2 has not wired it) ⇒ `reverifyTestVacuity`
 *  reads a proven test-vacuity as `unverifiable` (nothing to replay), never a false re-prove. */
export type TestVacuityReplay = (unitKey: string, testName: string, shape: TestVacuityShape) => "proven" | "abstain"

/** Re-verify ONE `seal:'proven'` TEST-VACUITY fact against the live tree-sitter oracle (#95 D5, single-anchor
 *  analogue of the relation/negation reverify arms — closes the #240 trap for this family). A test-vacuity
 *  carries a `TestVacuityWitness{shape, testName}` (no `PredicateSlot`), so it re-proves by RE-RUNNING
 *  `scanTestVacuity` over the unit at HEAD (`replay`) and reading `'proven'` iff a fact with this
 *  `(shape, testName)` still appears; anything else is `broken` (the test changed / vanished — drift). A missing
 *  witness, or no `replay` leg wired, is `unverifiable` (nothing to replay — the trust-me-it-was-proved shape,
 *  never counted a pass). The witness IS the whole claim (like a negation's identity legs), so there is no
 *  anchor-binding tamper vector to close here — but there IS a TIER staleness vector (mirroring reverifyRelation
 *  §a / reverifyFact §a): a `proven` seal is minted EXCLUSIVELY by the mine/producer pipeline (`MINED_TIER`), so a
 *  `proven`-sealed test-vacuity at any other tier was re-tiered by whoever committed it, not proven by anything —
 *  `broken` (TAMPERED), checked BEFORE the replay so a tampered fact never needs the tree-sitter re-run to be
 *  dropped. (`unverifiable` stays reserved for the "nothing to replay" shape — missing witness / no leg wired.)
 *  Pure + total. */
export function reverifyTestVacuity(
  nodeKey: string,
  fact: TestVacuityNode,
  replay: TestVacuityReplay | undefined,
): ReverifyRow {
  const w = fact.witness
  if (w === undefined || typeof w.testName !== "string" || w.testName.length === 0) {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason:
        "seal:'proven' test-vacuity but no witness was recorded — nothing to replay (the trust-me-it-was-proved shape)",
    }
  }
  if (typeof fact.unitKey !== "string" || fact.unitKey.length === 0) {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason: "test-vacuity witness is incomplete (missing unitKey to re-scan) — nothing to replay",
    }
  }
  // ── TAMPER BINDING (a) TIER — mirrors reverifyRelation §a (:225) / reverifyFact §a. Checked BEFORE the replay;
  //    a `proven` seal at a non-mined tier is a committer's invention, `broken` + `TAMPERED:`, never a false pass. ──
  if (fact.tier !== MINED_TIER) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: tier '${String(fact.tier)}' is not the mined tier '${MINED_TIER}' — every seal:'proven' test-vacuity is minted by the mine pipeline, so a different tier was chosen by whoever committed it, not proven by anything`,
    }
  }
  if (replay === undefined) {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason:
        "no test-vacuity re-scan leg is wired — the tree-sitter oracle cannot be replayed here (fail-closed, never a false re-prove)",
    }
  }
  const verdict = replay(fact.unitKey, w.testName, w.shape)
  if (verdict === "proven") {
    return {
      nodeKey,
      outcome: "re-proven",
      reason: `replayed PROVEN — test '${w.testName}' still holds the ${w.shape} shape at HEAD`,
    }
  }
  return {
    nodeKey,
    outcome: "broken",
    reason: `replay did NOT re-prove — a fact with (shape '${w.shape}', test '${w.testName}') no longer appears in scanTestVacuity's HEAD output (the test changed or was removed)`,
  }
}

/** Re-verify ONE sealed fact against the live oracle. `node` is the fact's OWN `CurrentNode` row — the
 *  source of `primaryAnchor`, which `GroundedFact` itself does not carry (KNOW-15d: the anchor is a
 *  projection-row carrier, `projection-types.ts`, not part of the CAS-stored fact). `undefined` iff the
 *  fact is not `seal:'proven'` at all — an unsealed fact OR a `seal:'justified'` one, BOTH out of scope for
 *  this pass (a justified fact has no re-provable witness by design; see the module header's §justified).
 *
 * ── THE FOUR TAMPER BINDINGS (security seat findings, #199 fix-round, three rounds) ─────────────────────
 * A witness that replays PROVEN authenticates only a fact SHAPE — "this scope references this target" —
 * never THIS fact's tier, anchor, prose, or even that the anchor NAMES ANYTHING REAL, all four of which a
 * committer can otherwise choose freely and bolt onto an unrelated true edge (round 1, measured live: a T0
 * "no SQL injection" claim at `charge.ts`, riding a `greet()` reference witness, served `ok:true`; round 3,
 * measured live against the real production index: a witness-matching, correctly-derived, correctly-tiered
 * fact anchored at `…/TOTALLY-FAKE-FILE-DOES-NOT-EXIST.ts` — a file the SCIP index has never heard of —
 * still served `ok:true`, and a bare directory `'src/'` did too). These four checks close exactly that gap
 * and run BEFORE the (comparatively expensive) oracle replay — a tampered fact never needs the oracle to be
 * dropped:
 *   (a) TIER    — `fact.tier` must be the mined tier (see `MINED_TIER` above); a `proven` seal is minted
 *                 ONLY by the mine pipeline, so any other tier is a committer's own invention.
 *   (b) ANCHOR SCOPE — `unitScopeOf(node.primaryAnchor)` must EQUAL `w.scope` (`anchorMatchesWitnessScope`)
 *                 — the anchor's own containing directory, never a broader ancestor (round 2: containment
 *                 alone is widening-monotone and was found still open after round 1).
 *   (c) PROSE   — `fact.claimNorm` must be BYTE-EQUAL to `claimNormFromWitness(w)`, the same pure function
 *                 `admit-harness.ts` mints the sentence with (#197 CLAIM-DERIVED-FROM-WITNESS) — re-derived
 *                 HERE from the stored witness, never trusted from the stored sentence itself. Hand-written
 *                 prose cannot match; the correctly-derived sentence CAN, and that is fine — it says exactly
 *                 what the witness proves and nothing more.
 *   (d) ANCHOR EXISTS — `docExists(anchorFileOf(node.primaryAnchor))` must be `true` — the anchor's FILE
 *                 half must name a document the LIVE SCIP index actually contains (round 3: (b) alone
 *                 checks the RELATION between two strings, never that either one refers to something real —
 *                 a fabricated filename, or a bare directory with no filename at all, satisfied `unitScopeOf
 *                 = scope` trivially and was served). `docExists` is INJECTED, built from the SAME
 *                 `scipOutput.documents` the oracle's own `pathByHash` iterates (`verify-fact-source.ts`) —
 *                 no second index build, no new seam.
 * All four failures are reported as `broken` (the fact is not served, same bucket a drifted witness lands
 * in) with a `TAMPERED:` reason — DISTINCT wording from a drift `broken` ("did NOT re-prove"), so an
 * operator can tell "the code moved under this fact" from "this fact was altered after the oracle proved
 * something else". Dropped, never clamped: silently rewriting a tampered tier/anchor/prose back to the
 * derived value would hide that a tamper was attempted at all. */
export function reverifyFact(
  node: CurrentNode,
  fact: GroundedFact,
  leg: VerifyFactLeg,
  docExists: DocExists,
  scopeHasDocs: ScopeHasDocs,
  replay?: TestVacuityReplay,
): ReverifyRow | undefined {
  // SEAL GATE — admit ONLY `seal:'proven'` into the re-proof. `seal:'justified'` (contestable derivation, no
  // mechanical witness) and unsealed facts BOTH return `undefined` here: out of scope, never counted in any
  // bucket — and crucially NEVER `unverifiable`, which is a `proven`-only diagnosis (see module header §justified).
  if (fact.seal !== "proven") return undefined
  const nodeKey = String(fact.id)
  // ── RELATION FAMILY (#99 sound relation, ADR-0018, WP-R5) — a `proven`-sealed relation carries a
  //    `RelationWitness` (no slot), replays through `verifyRelation` (no worldScope), and binds on its
  //    ENDPOINTS, not a `primaryAnchor`. This is a WHOLLY separate re-proof shape from the predicate family
  //    below (which reads the slot-keyed `AdvisoryNode.witness`); routing it here closes the #240 trap that
  //    used to dump every proven relation to `unverifiable` for want of a witnessed slot. ────────────────────
  if (fact.kind === "relation") return reverifyRelation(nodeKey, fact, leg, docExists)
  // ── NEGATION FAMILY (#240) — a `proven`-sealed negation carries no witness slot, but its identity legs
  //    `(target, scope)` ARE the whole claim, so it re-proves by re-running `verifyNegation` directly (no
  //    anchor binding — a negation routes by `negationKey`). Routing it here closes the #240 trap that used to
  //    dump a proven negation to `unverifiable`. ─────────────────────────────────────────────────────────────
  if (fact.kind === "negation") return reverifyNegation(nodeKey, fact, leg, scopeHasDocs)
  // ── TEST-VACUITY FAMILY (#95 D5) — a `proven`-sealed test-vacuity carries a `TestVacuityWitness{shape,
  //    testName}` and re-proves by RE-RUNNING `scanTestVacuity` over the unit at HEAD (the injected `replay`
  //    leg), NOT the SCIP `leg`. Routing it here closes the #240 trap that would otherwise dump every proven
  //    test-vacuity to `unverifiable` for want of a witnessed slot. ─────────────────────────────────────────────
  if (fact.kind === "test-vacuity") return reverifyTestVacuity(nodeKey, fact, replay)
  // Past the relation/negation branches above, the PREDICATE witness is carried ONLY on `AdvisoryNode` (#195
  // `buildSound` mints the predicate sound-oracle arm as an advisory), so a `proven`-sealed PREDICATE is
  // STRUCTURALLY witness-less here: `unverifiable`, not a type-narrowing dodge.
  const w = fact.kind === "advisory" ? fact.witness : undefined
  if (w === undefined) {
    return { nodeKey, outcome: "unverifiable", reason: "seal:proven but no witness was recorded — nothing to replay" }
  }
  if (typeof w.target !== "string" || w.target.length === 0 || typeof w.scope !== "string" || w.scope.length === 0) {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason: "witness is incomplete (missing target/scope) — nothing to replay",
    }
  }
  if (!WITNESSED_SLOTS.has(w.slot)) {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason: `witness names slot '${w.slot}', outside the witnessed family (dependency|count|definition) — nothing to replay`,
    }
  }
  if (w.slot === "count" && typeof w.atLeast !== "number") {
    return {
      nodeKey,
      outcome: "unverifiable",
      reason: "witness slot 'count' carries no atLeast bound — nothing to replay",
    }
  }
  // ── TAMPER BINDINGS (a)/(b)/(c) — see the doc comment above. Checked BEFORE the oracle replay. ──────────
  if (fact.tier !== MINED_TIER) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: tier '${String(fact.tier)}' is not the mined tier '${MINED_TIER}' — every seal:'proven' fact is minted by the mine pipeline, so a different tier was chosen by whoever committed it, not proven by anything`,
    }
  }
  const anchor = node.primaryAnchor
  if (typeof anchor !== "string" || anchor.length === 0 || !anchorMatchesWitnessScope(anchor, w.scope)) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: primary anchor '${anchor ?? "(none)"}' does not sit directly under the witness's own scope '${w.scope}' (unitScopeOf(anchor) must equal scope, never a broader ancestor) — the fact is not about what its witness proves`,
    }
  }
  if (!docExists(anchorFileOf(anchor))) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: primary anchor '${anchor}' does not name a document the live SCIP index actually contains — the anchor is fabricated or a bare directory, not a real file the witness's edge is about`,
    }
  }
  const expectedClaim = claimNormFromWitness(w)
  if (fact.kind !== "advisory" || fact.claimNorm !== expectedClaim) {
    return {
      nodeKey,
      outcome: "broken",
      reason: `TAMPERED: claim text does not match the sentence DERIVED from the witness ('${expectedClaim}') — hand-written prose over a witness that proves something narrower`,
    }
  }
  const verdict = leg(reqOf(w.slot as "dependency" | "count" | "definition", w.target, w.scope, w.atLeast))
  if (verdict.verdict === "proven") {
    return { nodeKey, outcome: "re-proven", reason: `replayed PROVEN over (${w.slot}, ${w.target}, ${w.scope})` }
  }
  return {
    nodeKey,
    outcome: "broken",
    reason: `replay did NOT re-prove — oracle returned '${verdict.verdict}'${verdict.reason !== undefined ? ` (${verdict.reason})` : ""}`,
  }
}

/** One projection row paired with the `GroundedFact` its `contentHash` resolves to — the shape
 *  `reverifyFact` needs (`node.primaryAnchor` for the anchor binding) and the shape every caller already
 *  has lying around from `currentNodes(rehydrateProjection(store)).map(n => ({ node: n, fact: store.get(n.contentHash) }))`. */
export interface NodeFactPair {
  readonly node: CurrentNode
  readonly fact: GroundedFact
}

/** The FULL durable-store readback as `NodeFactPair[]` — each projection row paired with the `GroundedFact` its
 *  `contentHash` resolves to. Rows whose CAS bytes are absent cannot be paired and are excluded HERE, but they
 *  are no longer thrown away: {@link danglingOf} recovers them, and `reverifyStore` counts the `seal:'proven'`
 *  ones. ONE store read, ONE map; the shape both `reverifyStore` (via `driftFacts = pairs.map(p => p.fact)`)
 *  and the reconcile drift seams ride. Extracted from `compose.ts` so the composition root stays under the
 *  godfile ceiling. */
export function driftPairsOf(store: DiskStore): readonly NodeFactPair[] {
  return currentNodes(rehydrateProjection(store))
    .map((node) => {
      const fact = store.get(node.contentHash as Hash)
      return fact === undefined ? undefined : { node, fact }
    })
    .filter((p): p is NodeFactPair => p !== undefined)
}

/**
 * The projection rows this pass CANNOT pair — `seal:'proven'` and their `contentHash` resolves to nothing.
 *
 * A separate read rather than a second return value from `driftPairsOf`, because that function's result feeds
 * the reconcile drift seams too, and those genuinely want facts alone. The seal lives on the `CurrentNode`,
 * so this needs no bytes: that is the whole reason the silent drop was never necessary.
 */
/** The `dangling` row for one unresolvable node. EXPORTED because there are TWO report-construction paths —
 *  this module's `reverifyStore` and `read-access.ts`'s committed-store pass — and the whole defect being
 *  fixed here is the two of them independently deciding what to do with a row they could not resolve. One
 *  shape, one reason string, minted in one place. */
export function danglingRow(node: CurrentNode): ReverifyRow {
  return {
    nodeKey: node.nodeKey as unknown as string,
    outcome: "dangling",
    reason:
      `the durable projection serves this fact as seal:'proven', and its contentHash ` +
      `'${node.contentHash}' resolves to nothing in the CAS — the bytes ARE the fact, so there is nothing ` +
      `left to re-prove. Run 'atlas doctor cas' for the store-wide audit (ADR-0022).`,
  }
}

export function danglingOf(store: DiskStore): readonly CurrentNode[] {
  return currentNodes(rehydrateProjection(store)).filter(
    (n) => (n as { readonly seal?: string }).seal === "proven" && store.get(n.contentHash as Hash) === undefined,
  )
}

/**
 * Re-verify EVERY `proven`-sealed fact in `pairs` against `leg` — build the index ONCE (the caller's job,
 * `compose.ts`), loop, count three buckets. Anti-overengineering by construction: no cache, no worker pool, no
 * config. `pairs` is the FULL durable-store readback (`driftFacts`-shaped, now carrying each fact's own
 * `CurrentNode` alongside it) — reading the STORE, never a command's own summary, per the chapter's honesty
 * requirement.
 */
export function reverifyStore(
  pairs: readonly NodeFactPair[],
  leg: VerifyFactLeg,
  docExists: DocExists,
  scopeHasDocs: ScopeHasDocs,
  replay?: TestVacuityReplay,
  dangling: readonly CurrentNode[] = [],
): ReverifyReport {
  const rows: ReverifyRow[] = []
  for (const { node, fact } of pairs) {
    const row = reverifyFact(node, fact, leg, docExists, scopeHasDocs, replay)
    if (row !== undefined) rows.push(row)
  }
  // The rows that never reached the loop, counted rather than dropped. `dangling` defaults to EMPTY so every
  // existing caller keeps its exact behaviour — but the production caller passes `danglingOf(store)`, and the
  // default being empty is the one thing that could quietly re-open the hole, so it is asserted by a test.
  for (const node of dangling) rows.push(danglingRow(node))
  return {
    sealedProven: rows.length,
    reProven: rows.filter((r) => r.outcome === "re-proven").length,
    broken: rows.filter((r) => r.outcome === "broken").length,
    unverifiable: rows.filter((r) => r.outcome === "unverifiable").length,
    dangling: rows.filter((r) => r.outcome === "dangling").length,
    rows,
  }
}
