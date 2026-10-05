// #99 F3 COMPANION fixture — the PRECISION BOUNDARY. This doc defines a global `helper` (uncalled) AND uses a
// GENUINE block-`const` local. In the reduced .scip it carries: a `definition`-role GLOBAL `helper`, plus a
// `local 2` that appears BOTH as a `definition` (the const decl) and a `reference` (its use). Because the local
// ref HAS a matching local def in THIS doc, it is a genuine intra-doc local — it must NOT land in
// opaqueRefSources, so `helper`'s own negation over this scope stays PROVEN (the fix must not degrade into
// approach-2, where every local ref would be treated as opaque).
export function helper(): number {
  const n = 41
  return n + 1
}
