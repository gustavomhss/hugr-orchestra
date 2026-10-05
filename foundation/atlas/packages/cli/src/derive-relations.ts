// @atlas/cli — src/derive-relations.ts  (#99 WP-R7: the `atlas derive-relations` door)
//
// The CLI leg of the sound-relation MECHANICAL PROJECTION (#99, ADR-0018). It owns exactly two things: driving
// the composition root's `deriveRelations` leg once, and projecting its `DeriveRelationsRun` to a `CliVerdict`.
// Every edge enumerated, every proof, every durable byte belongs to `adapter-io` — `relation-derive.ts` (the
// projection), `relation-derive-run.ts` (the compose-and-persist seam), `admit`/`verifyRelation` (the sound
// oracle) and the governed emit door underneath. Read those headers for the derivation-IS-the-proof narrative.
//
// WHY THIS FILE EXISTS RATHER THAN A LEG ON THE HANDLER. `derive-relations` opens no new governed surface:
// `GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays `{atlas-emit, atlas-link}`, and it publishes through the
// EXISTING emit door (ADR-0008 — a projection pass is an ordinary use of it, exactly as promote is). So there
// is no `Tool` token to dispatch; the command is intercepted at the entrypoint like `promote`/`mine`/`node`,
// and its outcome rides the ONE process-outcome path.
//
// THE EXIT CODE IS THE WHOLE CONTRACT A SCRIPT HAS WITH THIS COMMAND, so it is derived, never chosen:
//   0  every proven relation the projection derived was made durable (including the honest empty case: an index
//      with no resolved cross-unit edges derives nothing and persists nothing)
//   2  a governed refusal — at least one proven relation the emit door declined (authz/ungrounded/forged-strip),
//      OR the over-budget fail-loud (AR-30): the resolved-edge count exceeded the ceiling, nothing was derived
// There is no exit-1 leg here: reaching this function means the invocation parsed and the runtime composed.

import type { DeriveRelationsRun } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"

/** The invariant line every derive outcome carries — the one property a reader should check the bytes against. */
const INVARIANT =
  "#99 R7: a `depends-on` relation is PROVEN by the index alone (a witnessed cross-unit reference, re-derivable) and persisted only THROUGH the governed emit door — the count reported is what SETTLED durably, never what was derived; no LLM anywhere (the derivation is the proof)"

/**
 * Project one finished derive-and-persist pass to the CLI's process outcome. PURE — a function of the
 * `DeriveRelationsRun` alone (no clock, no paths, no re-reading of the store), so the same outcome renders
 * byte-identically.
 *
 * THE COUNT IS SETTLED, NEVER DERIVED — `persisted` counts `emitted:true` and nothing else; `proven` (what the
 * sound oracle admitted before the store write) and `resolvedEdgeCount` (the AR-28 budget metric) are reported
 * ALONGSIDE it, so "resolved N, proved M, persisted K" is legible as the pipeline it is.
 */
export function deriveRelationsVerdict(run: DeriveRelationsRun): CliVerdict {
  // AR-30 FAIL-LOUD — an over-budget projection is a REFUSAL, not a partial set. Nothing was derived or
  // persisted; say so with the count that tripped the ceiling and the deliberate remedy.
  if (run.overBudget !== undefined) {
    return {
      exitCode: 2,
      stdout:
        "status: rejected\n" +
        `next: derive-relations refused — the projection resolved ${run.overBudget.resolvedEdgeCount} distinct ` +
        `intra-repo edges, exceeding the ${run.overBudget.maxRelations} row ceiling. Nothing was derived or ` +
        `persisted: an "exhaustive" run that silently truncated would be unfalsifiable (AR-30). Raise the ` +
        `ceiling deliberately or scope the projection.\n` +
        `invariant: ${INVARIANT}\n`,
    }
  }

  const refused = run.refused > 0
  const lines = [
    `status: ${refused ? "rejected" : "ok"}`,
    `next: ${nextLine(run)}`,
    `invariant: ${INVARIANT}`,
    `derive-relations: resolved ${run.resolvedEdgeCount} intra-repo edge(s), proved ${run.proven}, ` +
      `persisted ${run.persisted}; ${run.refused} refused`,
    // Per-row, in the projection's own (relationKey-sorted) order. A batch verdict that names no row is
    // unactionable: an operator has to know WHICH relation the door declined and WHY.
    ...run.rows.map((r) =>
      r.persisted
        ? `  persisted ${r.endpointA} --depends-on--> ${r.endpointB} (${r.id ?? ""})`
        : `  refused ${r.endpointA} --depends-on--> ${r.endpointB}: ${r.rejected ?? "unknown"}`,
    ),
  ]
  return { exitCode: refused ? 2 : 0, stdout: `${lines.join("\n")}\n` }
}

/** The one actionable sentence, derived from the pass's own numbers — never a guess about the wiring. */
function nextLine(run: DeriveRelationsRun): string {
  if (run.resolvedEdgeCount === 0) {
    // HONESTLY EMPTY: the index holds no resolved cross-unit reference (a fresh/tiny repo, or a missing SCIP
    // dump — `atlas doctor index` reports how to build one).
    return "the index holds no resolved cross-unit edges — nothing to derive. Build a SCIP dump (`atlas doctor index`) if this repo has cross-file references"
  }
  if (run.proven === 0) {
    return `resolved ${run.resolvedEdgeCount} edge(s) but the sound oracle proved none — the projection admitted no proven relation to persist`
  }
  if (run.refused === 0) {
    // `atlas relations <unit>` reads each persisted proven edge back, both directions (the #99a fold), with its seal.
    return `${run.persisted} proven \`depends-on\` relation(s) are now durable — \`atlas relations <unit>\` reads each one back (both directions) carrying its proven seal`
  }
  if (run.persisted === 0) {
    return `every proven relation was refused by the governed door (${run.proven}) — read the per-row reasons below; nothing was persisted (most often an actor not in the endpoint's scope)`
  }
  return `${run.persisted} persisted, ${run.refused} refused — read the per-row reasons below`
}

/**
 * Drive ONE governed derive-and-persist pass and project it. `deriveRelations` is the composition root's leg
 * (`ComposedRuntime`), injected rather than constructed here for the same reason `promote` is: the CLI must not
 * stand up a second runtime, or the store it persists into stops being the store `atlas relations` reads.
 */
export function runDeriveRelationsCli(deriveRelations: () => DeriveRelationsRun): CliVerdict {
  return deriveRelationsVerdict(deriveRelations())
}
