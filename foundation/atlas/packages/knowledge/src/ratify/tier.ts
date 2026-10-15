// @atlas/knowledge — src/tier.ts  (WP-5.15.KNOW · EPIC-15)
//
// The criticality classifier (KNOW-7). Criticality is NEVER auto-assigned: a `T0`-keyword match yields
// `t0Candidate:true` AND `tier=='T2'` (0 auto-promotes); the heuristic may only FLAG a candidate for
// human ratification, never write the tier. Binds the FROZEN `TierApi` (co-located below):
// `classify(territory: TerritoryView): { t0Candidate: boolean; tier: Tier }`.
//
// FACET BOUNDARY (BIND — resolved vs the frozen TierApi, co-located below):
//  • [FLAG — arg] the oracle types `classify(territory)` as the knowledge-local `TerritoryView` (the
//    init.ts output shape) while noting the canonical `Territory` could also apply. This facet binds
//    to the oracle's declared type — `TerritoryView` — matching the init→classify pipeline; the flag is
//    resolved, not an unpinned MUST-field.
//  • The `T0` keyword corpus is a builder-owned HEURISTIC (heuristics only FLAG — KNOW-7), not a frozen
//    contract value: a closed, path-segment-matched list of security-critical territory names. It writes
//    NOTHING to the tier — the human ratifier owns any `T0` promotion.

import type { Tier } from "@atlas/contracts"
import type { TerritoryView } from "../types.js"

// ── frozen TierApi surface, co-located here (was ref/tier.ts) ─────────────────────────────────────────

export interface TierApi {
  /** Classify a territory's criticality (KNOW-7). Sets `t0Candidate` by keyword but ALWAYS emits
   *  `tier='T2'` — the invariant `t0Candidate ⇒ tier=='T2'` holds over the whole keyword corpus
   *  (method-tags-knw:64). A `T0` tier is human-ratified only (never mechanical). Pure + total.
   *  Typed on the knowledge-local `TerritoryView` (the init.ts output shape). */
  classify(territory: TerritoryView): { readonly t0Candidate: boolean; readonly tier: Tier }
}

/** The closed `T0`-flag keyword corpus (heuristic — flags only, never assigns the tier). */
export const T0_KEYWORDS: readonly string[] = ["auth", "payments", "secrets", "kms", "crypto", "billing"]

/** True iff a path has a segment matching a `T0` keyword (e.g. `auth/`, `payments/…`). */
export function isT0Candidate(path: string): boolean {
  const segments = path
    .toLowerCase()
    .split("/")
    .filter((s) => s.length > 0)
  return segments.some((seg) => T0_KEYWORDS.includes(seg))
}

/**
 * Classify a territory's criticality (KNOW-7). Sets `t0Candidate` by keyword but ALWAYS emits
 * `tier='T2'` — the invariant `t0Candidate ⇒ tier=='T2'` holds over the whole corpus. A `T0` tier is
 * human-ratified only (never mechanical). Pure + total.
 */
export function classify(territory: TerritoryView): { readonly t0Candidate: boolean; readonly tier: Tier } {
  return { t0Candidate: isT0Candidate(territory.path), tier: "T2" }
}

/** The frozen-`TierApi` binding (conformance handle). */
export const classifier: TierApi = { classify }

// ── the tier LATTICE (task #84) ────────────────────────────────────────────────────────────────────────
//
// `Tier` is an ORDERED governance class, not a label: `T0` (human+billy, KNOW-8) is strictly stricter than
// `T1`, which is strictly stricter than `T2` (fast-path auto-accept, KNOW-18). Until this was written down,
// the ordering existed only as scattered `=== 'T0'` / `=== 'T2'` equality checks, so no code could ask the
// one question a write door must ask: "is this write's class WEAKER than the class of the node it targets?"
// A door that cannot ask it gates on the write's own self-declaration — a confused deputy, since the
// routing `nodeKey` (hash(primaryAnchorId ‖ slot[‖ check])) contains no tier at all.
//
// The lattice lives HERE, at L4, beside the ratification facet that owns the question — not beside the
// type at L0. `@atlas/contracts` is pure vocabulary, zero runtime (ARCHITECTURE.md), and an ORDER is
// policy, not vocabulary. Every consumer of the lattice already sits at or above L4 and already depends
// on `@atlas/knowledge` (`retrieval` L5, `tools` L7, the `adapter-io` ring), so nothing here inverts the
// DAG. What DID cause the bug was not the layer: it was that four modules each rebuilt the order privately
// as a bare `Record<Tier, number>` and each read `undefined` from an off-lattice value. One lattice, one
// guard, one place a ratification question is asked.
//
// The type union is TYPE-ONLY: it evaporates at runtime, and every value that reaches a door or a
// comparator arrives from `JSON.parse` (the CLI wire), an SDK-parsed MCP argument, or a CAS blob out of a
// COMMITTED `.atlas/` directory. None of those is trusted and none was validated — hence one guard,
// `isTier`, and total functions above it.

/** Strictness rank — HIGHER binds harder. `T0` is the strictest (human+billy ratification, KNOW-8);
 *  `T2` the most permissive (fast-path auto-accept, KNOW-18). THE one numeric encoding of the lattice:
 *  every other question (membership, sort rank, downgrade, join) is derived from this table. */
const STRICTNESS: Readonly<Record<Tier, number>> = { T2: 0, T1: 1, T0: 2 }

/** How many real governance classes exist — read off the one table, never re-declared. */
const TIER_COUNT = Object.keys(STRICTNESS).length

/**
 * Is `v` one of the three real governance classes? THE runtime guard for a type that has none of its own.
 * Byte-exact by construction: an own-property lookup, so no case-folding, no whitespace trimming, no
 * Unicode normalization, and no prototype member (`'toString'`, `'__proto__'`, `'constructor'`) can pass.
 * `typeof v === 'string'` additionally rejects `String` objects, `Symbol`s, and anything relying on
 * `toString`/`valueOf` coercion.
 */
export function isTier(v: unknown): v is Tier {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(STRICTNESS, v)
}

/**
 * Rank an UNTRUSTED class, STRICTEST-FIRST (`T0` → 0, `T1` → 1, `T2` → 2) — the ordering the retrieval
 * comparators sort by, and the INVERSE of `STRICTNESS` (which binds harder upward). Derived from the same
 * table rather than a second literal, so the two encodings cannot drift apart.
 *
 * An unrecognized value ranks LAST (`TIER_COUNT`, after every real class) rather than `NaN`, so a sort
 * stays total and a poisoned row sinks instead of scrambling the order around it.
 */
export function tierRank(v: unknown): number {
  return isTier(v) ? TIER_COUNT - 1 - STRICTNESS[v] : TIER_COUNT
}

/**
 * Is `declared` a WEAKER governance class than `incumbent`? The predicate a write door gates on: a write
 * may re-state or RAISE the class of the node it targets, never lower it.
 *
 * TOTAL over `unknown` and FAIL-CLOSED off the lattice — an unrecognized DECLARED class is always weaker
 * (nothing off-lattice writes anything), an unrecognized INCUMBENT always strictest (a node whose class
 * cannot be read is never written).
 */
export function isWeakerTier(declared: unknown, incumbent: unknown): boolean {
  if (!isTier(declared) || !isTier(incumbent)) return true // off-lattice either side ⇒ refuse
  return STRICTNESS[declared] < STRICTNESS[incumbent]
}

/**
 * The lattice JOIN — the stricter of two classes. A governed act spanning SEVERAL nodes (a `sameAs` link
 * spans a whole equivalence class) must clear the strictest class among them, else the weakest member is a
 * side door onto the strongest. FAIL-CLOSED: garbage joins to `T0`, so an unreadable class can never
 * DILUTE the join and make a governed act cheaper to sign.
 */
export function strictestTier(a: unknown, b: unknown): Tier {
  if (!isTier(a) || !isTier(b)) return "T0"
  return isWeakerTier(a, b) ? b : a
}
