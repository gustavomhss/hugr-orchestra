// @atlas/adapter-io — src/relation-source.ts  (the PRODUCTION feed for the grounded-relation read fold, #99a)
//
// `relationsOf` (@atlas/knowledge, ADR-0015 D2 / #99a R3-core) answers "what GROUNDED relation facts touch
// this unit, and in which direction" by reading the `endpointA`/`endpointB`/`relationKind` carriers off a
// projection's current map. It was shipped, tested and exported — and had EXACTLY ONE caller in the monorepo:
// its own test file. It was a specification artifact (`npm run reference-model-guard` reports it as a NEW
// REFERENCE MODEL). This module is the edge that makes it running code: it reads the SAME durable projection
// `atlas query` reads back (`rehydrateProjection(store)`), so `atlas relations <unit>` and `atlas query` are
// two projections of ONE store, never a second differently-derived runtime.
//
// ── WHAT THIS MODULE OWNS AND WHAT THE FOLD OWNS ──────────────────────────────────────────────────────────
// `relationsOf` owns the scan, the direction predicate and the deterministic sort — none of that is restated
// here. This module owns TWO things: the store read (`createRelationLeg`), and the SHARED verdict shaping
// (`relationsVerdict`) that BOTH transports drive, so the `Verdict` (`data` + `guidance`) is byte-identical
// on CLI and MCP — the SCHEMA + VERDICT parity invariant, sourced from ONE body rather than transcribed twice.

import { relationsOf } from "@atlas/knowledge"
import type { RelationDirection, RelationEdge } from "@atlas/knowledge"
import type { Guidance, Verdict } from "@atlas/tools"
import { rehydrateProjection } from "./store.js"
import type { DiskStore } from "./store.js"

/** The composition-root leg: `(unit, direction)` → the grounded relation edges touching `unit`. TOTAL —
 *  `relationsOf` is pure + total (an empty/malformed unit yields the empty list, never a throw). Re-reads the
 *  LIVE projection per call, so an in-session `atlas emit` of a relation is visible to the very next call. */
export type RelationLeg = (unit: string, direction: RelationDirection) => readonly RelationEdge[]

/** The data payload a `relations` verdict carries — the edges plus the query that produced them, so an EMPTY
 *  result is a measured fact (this unit, this direction, zero edges) and never an absent line. */
export interface RelationsData {
  readonly relations: readonly RelationEdge[]
  readonly unit: string
  readonly direction: RelationDirection
}

/** Build the composition-root read leg over the durable `store` — the SAME store the handler's query leg and
 *  `atlas doctor` read. No provenance guard here, and where that guard IS applied differs by transport (stated
 *  honestly, not credited to a refusal this leg does not run): on the CLI a COMMITTED / provenance-refused
 *  store is refused at the entrypoint (`cli.ts` `readRefusal`, before dispatch), exactly as for
 *  `node`/`own`/`doctor`. Over MCP that refusal is NOT threaded — `mcp-server/src/bin.ts` applies `readRefusal`
 *  to NO read, so `atlas-relations` (like `atlas query`/`node` over MCP) will serve a committed store. That is
 *  a PRE-EXISTING MCP-wide gap this leg inherits, not one #99a introduces, and it is strictly read-only (the
 *  leg opens no write path). Closing it means threading `readRefusal` into `createMcpServer`. */
export function createRelationLeg(store: DiskStore): RelationLeg {
  return (unit, direction) => relationsOf(rehydrateProjection(store), unit, direction)
}

/** The three legal directions — `out` (unit is the SUBJECT), `in` (the OBJECT), `both` (the union). */
const DIRECTIONS: readonly RelationDirection[] = ["out", "in", "both"]

/** The one property a reader should check the bytes against — stated identically on both transports. */
const INVARIANT =
  "REL-1: `atlas relations` reads GROUNDED relation FACTS (family:relation) off the live projection the query readback rides — directed (out=subject, in=object, both=union), sorted (relationKind, endpointA, endpointB, nodeKey) so equal input is byte-identical output, never a throw, no write path"

/** The one actionable sentence, derived from the result's own numbers — never a guess about the wiring. */
function nextLine(unit: string, direction: RelationDirection, edges: readonly RelationEdge[]): string {
  if (edges.length === 0) {
    return `no grounded relation fact touches '${unit}' in direction '${direction}' — a relation is filed by the truth door (\`atlas emit\` a family:relation fact); check the spelling of the unit key, or widen the direction to 'both'`
  }
  return `${edges.length} grounded relation(s) touch '${unit}' (direction '${direction}') — each carries its own nodeKey; inspect one with \`atlas doctor why <nodeKey>\``
}

/**
 * The SHARED verdict builder — the SCHEMA + VERDICT parity source. Both transports call this over the SAME
 * `RelationLeg`, so identical `(unit, direction)` yields a byte-identical `Verdict` (`data` + `guidance`) on
 * CLI and MCP (the hard parity invariant). TOTAL: a missing `unit` OR an out-of-vocabulary `direction` fails
 * CLOSED to a structured `ok:false` verdict (exit 1 on the CLI, `isError` on MCP), never a throw; an absent
 * direction defaults to `both`.
 *
 * `unit` IS ENFORCED HERE, at the one shared body, precisely so the schema's `required:['unit']` means the
 * same on both transports: the CLI already refuses a missing positional at its arity floor, and the MCP path
 * coerces a non-string / absent `unit` to `''` before this call — so without this gate an MCP `{}` call would
 * return `ok:true` with an empty list while the CLI rejected it, the exact CLI-vs-MCP asymmetry a shared
 * verdict body exists to prevent. Rejecting an empty unit closes it for both.
 */
export function relationsVerdict(
  leg: RelationLeg,
  unit: string,
  rawDirection: string | undefined,
): Verdict<RelationsData> {
  if (typeof unit !== "string" || unit.length === 0) {
    const guidance: Guidance = {
      next: "`atlas relations <unit> [out|in|both]` requires the unit key whose grounded relations to read (schema `required:['unit']`)",
      invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
    }
    return { ok: false, rejected: "missing unit: `atlas relations` requires a non-empty unit key", guidance }
  }
  if (rawDirection !== undefined && !DIRECTIONS.includes(rawDirection as RelationDirection)) {
    const guidance: Guidance = {
      next: `unknown direction '${rawDirection}' — expected one of out|in|both (default both)`,
      invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
    }
    return { ok: false, rejected: `unknown direction '${rawDirection}': expected out|in|both`, guidance }
  }
  const direction: RelationDirection = (rawDirection ?? "both") as RelationDirection
  const relations = leg(unit, direction)
  const guidance: Guidance = { next: nextLine(unit, direction, relations), invariant: INVARIANT }
  return { ok: true, guidance, data: { relations, unit, direction } }
}
