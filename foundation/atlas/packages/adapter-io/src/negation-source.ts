// @atlas/adapter-io — src/negation-source.ts  (the PRODUCTION feed for the grounded-negation + abstention read, #99b)
//
// `negationsOf`/`abstentionsOf` (@atlas/knowledge, ADR-0015 D3 / #99b) answer "what grounded NEGATIVES did the
// truth door admit under this scope, and what did it ABSTAIN on" by folding a projection's `current` map (the
// `family:'negation'` rows) and its `abstained` ledger. Like `relationsOf` before it was wired, those folds are
// specification artifacts until an edge makes them running code — this module is that edge (the #99a
// relationsOf-was-dormant lesson). It reads the SAME durable projection `atlas query` reads back
// (`rehydrateProjection(store)`), so `atlas negations <scope>` and `atlas query` are two projections of ONE
// store, never a second differently-derived runtime.
//
// ── WHAT THIS MODULE OWNS AND WHAT THE FOLDS OWN ────────────────────────────────────────────────────────────
// The folds own the scan, the scope-containment predicate and the deterministic sort — none of that is restated
// here. This module owns TWO things: the store read (`createNegationLeg`), and the SHARED verdict shaping
// (`negationsVerdict`) that BOTH transports drive, so the `Verdict` (`data` + `guidance`) is byte-identical on
// CLI and MCP — the SCHEMA + VERDICT parity invariant, sourced from ONE body rather than transcribed twice.
//
// ── ABSTENTION ROUND-TRIP (honest limit, stated so it is not mistaken for coverage) ─────────────────────────
// A grounded NEGATION lives in `current`, which the sidecar serializes, so it survives restart and reads back
// in PRODUCTION today. An ABSTENTION lives in `StoreProjection.abstained`, and per that field's frozen header
// the WIRE ROUND-TRIP (serialize/rehydrate `abstained` through `sidecar.ts` WireProjection) is the WRITER's
// obligation — landed with the N2 door that emits abstentions, not here. Until N2 lands it, a real disk store
// rehydrates no `abstained` map and this leg's abstention list is empty over persisted state. The FOLD, LEG,
// CLI and MCP paths are complete and proven over a SEEDED projection (N3's tests seed both a grounded negation
// and an AbstainedRecord directly); the end-to-end emit→persist→read of an abstention is N2+N4's close.

import { abstentionsOf, negationsOf } from "@atlas/knowledge"
import type { AbstainedRecord, CurrentNode, GroundedFact, GroundedNegation, KnowledgeFreshness } from "@atlas/knowledge"
import type { Guidance, Verdict } from "@atlas/tools"
import type { Hash } from "@atlas/contracts"
import { resolveFreshness } from "./pack-shape.js"
import type { FreshnessOracle } from "./pack-shape.js"
import { rehydrateProjection } from "./store.js"
import type { DiskStore } from "./store.js"

/** What one negation read yields off the live projection: the grounded negatives AND the honest abstentions
 *  under the scope. BOTH are always computed — the abstention is surfaced beside the negation, never behind a
 *  gate, so "the door declined to decide" is observable by default (#202). */
export interface NegationsRead {
  readonly negations: readonly GroundedNegation[]
  readonly abstentions: readonly AbstainedRecord[]
}

/** The composition-root leg: `scope` → the grounded negatives + abstentions under it. TOTAL — both folds are
 *  pure + total (an empty/absent scope reads the whole ledger, never a throw). Re-reads the LIVE projection per
 *  call, so an in-session negation/abstention filed through the door is visible to the very next call. */
export type NegationLeg = (scope: string) => NegationsRead

/** The data payload a `negations` verdict carries — the negatives, the abstentions, the query scope, and the
 *  `abstained` view flag. BOTH arrays are ALWAYS present (an empty result is a measured fact, never an absent
 *  line), so abstention observability rides the bytes on both transports regardless of the flag. */
export interface NegationsData {
  readonly negations: readonly GroundedNegation[]
  readonly abstentions: readonly AbstainedRecord[]
  readonly scope: string
  readonly abstained: boolean
}

/** Build the composition-root read leg over the durable `store` — the SAME store the handler's query leg and
 *  `atlas doctor` read. Provenance is guarded where it is for the sibling read legs: on the CLI a COMMITTED /
 *  provenance-refused store is refused at the entrypoint (`cli.ts` `readRefusal`, before dispatch); over MCP
 *  that refusal is not threaded (`mcp-server/src/bin.ts` applies it to NO read), a PRE-EXISTING MCP-wide gap
 *  this read-only leg inherits, not one #99b introduces.
 *
 *  `freshness` (N4 · billy F1) is the family-aware per-fact oracle the composition root binds (`bindFreshnessOracle`,
 *  wire.ts) — `driftDetect(grounding, axes)` PLUS the §3 clause-4 `edgeModel === currentEdgeModel` conjunct for a
 *  negation. It is the SAME seam the query readback rides, threaded here so `atlas negations` surfaces a FRESH/DRIFTED
 *  verdict per row (a re-opened scope drifts the dir subtreeHash, an extractor bump drifts the edgeModel — both read
 *  DRIFTED). ABSENT (the bare-WIRE assembly with no composition-root axes) ⇒ every row reads `DRIFTED`, fail-closed —
 *  the exact `resolveFreshness` discipline the query path applies, never a silent "always fresh". */
export function createNegationLeg(store: DiskStore, freshness?: FreshnessOracle): NegationLeg {
  // The per-negation freshness recompute the pure `negationsOf` fold cannot do itself: read the WHOLE fact back
  // from CAS (the bytes ARE the fact — its §3 grounding + `edgeModel`) and run it through the family-aware
  // oracle. A CAS miss / absent oracle ⇒ `DRIFTED` (`resolveFreshness`, fail-closed). The oracle already
  // collapses STALE→DRIFTED for a negation; `resolveFreshness` collapses the advisory STALE the same way here.
  const freshnessOf = (node: CurrentNode): KnowledgeFreshness => {
    const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined
    if (fact === undefined) return "DRIFTED"
    return resolveFreshness(freshness, fact) === "FRESH" ? "FRESH" : "DRIFTED"
  }
  return (scope) => {
    const projection = rehydrateProjection(store)
    return {
      negations: negationsOf(projection, scope, freshnessOf),
      abstentions: abstentionsOf(projection, scope),
    }
  }
}

/** The one property a reader should check the bytes against — stated identically on both transports. */
const INVARIANT =
  "NEG-1: `atlas negations` reads GROUNDED negatives (family:negation) AND honest ABSTENTIONS off the live projection the query readback rides — scope-contained (segment-wise path-prefix, #153-safe), sorted for byte-identical output, never a throw, no write path; an abstention that FIRED is observable (closes #202)"

/** The one actionable sentence, derived from the result's own numbers — never a guess about the wiring. */
function nextLine(scope: string, r: NegationsRead): string {
  const n = r.negations.length
  const a = r.abstentions.length
  if (n === 0 && a === 0) {
    return `no grounded negative and no abstention under scope '${scope}' — a negation is filed by the truth door (\`atlas emit\` a family:negation fact over a CLOSED scope); check the scope spelling, or widen it`
  }
  if (a > 0) {
    return `${n} grounded negative(s) and ${a} ABSTENTION(s) under '${scope}' — an abstention is the door declining to decide a negative over an OPEN scope (see its reason + witness), NOT a negative; it fired and is on the record (#202)`
  }
  return `${n} grounded negative(s) under '${scope}', 0 abstentions — each carries its own nodeKey; inspect one with \`atlas doctor why <nodeKey>\``
}

/**
 * The SHARED verdict builder — the SCHEMA + VERDICT parity source. Both transports call this over the SAME
 * `NegationLeg`, so identical `(scope, abstained)` yields a byte-identical `Verdict` (`data` + `guidance`) on
 * CLI and MCP. TOTAL: a missing/empty `scope` fails CLOSED to a structured `ok:false` verdict (exit 1 on the
 * CLI, `isError` on MCP), never a throw.
 *
 * `scope` IS ENFORCED HERE, at the one shared body, precisely so the schema's `required:['scope']` means the
 * same on both transports — the CLI refuses a missing positional at its arity floor, and the MCP path coerces
 * a non-string / absent `scope` to `''` before this call, so without this gate an MCP `{}` call would return
 * `ok:true` over the whole store while the CLI rejected it (the exact CLI-vs-MCP asymmetry a shared body
 * exists to prevent). `abstained` is an OPTIONAL view flag (default false) — it selects the CLI render FOCUS
 * (abstentions only) but NEVER changes the data: both arrays are always present, so parity + observability hold.
 */
export function negationsVerdict(leg: NegationLeg, scope: string, abstained: boolean): Verdict<NegationsData> {
  if (typeof scope !== "string" || scope.length === 0) {
    const guidance: Guidance = {
      next: "`atlas negations <scope> [--abstained]` requires the scope key whose grounded negatives + abstentions to read (schema `required:['scope']`)",
      invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
    }
    return { ok: false, rejected: "missing scope: `atlas negations` requires a non-empty scope key", guidance }
  }
  const read = leg(scope)
  const guidance: Guidance = { next: nextLine(scope, read), invariant: INVARIANT }
  return { ok: true, guidance, data: { negations: read.negations, abstentions: read.abstentions, scope, abstained } }
}
