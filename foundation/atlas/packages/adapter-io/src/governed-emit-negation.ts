// @atlas/adapter-io — src/governed-emit-negation.ts  (ADR-0015 D3 · #99b N2 — THE ABSTENTION DOOR)
//
// The honesty core. A NEGATION is `¬∃` over a relation ("no unit `relationKind`s the GLOBAL symbol X within
// the CLOSED directory scope S"). A closed-world negative is SOUND ONLY IF the negated relation was computed
// COMPLETELY over S — an under-approximated graph (an unresolved/dynamic reference anywhere in S) makes every
// negative a lie (contract §0). So this door REFUSES to admit any negation it cannot prove closed, and emits
// an EXPLICIT, DURABLE `AbstainedRecord` when it must abstain — never a silent fail-closed drop (closes #202).
//
// It rides the SAME governed emit surface (`createGovernedEmit`) — the door's `emit` branches here on
// `kind:'negation'` — but its GATES are RE-ROUTED (contract §4, normative and transcribed here, no invented
// policy):
//   gate 0.1 WELL-FORMED : target/scope non-empty, relationKind ∈ the closed vocabulary, AND target GLOBAL
//                          (not a `local ` SCIP symbol — a local's callers are intra-doc, out of #99b v1).
//                          A malformed triple ⇒ fail-closed REFUSE; a non-global target ⇒ ABSTAIN
//                          (`target-not-global`).
//   gate 1   ABSTENTION  : the crux. Over the scope S, using the N0 completeness feed (`SymbolReverseApi`):
//                            · S does not resolve on the spatial rail  ⇒ ABSTAIN (`scope-empty`).
//                            · holeSources() ∩ S ≠ ∅  (S is OPEN)      ⇒ ABSTAIN (`scope-open`, witness).
//                            · resolves(target) == false (#220 — no    ⇒ ABSTAIN (`target-unresolvable`): the
//                              in-index definition, a PHANTOM target)     negative would be VACUOUSLY true.
//                            · reverseCallers(target) ∩ S ≠ ∅ (a real  ⇒ REJECT (the negative is FALSE —
//                              caller EXISTS)                             refuted, NOT abstained).
//                            · callers∩S == ∅ ∧ holes∩S == ∅           ⇒ ADMIT with the §3 grounding.
//                          ⚠ SOUNDNESS (billy): the open-scope test is `holeSources() ∩ S ≠ ∅`, NOT the naive
//                          `reverseCallers(target) == []` — the latter reads `[]` for a local/undefined target
//                          over an OPEN world too, which is the exact false-negative §0 forbids.
//                          ADR-0016 (#99): when the TWO v2 closure legs (`targetEscapes`+`dynamicReach`) are
//                          wired, the OPEN test is REPLACED by the SOUND TARGET-RELATIVE gate
//                          (`¬escape(X) ∧ ¬dynamic-reach(S)`) — abstaining `escape-open` / `scope-dynamic` — which
//                          admits the ~92% of real files the blanket `holeSources() ∩ S` abstains (≈0 recall).
//                          The blanket stays as the fallback (either leg absent): the door never runs a half-gate.
//   §3 grounding         : constructed AT ADMIT — ONE `kind:'directory'` entry at S whose `subtreeHash` is S's
//                          CURRENT folded scope-Merkle (`resolveCurrent`, the insertion-sensitive dir hash a
//                          new caller entering S drifts). `edgeModel` stamped = the extractor release (§3
//                          clause 4, the ONE completeness clause `driftDetect` cannot see).
//   gate 2.1 ANCHOR/AUTHZ: the ANCHOR binds on the negation's OWN witness `scope` (the assertion IS about S)
//                          and `primaryAnchorId` is NEVER called — a negation routes by `negationKey`. The
//                          AUTHZ gate binds `authzScope ?? scope` (F3, WP-96-N): absent ⇒ the witness `scope`
//                          exactly as #99b shipped (human negations unchanged), present ⇒ the separate
//                          `authzScope` (a MINED negation binds `atlas:mined` while keeping its witness identity).
//   gates 2.25 / 2.5 / 3 : incumbent keyed on `negationKey`, ratify as ADVISORY-class (no `check`), upsert+put
//                          with family 'negation' — VERBATIM the main door's atomic-commit machinery, reused.
//
// The `∩ S` containment is the SAME segment-wise `underScope` predicate the read projection scopes on — NOT a
// second string-containment (the ADR-0010 "one predicate, two consumers" rule; #153 containment lesson). A
// docHash is "in S" iff its repo-relative FILE PATH (recovered from the spatial axis) is UNDER S.

import type { CasObject } from "@atlas/kernel"
import type { Hash, NodeKey, Tier } from "@atlas/contracts"
import {
  upsert,
  route,
  stage,
  ratify,
  isTier,
  isScope,
  negationKey,
  isKnownRelationKind,
  isGrounded,
} from "@atlas/knowledge"
import type {
  Candidate,
  CurrentNode,
  NegationNode,
  AbstainedRecord,
  RelationKind,
  RatifyToken,
  StoreProjection,
  WriteRequest,
} from "@atlas/knowledge"
import { isLocalSymbol } from "@atlas/index"
import type { Axes, IndexNode, SymbolReverseApi } from "@atlas/index"
import { resolveCurrent } from "@atlas/grounding"
import type { Grounding } from "@atlas/grounding"
import type { EmitOut } from "@atlas/tools"
import type { GovernedEmitDeps } from "./governed-emit.js"
import { addressOf, commitRefusalOf } from "./governed-emit-address.js"
import { actorInScope, scopeOwnsAnchor } from "./policy.js"
import { incumbentDecision } from "./governed-emit-incumbent.js"
import { ratifyCtxFor } from "./governed-emit-route.js"
import { deriveFastPathVerdicts } from "./governed-emit-gates.js"
import { underScope } from "./anchor-scope.js"
import {
  REJECTED_CONTENDED,
  REJECTED_UNREADABLE_STORE,
  REJECTED_UNAUTHORIZED,
  REJECTED_UNAUTHORIZED_ANCHOR,
  REJECTED_UNRATIFIED,
} from "./governed-emit-reasons.js"
import { REJECTED_UNTRUSTED_STORE } from "./read-provenance.js"
import type { CommitResult } from "./sidecar.js"

/**
 * The NEGATION LEG's extra deps — the channels ONLY a negation reads, folded into `GovernedEmitDeps` (which
 * `extends` this) so they live WITH the leg that consumes them (the cohesive seam, not a line-count dodge).
 * ADDITIVE + OPTIONAL: absent (the bare-WIRE fake assembly, or any non-negation caller) ⇒ a negation cannot be
 * proven closed AND cannot be grounded ⇒ the door ABSTAINS fail-closed. No non-negation write reads any of them.
 */
export interface NegationEmitDeps {
  /** The N0 symbol-level reverse-caller view (`reverseCallers`/`holeSources`) — the completeness feed. */
  readonly symbolReverse?: () => SymbolReverseApi
  /** The SAME live axes the truth-gate rides — resolves S's folded subtree-Merkle (§3) + file paths for `∩ S`. */
  readonly axes?: Axes
  /** The sealed-kernel path→docHash keying (`id({file:p})`) — maps a feed docHash back to its path for `∩ S`. */
  readonly nodeHashOfPath?: (path: string) => Hash
  /** The pinned extractor release (`IndexerPlan.version`) stamped onto an admitted negation's `edgeModel` (§3
   *  clause 4 — the ONE completeness clause `driftDetect` cannot see: an upgrade changes no file bytes). */
  readonly edgeModel?: string
  /**
   * ADR-0016 (#99, target-relative completeness) — the TWO v2 closure legs. When BOTH are wired the door runs
   * the SOUND target-relative gate (`¬escape(X) ∧ ¬dynamic-reach(S)`) instead of the canon blanket
   * `holeSources() ∩ S` — which abstains on ~92% of real files (any hole anywhere in S) and yields ~0 recall.
   * ADDITIVE + OPTIONAL: absent (a legacy caller, or only one leg wired) ⇒ the door FALLS BACK to the sound
   * blanket `scope-open` test EXACTLY as #99b shipped. Wiring only ONE of the two is treated as absent (both
   * legs are required to prove closure) — the door never runs a half-gate.
   *
   * `targetEscapes(target)` — the escape sites of X (the ADR-0016 `escape(X)` predicate, computed by the
   * language-blind escape engine over X's occurrences ⋈ tree-sitter). EMPTY ⇒ X does not escape ⇒ every use of
   * X is a static reference the index already sees (a pure-TYPE X is trivially non-escaping — its refs are all
   * type-position, so it returns empty here too). NON-EMPTY ⇒ ABSTAIN `escape-open`, witness = the sites.
   * CALLER CONTRACT: X and every occurrence MUST be canonicalized (`@atlas/index canonicalizeSymbol`) BEFORE
   * the engine runs — an un-canonicalized cross-package ref makes a real escape invisible (a false-admit).
   */
  readonly targetEscapes?: (target: string) => readonly string[]
  /**
   * `dynamicReach(scope)` — the opaque runtime channels IN S (`import(nonliteral)` | `require(nonliteral)` |
   * `ns[nonliteral]` on a namespace-import binding | `eval` | `new Function`) that could reach ANY target with
   * NO emitted occurrence, defeating the occurrence-based escape/reverse-caller closure. EMPTY ⇒ S has no such
   * channel. NON-EMPTY ⇒ ABSTAIN `scope-dynamic`, witness = the channels. This is the catch-all that closes the
   * one false-admit the pure escape check cannot (a static `import * as ns; ns[key]()` reaching X invisibly).
   */
  readonly dynamicReach?: (scope: string) => readonly string[]
}

/** Malformed-negation refusal (fail-closed verdict) — the door's own gate-0.1 shape check on the caller's OWN
 *  payload, disclosing nothing about any incumbent. Distinct from an ABSTENTION: a malformed triple has no
 *  well-formed address to abstain AT, whereas a well-formed-but-undecidable negative earns a durable record. */
export const REJECTED_MALFORMED_NEGATION =
  "malformed negation: a negation identity is the triple (relationKind, target, scope). target and scope must " +
  "each be a non-empty string and relationKind must be a closed-vocabulary member (depends-on | calls). This " +
  "reads the payload's OWN shape and is refused before any completeness check, so it discloses nothing"

/** The negative is FALSE — a real caller of the target EXISTS in the closed scope (`reverseCallers ∩ S ≠ ∅`).
 *  A REJECTION, not an abstention: the door DECIDED, and it decided against the claim. No durable record. */
export const REJECTED_NEGATION_REFUTED =
  "negation refuted: a caller of the target EXISTS within the closed scope, so the negative is FALSE (this is " +
  "a decision, not an abstention — the scope was closed and a witness against the claim was found)"

/** The three ABSTENTION verdicts the EmitOut carries back (emitted:false). The DURABLE evidence is the
 *  `AbstainedRecord` written into `projection.abstained` at the SAME `negationKey` address; these strings are
 *  the door's transport-visible echo of that record's `reason`, so an abstention reads as a refusal (exit 2 /
 *  MCP isError), never a silent success. The reader (N3) surfaces the record itself. */
const REASON_TEXT: Readonly<Record<AbstainedRecord["reason"], string>> = {
  "scope-open":
    "abstained (scope-open): the negated relation is UNDER-APPROXIMATED over this scope — an unresolved/dynamic " +
    "reference lives in S, so absence of a caller cannot be proven. A durable AbstainedRecord was written; read " +
    "it back with the negation read surface. Close the scope (resolve the hole) or narrow S, then re-emit",
  "target-not-global":
    "abstained (target-not-global): the target is a `local ` SCIP symbol, document-scoped by the grammar — its " +
    "callers are intra-document (a different closed procedure), out of #99b v1 scope. Name the GLOBAL symbol",
  "scope-empty":
    "abstained (scope-empty): the scope directory S does not resolve on the spatial rail, so it cannot be " +
    "grounded (a negation grounds against S's folded subtree-Merkle). Name a directory that exists in the tree",
  "target-unresolvable":
    "abstained (target-unresolvable): the target is a GLOBAL symbol Atlas cannot see DEFINED in this index, so " +
    '"it is not called in S" would be VACUOUSLY true — a negative about a phantom, not a groundable fact. A ' +
    "durable AbstainedRecord was written; read it back with the negation read surface. Name a symbol that " +
    "resolves to a definition Atlas can see (or index the module that defines it), then re-emit",
  "escape-open":
    "abstained (escape-open): the target X ESCAPES — a reference of X sits in a non-safe position (an argument, " +
    "an assignment RHS, a collection element, a member/subscript base, or the operand of `X as T`), so X flows " +
    "into shared mutable state where a scope that never imports X could still reach it at runtime. The index " +
    'under-sees X, so "uncalled in S" cannot be proven. A durable AbstainedRecord was written (witness = the ' +
    "escape sites); read it back with the negation read surface (ADR-0016)",
  "scope-dynamic":
    "abstained (scope-dynamic): the scope S has an OPAQUE runtime channel (import(nonliteral) | require(nonliteral) " +
    "| ns[nonliteral] | eval | new Function) that could reach the target with NO emitted occurrence, defeating " +
    "the occurrence-based closure. A durable AbstainedRecord was written (witness = the channels); read it back " +
    "with the negation read surface. Remove the dynamic channel or narrow S, then re-emit (ADR-0016)",
}

/** Build the ABSTAINED emitted-false verdict + its durable record at the negation's own `negationKey`. */
function abstainOut(reason: AbstainedRecord["reason"]): EmitOut {
  return { emitted: false, rejected: REASON_TEXT[reason] }
}

/** Walk the spatial axis once and index every path-node by its docHash — `nodeHashOfPath(node.key)` — so a
 *  docHash returned by the N0 feed (`reverseCallers`/`holeSources`, both keyed by `nodeHashOfPath(path)`) can
 *  be mapped BACK to its repo-relative file path and tested against the scope with `underScope`. `::` AST
 *  refinement keys are skipped (they are not file docHashes). Deterministic, pure. */
function indexPathsByHash(spatial: IndexNode, nodeHashOfPath: (p: string) => Hash): Map<string, string> {
  const byHash = new Map<string, string>()
  const walk = (node: IndexNode): void => {
    if (!node.key.includes("::")) byHash.set(String(nodeHashOfPath(node.key)), node.key)
    for (const child of node.children) walk(child)
  }
  walk(spatial)
  return byHash
}

/** The subset of `hashes` whose file path (recovered from `byHash`) lies UNDER the directory scope `S` — the
 *  `∩ S` operator, computed on the SAME `underScope` predicate the read projection uses (never a second
 *  containment). A hash with no known path is NOT in scope (fail-closed). Returns the offending hashes as
 *  strings (the witness form). */
function inScope(hashes: readonly Hash[], byHash: ReadonlyMap<string, string>, scope: string): string[] {
  const out: string[] = []
  for (const h of hashes) {
    const path = byHash.get(String(h))
    if (path !== undefined && underScope(path, scope)) out.push(String(h))
  }
  return out.sort()
}

/**
 * THE NEGATION DOOR. Returns the frozen `EmitOut`. Fail-closed at every gate; on ADMIT it constructs the §3
 * grounding, routes through the SAME KNOW-15 upsert + KNOW-8 ratify machinery the main door uses, and — the §2
 * supersede — DELETES any abstention standing at the same `negationKey` as it lands the fact in `current`. On
 * an abstention it writes the `AbstainedRecord` durably (through `commitProjection`, NOT `upsert` — the
 * abstention is not a fact). Pure of clock/random given a pure store/policy/feed.
 */
export function emitNegation(deps: GovernedEmitDeps, raw: NegationNode): EmitOut {
  // gate 0 — the payload fields the later gates route on (mirrors the main door's gate 0).
  const tier = raw.tier
  if (!isTier(tier)) return { emitted: false, rejected: REJECTED_MALFORMED_NEGATION }
  const scope = raw.scope
  if (!isScope(scope)) return { emitted: false, rejected: REJECTED_MALFORMED_NEGATION }
  const target = raw.target
  const relationKind = raw.relationKind
  // gate 0.1 WELL-FORMED — a malformed triple has no address to abstain at (fail-closed REFUSE).
  if (typeof target !== "string" || target.length === 0 || !isKnownRelationKind(relationKind)) {
    return { emitted: false, rejected: REJECTED_MALFORMED_NEGATION }
  }
  // The negation's address — the SAME address an abstention or a later admitted negation takes (§2). Cannot
  // throw: the three legs above already passed `negationKey`'s own total-over-unknown guard.
  const key = negationKey(relationKind, target, scope)
  const record = (reason: AbstainedRecord["reason"], underApproxSources: readonly string[]): AbstainedRecord => ({
    kind: "abstained",
    id: key,
    relationKind: relationKind as RelationKind,
    target,
    scope,
    reason,
    witness: { underApproxSources },
  })

  // gate 0.1 (target GLOBAL) — a `local ` symbol is document-scoped; its callers are intra-doc ⇒ ABSTAIN.
  if (isLocalSymbol(target)) return writeAbstention(deps, key, record("target-not-global", []))

  // The completeness feed + the live axes must both be wired to decide closure at all. Absent (the bare-WIRE
  // fake assembly) ⇒ the scope cannot be proven closed AND cannot be grounded ⇒ ABSTAIN scope-empty (honest
  // fail-closed: no negation is admitted without the machinery to prove it).
  const axes: Axes | undefined = deps.axes
  const symbolReverse: SymbolReverseApi | undefined = deps.symbolReverse?.()
  const nodeHashOfPath = deps.nodeHashOfPath
  if (axes === undefined || symbolReverse === undefined || nodeHashOfPath === undefined) {
    return writeAbstention(deps, key, record("scope-empty", []))
  }

  // gate 1 — THE ABSTENTION GATE, in the contract's normative order.
  //   (a) S resolves on the spatial rail? Its folded subtree-Merkle IS the §3 grounding witness — no
  //       resolution ⇒ ungroundable ⇒ ABSTAIN scope-empty.
  const subtreeHash = resolveCurrent(axes, scope)
  if (subtreeHash === undefined) return writeAbstention(deps, key, record("scope-empty", []))

  const byHash = indexPathsByHash(axes.spatial, nodeHashOfPath)
  //   (b) THE SCOPE-CLOSURE TEST — the crux. ADR-0016 (#99, target-relative completeness): when BOTH v2 legs
  //       are wired, run the SOUND TARGET-RELATIVE gate (`¬escape(X) ∧ ¬dynamic-reach(S)`), which ADMITS the
  //       ~92% of real files the canon blanket `holeSources() ∩ S` abstains (any hole ANYWHERE in S ⇒ ~0
  //       recall). Absent (a legacy caller, or only ONE leg) ⇒ FALL BACK to that blanket, byte-identical to
  //       #99b (sound, low-recall — the door never runs a half-gate). BOTH branches then share (c)/(d).
  const targetEscapes = deps.targetEscapes
  const dynamicReach = deps.dynamicReach
  if (targetEscapes !== undefined && dynamicReach !== undefined) {
    // v2 TARGET-RELATIVE. Order: phantom guard first (target-relative, the most basic), then X's closure, then S's.
    //   (c0) TARGET RESOLVES? — #220. A phantom's negative is vacuous; abstain BEFORE the closure legs, whose
    //        escape/dynamic verdicts about a symbol Atlas cannot see defined would be meaningless.
    if (!symbolReverse.resolves(target)) return writeAbstention(deps, key, record("target-unresolvable", []))
    //   (b0) COLLAPSED CROSS-PACKAGE REF (#99 — the wired production false-PROVEN). A doc in S carrying a
    //        `reference`-role `local ` with NO local def is a cross-package call the indexer collapsed onto an
    //        opaque `local` — its real target VANISHES from `reverseCallers`/`holeSources`/`targetEscapes` (all
    //        drop `local ` symbols), so the occurrence-based closure (b1)/(b2) below cannot see it and (c)'s
    //        `reverseCallers(X) ∩ S` is INCOMPLETE. v2 deliberately IGNORES the CLASS-1 benign external holes
    //        (`holeSources()`) to keep recall, but this CLASS-2 opaque set could be the very hidden caller of X
    //        ⇒ the target-relative gate is not closed over S ⇒ ABSTAIN scope-open (witness = the opaque docs).
    //        This is the ONLY hole class that gates v2.
    const opaqueInScope = inScope(symbolReverse.opaqueRefSources(), byHash, scope)
    if (opaqueInScope.length > 0) return writeAbstention(deps, key, record("scope-open", opaqueInScope))
    //   (b1) DOES X ESCAPE? A non-safe reference position flows X into shared state the index under-sees ⇒
    //        "uncalled in S" is unprovable ⇒ ABSTAIN escape-open (witness = the sites). SOUNDNESS: with ¬escape,
    //        disjointness (symbol-reverse.ts) makes every reference of X a resolved caller OR a hole-that-is-not-X,
    //        so gate (c)'s `reverseCallers(X) ∩ S == ∅` becomes a COMPLETE "no reference to X in S".
    const escapeSites = targetEscapes(target)
    if (escapeSites.length > 0) return writeAbstention(deps, key, record("escape-open", [...escapeSites].sort()))
    //   (b2) DOES S HAVE A DYNAMIC CHANNEL? An opaque `import(nonliteral)`/`ns[key]`/`eval` could reach X with
    //        NO emitted occurrence, defeating the occurrence-based closure ⇒ ABSTAIN scope-dynamic (witness).
    const dynChannels = dynamicReach(scope)
    if (dynChannels.length > 0) return writeAbstention(deps, key, record("scope-dynamic", [...dynChannels].sort()))
  } else {
    //   FALLBACK (v2 machinery absent) — the #99b canon blanket, UNCHANGED. `holeSources() ∩ S` is the SOUND
    //   over-approximation: an unresolved/dynamic reference ANYWHERE in S under-approximates the graph ⇒ ABSTAIN
    //   scope-open, WITH the offending docHashes as the witness (durable + readable, NOT a silent refuse).
    //   ⚠ This is the SOUND condition — `holeSources() ∩ S`, NOT `reverseCallers(target) == []`.
    //   The blanket is the UNION of CLASS-1 `holeSources()` AND CLASS-2 `opaqueRefSources()` (#99 — a collapsed
    //   cross-package `local ` ref, invisible to `holeSources`): either inside S under-approximates the graph.
    const openSources = inScope([...symbolReverse.holeSources(), ...symbolReverse.opaqueRefSources()], byHash, scope)
    if (openSources.length > 0) return writeAbstention(deps, key, record("scope-open", openSources))
    //   (c0) TARGET RESOLVES? #220 — `reverseCallers(target)` is `[]` for a global symbol with NO in-index
    //        definition BY CONSTRUCTION (symbol-reverse.ts), so without this gate the (d) admit below would
    //        ground "target is not called in S" for a PHANTOM — a negative about a symbol Atlas cannot see
    //        defined, VACUOUSLY true and indistinguishable from a genuinely-uncalled real symbol. Cannot prove
    //        the negative is MEANINGFUL ⇒ ABSTAIN (honest fail-closed), never admit. It is neither refuted (no
    //        proven caller) nor scope-open (S may be perfectly closed); the defect is the TARGET, so it earns its
    //        own reason. Ordered after the scope gates (a/b) — an unresolvable scope is the more basic refusal.
    if (!symbolReverse.resolves(target)) return writeAbstention(deps, key, record("target-unresolvable", []))
  }
  //   (c) a real caller in S? The negative is FALSE ⇒ REJECT (a decision, not an abstention — no record).
  //       SOUND in BOTH branches: v2 established X's closure (b1) so `∩ S == ∅` is complete; the fallback
  //       established S's closure (no holes) so a resolved caller is the only remaining reference form.
  const callersInScope = inScope(symbolReverse.reverseCallers(target), byHash, scope)
  if (callersInScope.length > 0) return { emitted: false, rejected: REJECTED_NEGATION_REFUTED }

  //   (d) callers∩S == ∅ ∧ holes∩S == ∅ ∧ S resolves ⇒ ADMIT with the §3 directory grounding.
  const grounding: Grounding = {
    entries: [{ anchor: { kind: "directory", qualifiedPath: scope, subtreeHash }, path: scope }],
  }
  // SEAL IS TRUSTED IFF THE WRITE IS PROMOTE-ORIGIN (billy #96-wave → SEAL-PROMOTE-CARRY). Same law as the
  // main door: `seal` (`proven`) is a forgeable trust signal, and `origin` is DOOR-DERIVED (never from the
  // payload). A `promoted` negation is a mined fact re-emitted from content-addressed staging (the trusted
  // admit path), so its `seal` survives onto `node` (which is `put` into CAS); an AUTHORED negation (`atlas
  // emit {kind:'negation', seal:'proven'}`) carries an UNTRUSTED payload, so its `seal` is stripped off `node`
  // before it can reach the CAS bytes — closing the dormant leak the main door had already closed at gate 0.
  const { seal: _rejectedOperatorSeal, ...rawNoSeal } = raw
  const node: NegationNode = {
    ...(deps.origin === "promoted" ? raw : rawNoSeal),
    id: key, // MINTED, never trusted from the payload
    tier,
    scope,
    grounding, // CONSTRUCTED here — §3
    edgeModel: deps.edgeModel ?? "", // the extractor release at emit — §3 clause 4
  }

  // 0.5 ADDRESSABLE — mint the content address off the constructed node, refusing (not throwing) a canonical-
  //     form violation, exactly as the main door does.
  const addressed = addressOf(node)
  if (addressed.rejected !== undefined) return { emitted: false, rejected: addressed.rejected }
  const contentHash = addressed.hash

  // 2. AUTHZ — the actor must be in the negation's AUTHZ scope. F3 (WP-96-N, owner-ratified 2026-08-11): the
  //    gate binds `node.authzScope ?? scope`. ABSENT ⇒ binds the witness `scope` EXACTLY as before (a human
  //    `atlas emit` negation carries no `authzScope`, so it still needs authority over the very scope it
  //    asserts about — #99b back-compat, UNCHANGED). PRESENT ⇒ binds `authzScope`, so a MINED negation can keep
  //    its witness directory as IDENTITY (the real scoped-negative) while the orchestrator's `atlas:mined`
  //    grant authorizes it. This is the ONLY behavioural change to the door's authz; identity (`negationKey`
  //    over the witness `scope`) and the honest-abstention law (both above) are untouched — they never read it.
  // GUARD (billy #96-wave): `node.authzScope` MUST be a trusted, NON-caller-supplied constant (today ONLY the
  // miner's hard-wired `MINED_SCOPE`, stamped in `mine-decide.ts`). Binding `authzScope ?? scope` weakens "only
  // an owner of S writes facts scoped to S" to "any authzScope-holder"; that is sound ONLY while no untrusted
  // path can set `authzScope`. A future caller-supplied `authzScope` would need a NEW guard here before this gate.
  const authzScope = node.authzScope ?? scope
  if (!actorInScope(deps.policy, deps.actor, authzScope)) return { emitted: false, rejected: REJECTED_UNAUTHORIZED }
  // 2.1 ANCHOR — bind the write scope on the negation's OWN scope. `primaryAnchorId` is NOT called: a negation
  //     is anchored at the scope directory and routes by `negationKey`. Reuses the existing scope-authz path.
  if (!scopeOwnsAnchor(deps.policy, scope, scope)) return { emitted: false, rejected: REJECTED_UNAUTHORIZED_ANCHOR }

  // The advisory-CLASS candidate view (no `check`) the ratify gate reads (`tier`/`grounding`). A negation
  // ratifies on the advisory path — its IDENTITY is `negationKey`, NOT nodeKey-of-this-view.
  const candidateView = { ...node, slot: undefined } as unknown as Candidate

  // ── THE ATOMIC COMMIT (2.25 → 3) — ONE decision over ONE snapshot, re-run from scratch on a lost race, so it
  //    MUST carry the gates, not merely the state change (the confused-deputy-by-retry rule, see store.ts).
  let committed: CommitResult<EmitOut>
  try {
    committed = deps.store.commitProjection<EmitOut>((projection) => {
      // 2.25 INCUMBENT — keyed on `negationKey`. A prior ABSTENTION lives in `projection.abstained`, NOT
      //      `current`, so it is not an incumbent here (its supersede is the delete below).
      const incumbent: CurrentNode | undefined = projection.current.get(String(key))
      let derivedTier: Tier | undefined
      if (incumbent !== undefined) {
        const decision = incumbentDecision(deps, incumbent, node, tier)
        if (decision.refusal !== undefined) return { out: { emitted: false, rejected: decision.refusal } }
        derivedTier = decision.derivedTier
      }
      // 2.5 RATIFY — advisory-class routing. A T2 grounded negation auto-accepts; a T0 needs the billy token.
      //    ARCH-D3b (INV-AUTH-15): DEVIVED verdicts — `lowRisk` from groundedness (a negation carries no
      //    HEAD truth gate; the closest real verdict is well-formed + grounded), `contested` from a
      //    conflicting incumbent (KNOW-18b).
      if (
        route(
          candidateView,
          ratifyCtxFor(derivedTier, deriveFastPathVerdicts(isGrounded(node.grounding), false), deps.origin),
        ) === "full-ratify"
      ) {
        const token: RatifyToken = { by: deps.ratifyToken ?? "" }
        if (!ratify(stage(candidateView), token).committed)
          return { out: { emitted: false, rejected: REJECTED_UNRATIFIED } }
      }
      // 3. UPSERT + PUT — family 'negation'; the row carries (scope, tier) + the ADR-0007 governance carrier.
      const req: WriteRequest = {
        nodeKey: String(key),
        contentHash: contentHash as unknown as string,
        family: "negation",
        claimNorm: `NOT(${target} ${relationKind})@${scope}`,
        primaryAnchor: scope, // the scope directory the negation is anchored at (bound at gate 2.1)
        // IDENTITY CARRIERS onto the row — `negationsOf` (knowledge/read/negations.ts) reads the target off
        // `endpointB` and the kind off `relationKind` and SKIPS a row missing either, so a door-emitted negation
        // is invisible to `atlas negations` without these (lucy P0). `endpointA` (the subject) stays ABSENT: a
        // negation quantifies the subject away — it is ¬∃·→X, about the OBJECT X only.
        endpointB: target,
        relationKind,
        scope,
        tier,
      }
      const upserted = upsert(projection, req).store
      // §2 SUPERSEDE — "couldn't decide" → "decided false": drop any abstention at this address as the fact lands.
      const abstained = new Map(projection.abstained ?? [])
      abstained.delete(String(key))
      const next: StoreProjection = {
        current: upserted.current,
        cas: upserted.cas,
        ...(abstained.size > 0 ? { abstained } : {}),
        ...(projection.builtAt !== undefined ? { builtAt: projection.builtAt } : {}),
      }
      return { out: { emitted: true, id: contentHash }, next, put: [node as CasObject] }
    })
  } catch (e) {
    return { emitted: false, rejected: commitRefusalOf(e) }
  }
  if (committed.settled) return committed.out
  return { emitted: false, rejected: commitRefusalFor(committed.refusal) }
}

/** Write a durable `AbstainedRecord` into `projection.abstained` at `key` through the atomic projection door
 *  (NOT `upsert` — the reducer is for facts, and an abstention asserts nothing). Carries `current`/`cas`
 *  forward untouched. Returns the abstention verdict, or a visible commit refusal. */
function writeAbstention(deps: GovernedEmitDeps, key: NodeKey, rec: AbstainedRecord): EmitOut {
  let committed: CommitResult<EmitOut>
  try {
    committed = deps.store.commitProjection<EmitOut>((projection) => {
      const abstained = new Map(projection.abstained ?? [])
      abstained.set(String(key), rec)
      const next: StoreProjection = {
        current: projection.current,
        cas: projection.cas,
        abstained,
        ...(projection.builtAt !== undefined ? { builtAt: projection.builtAt } : {}),
      }
      return { out: abstainOut(rec.reason), next }
    })
  } catch (e) {
    return { emitted: false, rejected: commitRefusalOf(e) }
  }
  if (committed.settled) return committed.out
  return { emitted: false, rejected: commitRefusalFor(committed.refusal) }
}

/** The commit's own visible refusals (door stage 5), shared by both legs above — never a silent no-op. */
function commitRefusalFor(refusal: "contended" | "unreadable" | "untrusted"): string {
  return refusal === "contended"
    ? REJECTED_CONTENDED
    : refusal === "untrusted"
      ? REJECTED_UNTRUSTED_STORE
      : REJECTED_UNREADABLE_STORE
}
