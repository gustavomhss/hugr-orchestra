// @atlas/grounding — src/subtree.ts   (WP-4.10-a.GROUND · GROUND-1 / GROUND-5 / GROUND-10)
//
// The structural drift oracle. `subtreeHash(unit)` is the BLAKE3 over the unit's kernel canonical
// preimage — reached ONLY through the @atlas/kernel `Encoder` seam (GROUND-10 / KERNEL-2), never a
// locally-inlined hash call, so a blake3↔stub digest swap flows through every anchor (the seam-
// substitution property, SCN-GROUND-10a/10b). An edit that does NOT TOUCH the cited unit (an import or
// license header added above it, an unrelated rename elsewhere) leaves this byte-invariant; a real change
// to the cited unit changes it (GROUND-5).
//
// WHAT THIS DOES NOT PROMISE, stated because the header used to promise it: a REFORMAT of the cited unit
// DOES drift. The hash is over the unit's raw source slice, NFC-normalized only, so `return 42;` →
// `return  42;` moves it. That is deliberate and REQ-GROUND-5b was amended (2026-08-02) to say so. Any
// cheap normalization over raw text also erases whitespace that is SEMANTIC in TS/TSX — string, template
// and regex literals, JSX text, ASI — and the trade is asymmetric: a false alarm costs one re-ground, a
// false negative lets the truth gate serve HOLDS on a stale fact. Before landing a normalizer here, read
// the companion test that pins a one-space change INSIDE a template literal as DRIFTED.
// Conforms to the co-located frozen oracle `SubtreeApi.subtreeHash` (defined below in this file).
//
// SEAM: the `unit` is already a NORMALIZED CasObject (its concrete `StructuralNode` shape is owned by the
// lower index layer — `= unknown` at layer 1, per the ref FLAG). This WP does not normalize; it hashes
// the canonical preimage (`canonicalForm`, KERNEL-1) through the injected seam and brands the result as
// the drift-leg `SubtreeHash` (`asSubtreeHash`, the sanctioned mint site). No raw digest is imported here.

import { asSubtreeHash, canonicalForm } from "@atlas/kernel"
import type { CasObject, Encoder } from "@atlas/kernel"
import type { SubtreeHash } from "@atlas/contracts"

/**
 * The GROUND-10 seam contract. A reference to @atlas/contracts/@atlas/kernel's `Encoder` (KERNEL-2) —
 * NOT a redefinition. `subtreeHash` MUST route through THIS seam so a blake3↔stub digest swap flows
 * through every anchor (the seam-substitution property, method-tags-grd:89-91); an inlined local
 * `blake3` digest call would diverge from the swapped seam and break the substitution test.
 */
export type SubtreeSeam = Encoder

export interface SubtreeApi {
  /** BLAKE3 over the unit's source slice — the drift oracle (branded `SubtreeHash`, from contracts).
   *  Computed through the `Encoder` seam (GROUND-10). An edit that does NOT TOUCH the cited unit (an
   *  import or license header added above it, an unrelated rename elsewhere) leaves this byte-invariant;
   *  a real change to the cited unit changes it (GROUND-5). A REFORMAT of the cited unit also changes it
   *  — there is no normalizer, and REQ-GROUND-5b was amended 2026-08-02 to say so. See this file's header
   *  for why that is deliberate. (method-tags-grd:56)
   *
   *  [FLAG — `unit` arg, downward-owned] The reference names `subtreeHash(unit)` without a concrete
   *  arg type; the "unit" is a structural node whose concrete `StructuralNode` shape is owned by the
   *  lower index layer. Transcribed as the kernel `CasObject` (`= unknown` at layer 1 — a stored CAS
   *  object, DAG-safe: index/kernel are BELOW grounding) rather than invented. Flagged for the index
   *  layer to surface the concrete node shape. */
  subtreeHash(unit: CasObject): SubtreeHash
}

/**
 * Build the `subtreeHash` oracle over an INJECTED `Encoder` seam (GROUND-10). Parametrizing the digest
 * keeps it swappable: swapping `encoder` (blake3 ↔ stub) changes ONLY the digest bytes, and every
 * `subtreeHash` in a run follows that swap — no anchor path may inline its own hash (SCN-GROUND-10a).
 * The returned `subtreeHash` conforms EXACTLY to the frozen `SubtreeApi.subtreeHash(unit)` and is pure.
 */
export function bindSubtree(encoder: Encoder): SubtreeApi {
  const subtreeHash = (unit: CasObject): SubtreeHash => asSubtreeHash(encoder.hash(canonicalForm(unit)))
  return { subtreeHash }
}
