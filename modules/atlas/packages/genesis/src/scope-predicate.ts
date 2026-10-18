// @atlas/genesis — src/scope-predicate.ts  (the ONE scope-containment predicate the PROVEN fact family shares)
//
// The single home for "does a hash lie under a scope" across every PROVEN genesis oracle (dependency,
// count, and the classes that follow). Extracted so the family has ONE `underScope`, not one transcription
// per oracle — the drift the `verify-fact.ts` header warned about ("it CAN drift if `anchor-scope.ts`
// changes and nothing here would notice") is a debt that MULTIPLIES with each new oracle, so it is paid
// down to a single copy here instead.
//
// LAYERING NOTE (flagged, NOT invented). The negation door (`adapter-io/src/governed-emit-negation.ts`)
// scopes with `adapter-io/src/anchor-scope.ts`'s `underScope`. `@atlas/genesis` is L8 (ARCHITECTURE.md),
// strictly BELOW the ring `@atlas/adapter-io` sits in (`harness/gates/layer-guard.mjs` ARCH-1/2), so
// importing `underScope` upward from adapter-io here would be a FORBIDDEN edge. It is therefore TRANSCRIBED
// verbatim below — BYTE-IDENTICAL to `anchor-scope.ts`'s `underScope` (cite the source, never invent a
// second notion of "under"; the two would agree until the day they disagreed, which is the whole failure
// mode `anchor-scope.ts`'s own header calls out). If `anchor-scope.ts` ever changes, this copy must change
// with it — the single point that has to be kept in sync, not N.

import type { Hash } from "@atlas/contracts"

/** `true` iff `anchor` lies UNDER `scope` — TRANSCRIBED verbatim from `anchor-scope.ts`'s `underScope`
 *  (@atlas/adapter-io; layering forbids importing it here, see module header). A SEGMENT-WISE prefix test on
 *  the anchor's FILE-PATH portion (the text before the first `::`, `/`-split), NOT a raw `startsWith` (so
 *  scope `src` covers `src/foo::bar` but scope `sr` does NOT). Total: an empty scope trivially covers every
 *  anchor. */
export function underScope(anchor: string, scope: string): boolean {
  const filePath = anchor.split("::")[0] ?? anchor
  const anchorSegs = filePath.split("/")
  const scopeSegs = scope.split("/")
  if (scopeSegs.length > anchorSegs.length) return false
  for (let i = 0; i < scopeSegs.length; i++) if (scopeSegs[i] !== anchorSegs[i]) return false
  return true
}

/** Does ANY hash in `hashes` have a KNOWN path (fail-closed on an unmapped hash — never assume in-scope)
 *  lying UNDER `scope`? The subset-nonempty test `∩ S ≠ ∅`, reused by every oracle's existence branch. */
export function anyInScope(
  hashes: readonly Hash[],
  pathOfHash: (h: Hash) => string | undefined,
  scope: string,
): boolean {
  return hashes.some((h) => {
    const p = pathOfHash(h)
    return p !== undefined && underScope(p, scope)
  })
}

/** How MANY hashes in `hashes` have a KNOWN path lying UNDER `scope` — the cardinality `|hashes ∩ S|`,
 *  fail-closed on an unmapped hash (an unmapped hash is NOT counted, so the count can only ever
 *  UNDER-state, never over-state — the direction that keeps a `≥N` lower-bound sound). `hashes` is the
 *  caller's already-deduped `reverseCallers` result, so this counts DISTINCT referencing units (docHashes),
 *  NOT reference-occurrence sites. */
export function countInScope(
  hashes: readonly Hash[],
  pathOfHash: (h: Hash) => string | undefined,
  scope: string,
): number {
  let n = 0
  for (const h of hashes) {
    const p = pathOfHash(h)
    if (p !== undefined && underScope(p, scope)) n++
  }
  return n
}
