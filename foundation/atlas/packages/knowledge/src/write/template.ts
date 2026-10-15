// @atlas/knowledge — src/template.ts  (WP-5.14.KNOW · KNOW-10: templated-write validator + closed-slot gate)
//
// No free prose, ever (KNOW-10, atlas-knowledge:203; method-tags-knw:81-86). Implements the FROZEN
// `TemplateApi` (co-located below): a staged `Candidate` PERSISTS iff it carries every required template
// field, its `claimText` is within the byte cap, AND its `slot` is one of the closed 13 (`PredicateSlot`);
// any violation ⇒ REJECT — 0 free-prose facts persist. The reject/persist route is a TOTAL, mutually-
// exclusive AND over the finite validity product {required-field∈(present,missing) × size∈(≤cap,>cap) ×
// slot∈(in-vocab-13, out)}. Pure — no clock, no IO, no hashing.
//
// BIND note (template.ts FLAG resolved): the frozen signature gates the staging `Candidate` (it carries the
// proposed `slot` + claim body), so the required-field check runs over the Candidate-carried template fields
// {claimText, claimNorm, provenance, grounding, slot}. `scope` (also in `RequiredAdvisoryField`) is the
// KNOW-11 ownership fence — `scope` alone, enforced fail-closed at the governed write door by
// `actorInScope` (adapter-io/src/policy.ts, gate "2. AUTHZ") over an `isScope`-validated value (authz.ts),
// NOT re-checked here — and it fires only on a WRITE, never against a `Candidate` in staging, which is what
// this validator gates. Producer identity is a SEPARATE concern, carried by `provenance.source` (KNOW-14,
// required on every claim), not by this fence. (#187, owner-ratified 2026-08-03: an `owner` leg was folded
// into the knowledge-side `authz()` write branch at #178/PR#105 and this comment was rewritten to describe
// it; #187 reversed that fold, and #186 deleted `authz()`/`inScope` outright — they had zero production
// callers and were a SECOND, nominal implementation of a gate the door decides from admin-declared policy.)
// A staged candidate carries no `scope` at all (see `Candidate` in types.ts) until it is promoted through
// the governed write door. No field invented.
//
// WHAT THIS MODULE IS, STATED SO IT IS NOT MISTAKEN FOR THE GATE (#152). `validateTemplate` is a DECLARED
// REFERENCE MODEL — it has zero production callers and is registered as such in
// `harness/gates/reference-model-guard.mjs`. The governed door validates its OWN required fields at gate 0
// and never stages a `Candidate`, so the required-field and 512-byte legs here run for nobody. Only ONE of
// its three legs is a shipped control: the closed-slot membership question, which now lives in exactly one
// runtime list (`isKnownSlot`, router.ts) and is ENFORCED at `upsert` (upsert.ts) on every durable write.
// `isClosedSlot` below delegates there; it does not restate the vocabulary and it is not the enforcement point.

import type { Candidate, PredicateSlot } from "../types.js"
// THE one runtime copy of the closed 13 (#152). See `isClosedSlot` below.
import { isKnownSlot } from "./router.js"

// ── frozen TemplateApi surface, co-located here (was ref/template.ts) ─────────────────────────────────

/**
 * The per-kind required template field set (KNOW-10, advisory kind). [PINNED — goldens-knw:60,
 * Enumerated universe B] a well-formed advisory fact MUST carry every one of these 7 fields; a fact
 * missing any is REJECTED (0 free-prose facts persist — SCN-KNOW-10b-1). Transcribed EXACTLY from the
 * golden field list — NOT invented.
 */
export type RequiredAdvisoryField =
  | "claimNorm"
  | "claimText"
  | "provenance"
  | "owner"
  | "scope"
  | "grounding"
  | "predicateSlot"

/**
 * The per-kind size cap (KNOW-10). [PINNED — goldens-knw:61] `claimText ≤ 512 bytes`; a fact over the
 * cap is REJECTED (SCN-KNOW-10b-2). Expressed as a type-level byte-count literal (zero-runtime — the
 * bound, not a runtime const). The number IS frozen by the golden, so it is transcribed, not a DEFINE.
 */
export type ClaimTextCapBytes = 512

export interface TemplateApi {
  /** Per-kind template + closed-slot validator (KNOW-10). `true` iff the fact carries every required
   *  template field, is within its cap, AND its `slot` is one of the closed 13 (`PredicateSlot`); else
   *  REJECT — no free-prose fact ever persists (atlas-knowledge:203; method-tags-knw:84). Pure + total.
   *  Typed on the staging `Candidate` (which carries the proposed `slot` + claim body the validator gates). */
  validateTemplate(fact: Candidate): boolean

  /** Closed-vocabulary membership: `true` iff `slot` is one of the 13 (`PredicateSlot`). A fact whose
   *  `slot` is outside the closed set is rejected (atlas-knowledge:220). Pure. */
  isClosedSlot(slot: PredicateSlot): boolean
}

/** The `claimText` size cap in bytes (KNOW-10, goldens-knw:61). Tied to the frozen type-level bound
 *  `ClaimTextCapBytes = 512` — a drift between this const and the frozen literal is a compile error. */
const CLAIM_TEXT_CAP_BYTES: ClaimTextCapBytes = 512

const UTF8 = new TextEncoder()

/** A present, non-empty string (runtime-defensive: a fixture may omit a field the Candidate type marks
 *  required — the enumerated `missing` cell of universe B). */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0
}

/** Closed-vocabulary membership (KNOW-10): `true` iff `slot` is one of the 13. A free-prose blob with no
 *  slot binding (`slot` absent / out-of-vocab) yields `false` — the totality guard at the value boundary.
 *
 *  DELEGATES to `isKnownSlot` (router.ts) rather than restating the 13 (#152). This function used to own a
 *  SECOND `CLOSED_SLOTS` literal, so the vocabulary was written out three times — here, in `router.ts`, and
 *  as the `PredicateSlot` union — and enforced in none of them. One runtime list now, in the file that
 *  computes the `nodeKey` the closedness protects; a `cv` bump edits one place. The KNOW-10 name is kept
 *  because KNOW-10 is what the goldens cite, and both invariants are the same membership question. */
export function isClosedSlot(slot: PredicateSlot): boolean {
  return isKnownSlot(slot)
}

/** Every Candidate-carried required template field is present (KNOW-10). The `missing` cell of the
 *  validity product — a receiptless (`provenance` absent) or grounding-less body is REJECTED. */
function hasRequiredFields(fact: Candidate): boolean {
  const f = fact as Partial<Candidate>
  return isNonEmptyString(f.claimText) && isNonEmptyString(f.claimNorm) && f.provenance != null && f.grounding != null
}

/** Per-kind template + closed-slot validator (KNOW-10). `true` iff required-fields-present ∧ claimText ≤
 *  512 B ∧ slot ∈ closed-13; else REJECT. Total + mutually-exclusive over the finite validity product. */
export function validateTemplate(fact: Candidate): boolean {
  if (!hasRequiredFields(fact)) return false // missing-field cell (F2)
  if (UTF8.encode(fact.claimText).length > CLAIM_TEXT_CAP_BYTES) return false // over-cap cell (F3)
  if (!isClosedSlot(fact.slot)) return false // out-of-vocab / free-prose cell (F5)
  return true // well-formed ⇒ PERSIST
}

/** The FROZEN `TemplateApi` binding (RED→GREEN oracle conformance). */
export const templateApi: TemplateApi = { validateTemplate, isClosedSlot }
