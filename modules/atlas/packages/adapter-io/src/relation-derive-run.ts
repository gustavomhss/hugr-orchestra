// @atlas/adapter-io — src/relation-derive-run.ts  (#99 sound relation, ADR-0018 — WP-R7: the REACHABILITY seam)
//
// The production caller that makes the mechanical projection (`relation-derive.ts`, WP-R3) RUNNING CODE rather
// than a reference model. It composes — over the built `Axes` that live above the `relation-derive.ts` leaf —
// the three seams that projection cannot build for itself, then drives it end to end and PERSISTS every proven
// relation through the governed emit door:
//
//   1. the R2 ADMIT PATH: `admit(proposal, buildMineAdmission(axes, scip).deps)`. `buildMineAdmission` now
//      wires the sound `verifyRelation` leg (WP-R7 piece 1, `compose-mine-admission.ts`) over the SAME
//      `createVerifyFactLeg` oracle the dependency/count/definition legs ride — so a derived `depends-on` edge
//      admits `proven`-SEALED (with its re-runnable `RelationWitness`), never advisory. This is the ONE place a
//      relation reaches the shipped admission with an oracle behind it.
//   2. the 2-ENTRY GROUNDING receipt `groundFor(A, B)` — `ground(...)` over the composed `Axes` for BOTH
//      endpoint files (entry[0] anchors A, entry[1] anchors B), the AND-folded freshness the relation truth
//      door checks. Fail-closed: an endpoint that does not resolve yields a receipt `deriveRelations` skips.
//   3. the GOVERNED STORE WRITE `emit(node, at)` — the composition root's `origin:'promoted'` emit door (the
//      trusted channel a sound-minted proven seal survives, `governed-emit.ts`). It re-runs the truth door,
//      authz + the D-d forged-seal strip on each proven relation, then lands the seal on the durable row and
//      the witness in the CAS bytes (WP-R4). A relation that fails any gate is REFUSED, reported, not persisted.
//
// It owns NO admission decision, mints NO identity, and re-implements NO gate — every one of those belongs to
// `deriveRelations` / `admit` / the emit door. It only COMPOSES the seams and folds the per-row outcomes. Pure
// of a model (F1/AR-23: no LLM anywhere — the whole input is deterministic index data + the oracle program);
// the ONLY side effect is the governed durable write through the injected `emit`. Total: the AR-30 fail-loud
// budget breach is CAUGHT here and surfaced as an `overBudget` outcome (a refusal the CLI renders exit 2),
// never a partial set mislabelled complete and never an uncaught throw.

import { admit } from "@atlas/genesis"
import type { FactGrounding, RelationProposal } from "@atlas/genesis"
import { ground } from "@atlas/grounding"
import type { GroundedFact } from "@atlas/knowledge"
import type { Axes, ScipOutput } from "@atlas/index"
import type { Hash } from "@atlas/contracts"
import type { EmitOut } from "@atlas/tools"
import { buildMineAdmission } from "./compose-mine-admission.js"
import { deriveRelations, RelationBudgetExceededError } from "./relation-derive.js"

/** One admitted-and-attempted proven relation's durable outcome — the identity, the endpoints, and whether the
 *  governed door landed it (with the CAS id) or refused it (with the structured reason). PURE data. */
export interface DeriveRelationRow {
  readonly key: string // the `relationKey(endpointA, 'depends-on', endpointB)` identity (the durable row key)
  readonly endpointA: string
  readonly endpointB: string
  readonly persisted: boolean // the emit door admitted + landed it (seal on the row, witness in CAS)
  readonly id?: string // the CAS id of the persisted proven relation (present iff `persisted`)
  readonly rejected?: string // the governed door's structured refusal (present iff NOT `persisted`)
}

/** The finished derive-and-persist pass — the recorded budget metric (AR-28), the proven set size, the durable
 *  settle/refuse counts, and the per-row outcomes. `overBudget` present ⇒ the projection REFUSED (AR-30): the
 *  resolved-edge count exceeded the ceiling, so NOTHING was derived or persisted — never a partial set. */
export interface DeriveRelationsRun {
  readonly resolvedEdgeCount: number // distinct resolved intra-repo edges the projection resolved (AR-28)
  readonly proven: number // proven `depends-on` relations the sound oracle admitted (before the store write)
  readonly persisted: number // proven relations the governed door LANDED durably (emitted:true)
  readonly refused: number // proven relations the governed door refused (authz/ungrounded/forged-strip)
  readonly rows: readonly DeriveRelationRow[]
  /** AR-30 fail-loud — present ONLY when the resolved-edge count exceeded `maxRelations`; the run derived and
   *  persisted NOTHING (a refusal), so a caller can never read a truncated projection as a complete one. */
  readonly overBudget?: { readonly resolvedEdgeCount: number; readonly maxRelations: number }
}

/** The seams the reachability run needs from the composition root — the built index, the indexer identity, the
 *  governed emit door, the anchor rev, and the exhaustive-projection row-count ceiling (F2/AR-28/30). */
export interface DeriveRelationsRunDeps {
  readonly axes: Axes
  readonly scipOutput: ScipOutput
  readonly indexerName?: string | undefined
  /** The composition root's `origin:'promoted'` governed emit door (`createGovernedEmit(...).emit`) — the ONLY
   *  channel a sound-minted proven seal survives (an authored write strips every seal at gate 0). */
  readonly emit: (node: GroundedFact, at: Hash) => EmitOut
  /** The anchor rev the write is stamped at (the repo's live HEAD). The composed truth-gate re-derives freshness
   *  against the built `Axes`, not this sha, so it is vestigial today — threaded honestly rather than as a
   *  placeholder so a gate that later reads it gets the truth. */
  readonly at: Hash
  readonly maxRelations: number
}

/**
 * Drive ONE mechanical derive-and-persist pass. Composes the R2 admit path + the 2-entry grounding seam over the
 * built `Axes`, runs `deriveRelations` (enumerate distinct intra-repo edges → dedup → prove + seal through the
 * injected sound `admit`), then EMITS every proven relation through the governed door and folds the per-row
 * outcomes. The exhaustive projection is model-free (AR-23) and 0-false by construction (the derivation IS the
 * proof). Total: an over-budget projection is CAUGHT and returned as `overBudget` (AR-30), never thrown out.
 */
export function runDeriveRelations(deps: DeriveRelationsRunDeps): DeriveRelationsRun {
  const admission = buildMineAdmission(deps.axes, deps.scipOutput)
  // The R2 admit path — the caller's ONE responsibility (truth door + sound `verifyRelation` oracle wired),
  // byte-identical to the frozen `admit` the `relation-derive.test.ts` fixture drives.
  const admitSeam = (p: RelationProposal) => admit(p, admission.deps)
  // The 2-entry relation grounding receipt over the composed `Axes` — entry[0] anchors A, entry[1] anchors B.
  // `ground` is the FROZEN GROUND-3 builder (compose-mine-admission.ts's `reground` rides it for the single-
  // citation dependency case); a file endpoint that does not resolve yields an entry-less receipt the
  // projection skips (never a fabricated anchor). `Grounding` IS `FactGrounding` (`AdvisoryNode['grounding']`).
  const groundFor = (endpointA: string, endpointB: string): FactGrounding =>
    ground(
      {
        citations: [
          { kind: "file", qualifiedPath: endpointA, path: endpointA },
          { kind: "file", qualifiedPath: endpointB, path: endpointB },
        ],
      },
      deps.axes,
    )

  let result
  try {
    result = deriveRelations({
      scipOutput: deps.scipOutput,
      ...(deps.indexerName !== undefined ? { indexerName: deps.indexerName } : {}),
      admit: admitSeam,
      groundFor,
      maxRelations: deps.maxRelations,
    })
  } catch (e) {
    // AR-30 fail-loud: the resolved-edge count exceeded the ceiling. The projection derived nothing (it threw
    // BEFORE admitting), so this pass persisted nothing — surfaced as a refusal, never a partial complete set.
    if (e instanceof RelationBudgetExceededError) {
      return {
        resolvedEdgeCount: e.resolvedEdgeCount,
        proven: 0,
        persisted: 0,
        refused: 0,
        rows: [],
        overBudget: { resolvedEdgeCount: e.resolvedEdgeCount, maxRelations: e.maxRelations },
      }
    }
    throw e
  }

  // Persist every proven relation through the governed door. The door re-runs the truth door + authz + the D-d
  // forged-seal strip; a relation it refuses (an actor not in the endpoint's scope, a receipt gone DRIFTED) is
  // reported, not silently dropped. The seal rides the durable row and the witness rides the CAS bytes in ONE
  // atomic commit (AR-27) — a torn proven-row-without-witness is unreachable.
  const rows: DeriveRelationRow[] = result.proven.map((rel) => {
    const out = deps.emit(rel, deps.at)
    return {
      key: String(rel.id),
      endpointA: rel.endpointA,
      endpointB: rel.endpointB,
      persisted: out.emitted,
      ...(out.id !== undefined ? { id: String(out.id) } : {}),
      ...(out.rejected !== undefined ? { rejected: out.rejected } : {}),
    }
  })

  const persisted = rows.filter((r) => r.persisted).length
  return {
    resolvedEdgeCount: result.resolvedEdgeCount,
    proven: result.proven.length,
    persisted,
    refused: rows.length - persisted,
    rows,
  }
}
