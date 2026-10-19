// @atlas/knowledge — src/retired.ts  (R6: a retired fact leaves every read)
//
// Retiring a fact is an emit that stamps its CAS bytes `authoring: 'SUPERSEDED'` (the `doctor` retire template,
// `draftSupersede`). Until R6 nothing read that field, so a retired fact stayed in the scope pack, the `own` bands,
// the dependency read and the `constitution` facet. This predicate is the ONE definition of \"retired\"; each read
// point calls it on the fact bytes it already reads from CAS. The bytes themselves stay in CAS and in history.

/** Is this fact retired — its stored `authoring` is `SUPERSEDED`? Total over `unknown`: a missing or malformed
 *  fact is not retired (the read point's own CAS-miss handling decides what happens to it). */
export function isRetired(fact: unknown): boolean {
  return fact !== null && typeof fact === "object" && (fact as { readonly authoring?: unknown }).authoring === "SUPERSEDED"
}
