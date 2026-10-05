// @atlas/adapter-io — src/sidecar-abstained.ts  (ADR-0015 D3 · #99b — the abstention ledger's wire round-trip)
//
// The durable-projection serialization of `StoreProjection.abstained` — the honest-ABSTENTION ledger keyed by
// `negationKey`. Extracted as a leaf so `sidecar.ts` (read) and `sidecar-commit.ts` (write) drive ONE body and
// cannot drift, and so neither godfiles under the #99b addition. An abstention asserts NOTHING about the world:
// it is NOT a fact, NEVER enters `current`/`cas`, and NEVER enters any `nodeKey` — it round-trips on its own
// map, additively, so a pre-#99b sidecar is byte-identical after the round-trip (the write side is conditional).

import type { AbstainedRecord } from "@atlas/knowledge"

/** One wire entry: `[negationKey, AbstainedRecord]`, the Map as an entry-array exactly like `current`. */
export type AbstainedWire = ReadonlyArray<readonly [string, AbstainedRecord]>

/** Is `e` a well-shaped `[negationKey, AbstainedRecord]` pair (a `[string, {kind:'abstained'}]`)? Mirrors
 *  `sidecar.ts`'s `isKeyedEntry`: total over `unknown`, any bad element drops the WHOLE ledger rather than
 *  throwing at boot (safe — an abstention grants no authority; the worst case is a lost, re-derivable record). */
function isAbstainedEntry(e: unknown): e is readonly [string, AbstainedRecord] {
  if (!Array.isArray(e) || e.length !== 2) return false
  const [key, rec] = e as readonly unknown[]
  if (typeof key !== "string" || rec === null || typeof rec !== "object") return false
  return (rec as { readonly kind?: unknown }).kind === "abstained"
}

/** Rehydrate the ledger from a wire value — `{abstained}` when it is a well-shaped entry-array, `{}` otherwise
 *  (a non-array / malformed value ⇒ "no abstentions", the conservative default, NEVER a boot-bricking throw).
 *  Shaped as a spreadable fragment so `readOne` folds it into the projection exactly as it folds `builtAt`. */
export function abstainedFromWire(raw: unknown): { abstained?: ReadonlyMap<string, AbstainedRecord> } {
  return Array.isArray(raw) && raw.every(isAbstainedEntry) ? { abstained: new Map(raw as AbstainedWire) } : {}
}

/** Serialize the ledger to its wire entry-array — `{abstained}` ONLY when non-empty (so a store with no
 *  abstentions round-trips byte-identically and a pre-#99b sidecar is unrewritten), `{}` otherwise. */
export function abstainedToWire(abstained: ReadonlyMap<string, AbstainedRecord> | undefined): {
  abstained?: AbstainedWire
} {
  return abstained !== undefined && abstained.size > 0 ? { abstained: [...abstained] } : {}
}
