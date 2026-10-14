// @atlas/index — src/cas.ts  (WP-4.10-a.INDEX · INDEX-11 universal content-addressing)
//
// EVERY Atlas object kind (code/knowledge/memory/provenance/transcripts/docs) is content-addressed through
// the ONE kernel CAS — never a second store — and registered drift-eligible; the FRESH/DRIFTED verdict is
// owned by GROUND (above index) and consumed via an INJECTED `DriftPort`, keeping the layer DAG intact.
// Identity is minted only through the sealed kernel store seam (no hash computed here).

import type { Hash, Freshness } from "@atlas/contracts"
import type { CasObject, StoreApi } from "@atlas/kernel"

/**
 * Universal content-addressing (INDEX-11): `put` canonicalizes ANY object kind (incl. a `Doc`) through
 * the ONE kernel CAS and returns its `Hash` — never a second, doc-exempt store (atlas-index:216).
 */
export interface CasIndexApi {
  /** Canonicalize → BLAKE3 → store; content-address ANY object kind (incl. a `Doc`), returns its
   *  hash. Shares the KERNEL CAS reference `kernel/ref/store.ts` — one store, not a second.
   *  `object` is the kernel's `CasObject` (the stored-object type).
   *  (atlas-index:216; method-tags-idx:95) */
  put(object: CasObject): Hash
}

/**
 * The drift-oracle port INDEX consumes (owned by WP-4.10-a.GROUND — `DriftApi.driftDetect`). Kept
 * GENERIC over the grounding-record `G` and source-of-truth `S` so this lower layer neither imports nor
 * redefines the GROUND `Grounding`/`Axes` shapes — it consumes only the layer-0 `Freshness` verdict
 * (@atlas/contracts). Structurally compatible with GROUND's `driftDetect(grounding, src): Freshness`.
 */
export interface DriftPort<G, S> {
  driftDetect(grounding: G, src: S): Freshness
}

/**
 * The CAS-identity facet surface: the frozen `CasIndexApi.put` plus the two INDEX-owned witnesses of
 * "every object is grounded + drift-checked like any fact" — `isDriftEligible` (uniform registration)
 * and `checkDrift` (uniform routing to the injected oracle). No object-kind branch exists on any path,
 * so no kind (least of all a `Doc`) can escape addressing or grounding.
 */
export interface CasIndex extends CasIndexApi {
  /** Content-address ANY object kind (incl. a `Doc`) into the ONE CAS; returns its BLAKE3 `Hash`. */
  put(object: CasObject): Hash
  /** Was this hash registered by `put`? — the drift-eligibility witness (every kind, no exemption). */
  isDriftEligible(h: Hash): boolean
  /** Route the drift verdict through GROUND's oracle — identical call for every kind; never redefined. */
  checkDrift<G, S>(port: DriftPort<G, S>, grounding: G, src: S): Freshness
}

/**
 * Construct the CAS-identity facet over the SHARED kernel CAS (`store` — one store, not a second). `put`
 * delegates addressing to the sealed kernel seam and registers the resulting hash uniformly, so an object
 * of any kind is drift-eligible the instant it is stored. A malformed object yields the kernel's honest
 * empty handle and is NOT registered (an un-stored object is not drift-eligible).
 */
export function createCasIndex(store: StoreApi): CasIndex {
  const registered = new Set<Hash>()
  return {
    put(object: CasObject): Hash {
      // canonicalize → BLAKE3 → store, via the sealed kernel seam; the caller never supplies the key.
      const h = store.put(object)
      // register EVERY stored kind uniformly (incl. a Doc) — no kind is side-stored or exempted.
      if (h) registered.add(h)
      return h
    },
    isDriftEligible(h: Hash): boolean {
      return registered.has(h)
    },
    checkDrift<G, S>(port: DriftPort<G, S>, grounding: G, src: S): Freshness {
      // INDEX owns the ROUTING (uniform across kinds); GROUND owns the FRESH/DRIFTED verdict.
      return port.driftDetect(grounding, src)
    },
  }
}
