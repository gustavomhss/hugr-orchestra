// @atlas/adapter-io — src/relation-derive.ts  (#99 sound relation, ADR-0018 — WP-R3: the MECHANICAL projection)
//
// The heart of the sound-relation feature: derive PROVEN `depends-on` relations MECHANICALLY from the index —
// NO LLM, ever. It reuses the SAME symbol-reverse data the R2 oracle proves against (`createSymbolReverse`,
// @atlas/index) so the generator and the verifier are the ONE deterministic index (the sound-arm thesis at its
// limit — 0-false by construction, model-independent). For every GLOBAL symbol S defined in doc `docB`, each
// caller doc `docA` (`reverseCallers(S)`) that is a DISTINCT intra-repo document (D-c/D-e) is a witnessed
// cross-unit reference `docA → docB`. That edge is projected to a `depends-on` RelationProposal carrying the
// R2 ORACLE LEGS (`target: S`, `sourceScope: unitScopeOf(docA)` — the SAME scope derivation the dependency arm
// uses, `llm.ts`), and ADMITTED THROUGH THE FROZEN R2 `admit` PATH (injected `admit` seam) so the sound oracle
// PROVES + SEALS it. This module invents NO admission and mints NO identity of its own — `admit`/`buildSoundRelation`
// (@atlas/genesis) own those. It only ENUMERATES, FILTERS (D-c), DEDUPS (D-b), and enforces the BUDGET (AR-28/30).
//
// SCOPE (what this leaf owns): the projection algorithm. What it does NOT own, and takes as injected seams
// because they need the built `Axes` that live ABOVE this leaf: the 2-entry relation grounding receipt
// (`groundFor`) and the R2 admit path itself (`admit`, closing over the truth door + the sound `verifyRelation`
// leg). WP-R7 wired the production caller — `runDeriveRelations` (`relation-derive-run.ts`) composes these
// seams over the built `Axes` and drives this projection from the shipped `atlas derive-relations` verb; a
// test wires the same seams over a fixture index. Pure + total: no clock, no IO, no model — the ONLY throw is
// the fail-loud budget breach (AR-30), which is a REFUSAL, never a partial set mislabelled complete.
//
// SHIPPED (no longer a reference model): the three exported VALUES (`deriveRelations`, `deriveRelationEdges`,
// `RelationBudgetExceededError`) now have a production caller — `relation-derive-run.ts` value-imports
// `deriveRelations` (and re-raises `RelationBudgetExceededError` as an AR-30 over-budget outcome), reached from
// the composition root (`compose.ts` → `ComposedRuntime.deriveRelations`) and the `atlas derive-relations` CLI
// verb. The `reference-model-guard.mjs` ledger row for this file was DELETED when that wiring landed (the
// `own.ts` moved-dead→live precedent). Its acceptance suite (`test/relation-derive.test.ts`) drives it against
// a fixture index through the frozen R2 `admit` path.

import { relationKey } from "@atlas/knowledge"
import type { RelationNode } from "@atlas/knowledge"
import type { Admission, Candidate, FactGrounding, RelationProposal } from "@atlas/genesis"
import type { Hash } from "@atlas/contracts"
import { createSymbolReverse, isLocalSymbol, nodeHashOfPath } from "@atlas/index"
import type { ScipOutput } from "@atlas/index"
import { unitScopeOf } from "./llm.js"

/** The directed intra-repo edge the projection resolves BEFORE admission — a caller file (`endpointA`) that
 *  witnessed a cross-unit reference to a global symbol (`target`) defined in another file (`endpointB`). The
 *  relation kind is always `depends-on` (F3/§2.3 — SCIP has no call-role, so `calls` is not mechanically
 *  provable and this projection never emits it). `sourceScope` is `endpointA`'s verify-scope directory, the
 *  argument the R2 `verifyRelation` oracle re-proves the edge against. */
export interface DerivedRelationEdge {
  readonly endpointA: string // caller file path (repo-relative) — the directed relation's SUBJECT
  readonly endpointB: string // defining file path (repo-relative) — the OBJECT
  readonly relationKind: "depends-on"
  readonly target: string // the global SCIP symbol under endpointB whose witnessed reference proves the edge
  readonly sourceScope: string // unitScopeOf(endpointA) — the directory the witnessed reference must lie under
}

/** The injected seams `deriveRelations` cannot build for itself at this layer. */
export interface DeriveRelationDeps {
  /** The SCIP projection to derive over — the SAME one `createSymbolReverse` and the R2 oracle ride. */
  readonly scipOutput: ScipOutput
  /** The indexer identity (`scip-typescript`) threaded into `createSymbolReverse` so the collapsed-local gate
   *  is trusted only under the supported indexer. Absent ⇒ fail-closed heuristic (identical to production). */
  readonly indexerName?: string | undefined
  /**
   * The FROZEN R2 admit path — the caller closes over `admit(proposal, adminDeps)` (@atlas/genesis) with the
   * truth door AND the sound `verifyRelation` oracle leg wired. `deriveRelations` BUILDS the proposal (endpoints
   * + oracle legs + grounding); this seam casts the mechanical verdict and mints the `proven` seal + witness.
   * Injected (not `admit` imported directly) so the whole admission — door + oracle wiring — is the caller's one
   * responsibility, exactly as `buildMineAdmission` composes it for the mine path.
   */
  readonly admit: (proposal: RelationProposal) => Admission
  /**
   * The 2-entry relation grounding receipt for a directed pair (`endpointA` path, `endpointB` path) — entry[0]
   * anchors A, entry[1] anchors B (the AND-folded freshness the relation truth door checks). Injected because
   * it is built by `ground`/`reground` over the composed `Axes`, which live above this leaf. A receipt with NO
   * entries (an endpoint that does not resolve) is a groundless edge: it can never be PROVEN, so it contributes
   * nothing to the proven set and is skipped — never fabricated an anchor for.
   */
  readonly groundFor: (endpointA: string, endpointB: string) => FactGrounding
  /**
   * The exhaustive-projection ROW-COUNT CEILING (F2 — a dependency graph is only useful complete, but must not
   * be silently unbounded). If the resolved distinct-edge set EXCEEDS this, the run FAILS LOUD
   * (`RelationBudgetExceededError`) — it NEVER returns a partial set labelled complete (AR-30).
   */
  readonly maxRelations: number
}

/** The projection's outcome — the admitted relation facts plus the RECORDED budget metric (AR-28). `incomplete`
 *  is always `false` on a returned result: an over-budget run THROWS rather than returning a partial set, so a
 *  caller can never read a truncated projection as a complete exhaustive one. The field is kept for callers that
 *  prefer to branch on it after catching the error at their own boundary. */
export interface DeriveRelationsResult {
  /** Every admitted relation fact — proven where the oracle proved the edge (`seal:'proven'` + `witness`). */
  readonly relations: readonly RelationNode[]
  /** The subset of {@link relations} the sound oracle PROVED (`seal === 'proven'`) — the product of this pass. */
  readonly proven: readonly RelationNode[]
  /** The number of DISTINCT resolved intra-repo edges the projection resolved (AR-28 — recorded, not silently
   *  unbounded). Equal to the number of admissions attempted; ≤ `maxRelations` on any returned result. */
  readonly resolvedEdgeCount: number
  /** Always `false` on a returned result (over-budget THROWS — AR-30). Present for a caller's own branching. */
  readonly incomplete: false
}

/** The fail-loud budget breach (AR-30). Thrown — NEVER swallowed into a partial `DeriveRelationsResult` — so an
 *  exhaustive run that would exceed the ceiling is a REFUSAL a caller must handle, not a silently truncated set. */
export class RelationBudgetExceededError extends Error {
  readonly name = "RelationBudgetExceededError"
  constructor(
    readonly resolvedEdgeCount: number,
    readonly maxRelations: number,
  ) {
    super(
      `relation projection resolved ${resolvedEdgeCount} distinct intra-repo edges, exceeding the maxRelations ` +
        `ceiling of ${maxRelations} — refusing to emit a PARTIAL set labelled complete (AR-30). Raise the budget ` +
        `deliberately or scope the projection; never ship an unfalsifiable "exhaustive" run.`,
    )
  }
}

/**
 * Enumerate the DISTINCT resolved intra-repo directed edges from the index — the pure projection core, split
 * from admission so the edge set (and its budget count) is testable without a truth door. Reuses
 * `createSymbolReverse`'s EXACT data (`definesAt`/`reverseCallers`), collapsing at DOCUMENT granularity (D-e):
 *
 *   - the S set = every NON-`local` symbol carrying a `definition` occurrence (first-definition-wins, byte-for-
 *     byte `createSymbolReverse`'s `defs`), enumerated over `scipOutput` (the ONE source the reverse view is
 *     built from) — the interface exposes no symbol list, so it is derived from the same feed, not invented.
 *   - for each such S, each `reverseCallers(S)` doc that is a DISTINCT document from S's defining doc (D-c: a
 *     cross-unit reference; D-e: same-doc is intra-unit and excluded — AR-16) yields ONE `depends-on` edge.
 *   - DEDUP (D-b): N references A→B (multiple occurrences, or multiple symbols of B referenced from A) collapse
 *     to ONE edge, keyed by `relationKey(endpointA, 'depends-on', endpointB)`. First witnessing symbol wins,
 *     deterministically (symbols sorted, callers already `String`-sorted by `reverseCallers`), so an unchanged
 *     index re-derives the byte-identical set (AR-20 idempotence).
 *
 * A caller whose target is EXTERNAL/non-repo (a `node_modules`/stdlib symbol) is excluded for free: such a
 * symbol has no in-index `definition`, so it is never in the S set, so no edge is minted to it (AR-15). A
 * `local ` symbol likewise never resolves (#189) and never appears here. Pure + total: never throws.
 */
export function deriveRelationEdges(
  scipOutput: ScipOutput,
  indexerName?: string | undefined,
): readonly DerivedRelationEdge[] {
  const reverse = createSymbolReverse(scipOutput, { indexerName })
  // The minimal-but-complete hash→path table — exactly the documents `createSymbolReverse` mints a
  // `nodeHashOfPath(relativePath)` for, keyed by the string form of that hash (mirrors `verify-fact-source.ts`).
  const pathByHash = new Map<string, string>()
  for (const doc of scipOutput.documents) pathByHash.set(String(nodeHashOfPath(doc.relativePath)), doc.relativePath)
  const pathOfHash = (h: Hash): string | undefined => pathByHash.get(String(h))

  // The S set: NON-`local` symbols carrying a `definition` occurrence — the same predicate `createSymbolReverse`
  // admits a symbol at all under (`resolves`). Deduped + sorted for a deterministic enumeration order (AR-20).
  const definedSymbols = new Set<string>()
  for (const doc of scipOutput.documents) {
    for (const occ of doc.occurrences) {
      if (occ.role === "definition" && !isLocalSymbol(occ.symbol)) definedSymbols.add(occ.symbol)
    }
  }

  const edgesByKey = new Map<string, DerivedRelationEdge>()
  for (const symbol of [...definedSymbols].sort()) {
    const docB = reverse.definesAt(symbol)
    if (docB === undefined) continue // no in-index definition (a phantom) — nothing to depend ON
    const pathB = pathOfHash(docB)
    if (pathB === undefined) continue // fail-closed: an unmapped def-doc is not a repo endpoint
    for (const docA of reverse.reverseCallers(symbol)) {
      if (String(docA) === String(docB)) continue // D-c/D-e/AR-16: same document ⇒ intra-unit, excluded
      const pathA = pathOfHash(docA)
      if (pathA === undefined) continue // fail-closed: an unmapped caller is not a repo endpoint (AR-15 dual)
      const key = String(relationKey(pathA, "depends-on", pathB))
      // D-b: first witnessing symbol wins — a later symbol of the same B referenced from the same A is the SAME
      // A→B edge and must not double the row. Deterministic given the sorted symbol/caller iteration.
      if (edgesByKey.has(key)) continue
      edgesByKey.set(key, {
        endpointA: pathA,
        endpointB: pathB,
        relationKind: "depends-on",
        target: symbol,
        sourceScope: unitScopeOf(pathA),
      })
    }
  }
  // Sorted by relationKey identity so the returned set is byte-stable across runs (AR-20).
  return [...edgesByKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, e]) => e)
}

/** The zero-valued mining signals for a mechanically-derived edge — a relation projected from the index carries
 *  no ranking heuristics (there was no `mine` pass). Kept explicit rather than invented: the score is a ranking
 *  input only (GEN-6), never a veto, and admission never reads it for a relation. */
const NO_SIGNALS = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] } as const

/**
 * Project the index's resolved cross-unit references to ADMITTED `depends-on` relations, PROVEN where the sound
 * oracle proves the edge — the mechanical, model-free, exhaustive derivation (F1 (M) / F2 exhaustive). The
 * pipeline: enumerate distinct edges (`deriveRelationEdges`, D-c/D-b/D-e) → enforce the BUDGET (AR-28/30) →
 * for each edge, build a `depends-on` RelationProposal carrying the R2 ORACLE LEGS and the 2-entry grounding,
 * and ADMIT it through the injected R2 `admit` path — which mints the `proven` seal + re-runnable witness.
 *
 * NO LLM anywhere (AR-23): every input is deterministic index data; the `admit` seam's oracle is the SAME
 * `verifyRelation` symbol-reverse program. It is 0-false by construction (the derivation IS the proof) and
 * model-independent. Pure + total EXCEPT the deliberate fail-loud budget throw.
 */
export function deriveRelations(deps: DeriveRelationDeps): DeriveRelationsResult {
  const edges = deriveRelationEdges(deps.scipOutput, deps.indexerName)
  const resolvedEdgeCount = edges.length
  // FAIL LOUD (AR-30) BEFORE admitting anything: an over-budget run is a refusal, never a truncated set.
  if (resolvedEdgeCount > deps.maxRelations) {
    throw new RelationBudgetExceededError(resolvedEdgeCount, deps.maxRelations)
  }

  const relations: RelationNode[] = []
  const proven: RelationNode[] = []
  for (const edge of edges) {
    const grounding = deps.groundFor(edge.endpointA, edge.endpointB)
    // A groundless edge (an endpoint that does not resolve) can never be proven — skip it rather than fabricate
    // an anchor. `groundFor` returns an empty receipt in that case; a real repo pair always resolves.
    const anchor = grounding.entries[0]?.anchor
    if (anchor === undefined) continue
    const site: Candidate = { site: anchor, signals: NO_SIGNALS, ppr: 0, rank: 0 }
    const proposal: RelationProposal = {
      kind: "relation",
      site,
      relationKind: edge.relationKind,
      endpointA: edge.endpointA,
      endpointB: edge.endpointB,
      grounding,
      tier: "T2",
      target: edge.target, // R2 oracle leg — the global symbol whose witnessed reference proves the edge
      sourceScope: edge.sourceScope, // R2 oracle leg — endpointA's verify-scope
      // The governed WRITE scope (KNOW-11) — the SUBJECT unit's directory (`endpointA`'s scope-unit, the same
      // `unitScopeOf` the `sourceScope` leg above rides). A relation carries no scope of its own until it is
      // PERSISTED: the sound-admit path (`admit`) never reads it, but the governed emit door (`governed-emit.ts`)
      // rejects a scope-less write (`MALFORMED_SCOPE`) and binds authz on it — so WP-R7's shipped store write
      // (`atlas derive-relations`) could never land the fact without it. Scoped to the directed fact's SUBJECT
      // (contract §4a: the door binds the anchor gate on `endpointA`).
      scope: edge.sourceScope,
    }
    const admission = deps.admit(proposal)
    if (admission.outcome !== "admitted") continue // ungrounded/malformed drop — no proven relation
    const fact = admission.fact
    if (fact.kind !== "relation") continue // total guard — admit only ever mints a relation for a relation proposal
    relations.push(fact)
    if (fact.seal === "proven") proven.push(fact)
  }

  return { relations, proven, resolvedEdgeCount, incomplete: false }
}
