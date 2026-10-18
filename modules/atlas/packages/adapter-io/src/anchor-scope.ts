// @atlas/adapter-io — src/anchor-scope.ts  (the ONE "is this anchor under that scope" predicate)
//
// EXTRACTED from `projection-query-index.ts` (which still re-exports it, so every existing importer and
// every existing test is untouched) because it stopped being a read-side detail: it is the predicate the
// READ projection scopes on, and ADR-0010 open item 3 requires the WRITE door's authz scope to be bound to
// the same notion. A binding built on a SECOND implementation of "under" would be a binding in name only —
// the two sides would agree until the day they disagreed, which is the whole failure mode.
//
// It lives in a LEAF module so `policy.ts` (the authz side) can consume it without depending on the query
// index, which depends on the store. One predicate, two consumers, no cycle.

/**
 * `true` iff `anchor` lies UNDER `scope` — a SEGMENT-WISE prefix test on the anchor's FILE-PATH portion (the
 * text before the first `::`, `/`-split), NOT a raw `startsWith` (so scope `src` covers `src/foo::bar` but
 * scope `sr` does NOT). Mirrors the `read/anchor-match.ts` `isPrefix` discipline. Total: an empty scope (no
 * segments) trivially covers every anchor; an anchorless node is filtered by the caller before this runs.
 */
export function underScope(anchor: string, scope: string): boolean {
  const filePath = anchor.split("::")[0] ?? anchor // the file-path portion — ancestry after the first `::`
  const anchorSegs = filePath.split("/")
  const scopeSegs = scope.split("/")
  if (scopeSegs.length > anchorSegs.length) return false
  for (let i = 0; i < scopeSegs.length; i++) if (scopeSegs[i] !== anchorSegs[i]) return false
  return true
}
