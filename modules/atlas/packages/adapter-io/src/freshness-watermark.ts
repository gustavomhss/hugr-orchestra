// @atlas/adapter-io — src/freshness-watermark.ts  (N11: the freshness watermark, PER ROW)
//
// THE ONE definition of "what HEAD does this row's stored freshness reflect", with BOTH halves in one leaf
// module — the `anchor-scope.ts` shape and for the same reason. The write half (`stampGeneration`, called by
// `sidecar-commit.ts` `publish`) and the read half (`rowBehindHead`, called by `projection-query-index.ts`)
// are two sides of one rule; a rule with two implementations agrees until the day it does not, and this
// particular disagreement is invisible from the outside because both sides report a boolean.
//
// ── THE DEFECT THIS MODULE EXISTS TO CLOSE (measured through the built CLI, e2e story S26) ────────────────
// N11 stamped the watermark ON THE PROJECTION: `publish` wrote `builtAt = headSha()` into every generation,
// unconditionally, and `cover` compared that ONE field to live HEAD. But a generation is a whole-projection
// rewrite in which almost every row is CARRIED FORWARD UNTOUCHED, so the field described the newest row and
// was applied to all of them. Any write LAUNDERED the watermark for every other fact in the store:
//
//   C1  emit fact A (anchored at src/app/foo.ts)      → builtAt = C1, `stale: false`   (honest)
//   C2  edit src/app/foo.ts and commit                → `stale: true`                  (honest — behind HEAD)
//   C2  emit fact B (anchored at src/lib/other.ts)    → builtAt = C2, `stale: false`   (A LIE)
//
// At step 3 nothing about fact A changed — not its bytes, not its stored `freshness`, not its anchor — and
// `atlas doctor why A` still printed `class=semantic` with the same anchorWas/anchorNow. The read door and
// the diagnostic door gave opposite answers about the same fact in the same repo, and the read door was the
// one an agent trusts. That is the false-PASS class: a signal that reports clean when it is not.
//
// ── THE RULE ──────────────────────────────────────────────────────────────────────────────────────────────
// A row's stored freshness lives in its CAS BYTES (`GroundedFact.freshness`), which are addressed by its
// `contentHash`. So the honest stamp is decided by exactly that:
//
//   · `contentHash` CHANGED (or the row is new) ⇒ some governed door produced those bytes in THIS generation,
//     and every door that produces fact bytes re-derives the grounding first (`governed-emit.ts`'s truth gate;
//     the doctor re-ground funnels through it). Stamp the row with this generation's HEAD.
//   · `contentHash` UNCHANGED ⇒ the bytes are the same bytes, so the `freshness` inside them is the SAME
//     VALUE it was, reflecting the same older HEAD. Carry the row's own, older stamp forward.
//
// THIS IS DELIBERATELY NARROWER THAN "every row written in this generation", and the narrowing is measured
// rather than aesthetic. `atlas link` (`governed-link.ts`) WRITES rows — it adds `sameAs`/`sameAsRetracted`
// — without ever touching the fact's bytes and without re-deriving anything. Stamping on "the row object
// changed" would let a link at C2 certify a grounding last verified at C1: the same laundering one radius in.
// Keying on `contentHash` is also the literal reading of the invariant this file restores, which is stated in
// `store.ts` in as many words: stamped with THE HEAD ITS STORED PER-FACT FRESHNESS REFLECTS.
//
// THE HONEST RESIDUAL, stated rather than hidden: a governed emit that DEDUPS (the incoming fact re-derives
// fresh at HEAD but is byte-identical to the incumbent, so no new bytes are put) leaves the row's stamp where
// it was, and the row therefore keeps reading `stale`. The gate really did verify that grounding at HEAD —
// but the store recorded nothing, so the store cannot honestly claim it. Reporting what can be PROVEN from
// what is stored is the N11 rule (see `projection-query-index.ts`), and this is its conservative direction:
// it can over-report staleness for a re-verified duplicate, never under-report it for a drifted fact.
//
// WHY NOT RE-DERIVE ON READ. That is the design N11's ADR rejected and this module does not reopen: comparing
// stored shas is O(rows) string equality with NO git call per fact, so the SOTA property — a watermark, not a
// live recompute — is preserved. `atlas reconcile` / `atlas doctor` remain the authoritative drift oracles.
//
// Pure + total: no clock, no IO, no throw. It reads shas and compares them.

import type { CurrentNode, StoreProjection } from "@atlas/knowledge"

/**
 * Stamp ONE generation's rows for publication — the write half.
 *
 * Returns the `[nodeKey, row]` entry array the wire format carries, with `derivedAt` set on the rows whose
 * `contentHash` differs from `prev` (or that `prev` does not have at all) and carried forward on the rest.
 * `prev` is the snapshot this generation is being published OVER — the one the commit loop just read.
 *
 * `builtAt` ABSENT (no `headSha` seam wired — tests, a non-git tree) ⇒ a changed row is stamped with NOTHING,
 * and any stamp it happened to carry in is DROPPED. That matters: keeping an inherited stamp on bytes this
 * build cannot date would be asserting a verification that did not happen. No stamp reads back as "unknown",
 * which the reader treats conservatively and never as a flag.
 */
export function stampGeneration(
  next: StoreProjection["current"],
  prev: StoreProjection["current"] | undefined,
  builtAt: string | undefined,
): (readonly [string, CurrentNode])[] {
  const out: (readonly [string, CurrentNode])[] = []
  for (const [key, row] of next) {
    const before = prev?.get(key)
    // Carried forward iff the SAME key still addresses the SAME bytes. `undefined !== undefined` can never
    // fire here: `contentHash` is a required field of `CurrentNode`, so both sides are strings.
    const carried = before !== undefined && before.contentHash === row.contentHash
    const stamp = carried ? (row.derivedAt ?? before.derivedAt) : builtAt
    const { derivedAt: _dropped, ...rest } = row
    out.push([key, { ...rest, ...(stamp !== undefined ? { derivedAt: stamp } : {}) }])
  }
  return out
}

/**
 * Is this row's stored freshness BEHIND live HEAD — the read half.
 *
 * `projectionBuiltAt` is the projection-level N11 watermark, kept as the BACK-COMPAT FALLBACK for a row that
 * carries no stamp of its own: every store written before this module existed is exactly that, and without
 * the fallback such a store would either flip wholesale to stale on upgrade or lose the signal entirely.
 *
 * Conservative on the unknown, in BOTH directions that can be unknown: live HEAD absent (non-git tree) ⇒
 * never a flag; no row stamp AND no projection watermark ⇒ never a flag. It asserts only staleness it can
 * PROVE from two known, differing shas — the N11 rule, unchanged.
 *
 * The stamp is accepted only as a STRING. The sidecar is untrusted input (`sidecar.ts` `isKeyedEntry` says
 * so), and a non-string here is a value no producer in this file can write; treating it as absent keeps the
 * decision on the fallback rather than on whatever `!==` would make of it.
 */
export function rowBehindHead(
  row: CurrentNode,
  projectionBuiltAt: string | undefined,
  head: string | undefined,
): boolean {
  if (head === undefined) return false // live HEAD unknown ⇒ nothing is provable ⇒ never a false flag
  const stamp = typeof row.derivedAt === "string" ? row.derivedAt : projectionBuiltAt
  return stamp !== undefined && stamp !== head
}
