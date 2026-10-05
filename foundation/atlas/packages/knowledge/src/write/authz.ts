// @atlas/knowledge — src/write/authz.ts  (WP-5.14.KNOW · KNOW-11: the SHAPE half of the write gate)
//
// THIS FILE USED TO CARRY A SECOND, DEAD AUTHZ IMPLEMENTATION, AND THAT IS THE DEFECT #186 CLOSED.
// It exported `authz(op, actor, fact)` / `inScope(actor, scope)` / `authzApi` — the KNOW-11 reference model,
// rigorously tested, exported from the barrel, named by every document, and called by NOTHING. Measured on
// the BUILT `dist` in a subprocess (`atlas emit` over a real repo, markers written to stderr from inside the
// shipped functions): a successful governed write reaches `ADAPTERIO.actorInScope` and `KNOWLEDGE.isScope`,
// and reaches `KNOWLEDGE.authz` / `KNOWLEDGE.inScope` ZERO times. `authzApi` / `AuthzApi` / `AuthzOp` had no
// reference anywhere in the tree, tests included.
//
// THE TWO WERE NOT THE SAME PREDICATE, WHICH IS WHY THIS WAS NOT A TIDY-UP. The dead one was NOMINAL:
// `inScope(actor, scope) = actor === scope` — the actor id must literally EQUAL the scope name. The live one
// (`actorInScope` in `adapter-io/src/policy.ts`) is ADMIN-DECLARED membership: `policy.authz.scopes[scope]`
// is the list of actor ids authorized to write that scope, loaded fail-closed from `.atlas/policy.json`
// (empty scopes ⇒ no actor is in any scope ⇒ no write authorized). So "the live path adopts the specified
// one" was never an option here: adopting it would have DELETED admin-declared membership and replaced
// KNOW-11 with string equality — a governance downgrade dressed as a conformance fix. The specified module
// was deleted and its specification moved to the live gate instead (rule 2 of the card, the delete branch).
//
// WHAT SURVIVES, AND WHY. `isScope` is NOT part of the deleted decision — it is the runtime SHAPE guard for
// the other half of the `(scope, tier)` pair, the exact counterpart of `isTier` (ratify/tier.ts), and it is
// reached on EVERY governed write from three production call sites:
//   · `adapter-io/src/governed-emit.ts:216`            — gate 0, WELL-FORMED payload (`malformed scope`)
//   · `adapter-io/src/governed-emit-incumbent.ts:152`  — the incumbent row's stored authority scope
//   · `adapter-io/src/governed-link.ts:201`            — the second governed write door
//
// WHERE KNOW-11 IS NOW STATED IN FULL (the specification moved WHOLE — no orphan sentence left here):
//   · the DECISION — `actorInScope(policy, actor, scope)`, `adapter-io/src/policy.ts`; universal read
//     (KNOW-11b: no read path is authz-gated at all), owner-scoped write (KNOW-11c), fail-closed on an
//     absent/empty scope and on an actor in no scope (KNOW-11a).
//   · the DOOR    — `adapter-io/src/governed-emit.ts` gate "2. AUTHZ" and `governed-link.ts`'s endpoint gate.
//   · the SHAPE   — here.
//
// #187 (owner-ratified 2026-08-03, reverses #178/PR#105) removed `owner` from KNOW-11a's MUST: nothing on
// any shipped write path supplies it, and producer identity is carried by `provenance.source` (KNOW-14,
// required on every claim). That decision is unchanged by this file's contraction — `owner` was not a gate
// input before and there is no gate here now.

/**
 * Is `v` a WELL-FORMED ownership anchor — a non-empty string? THE runtime guard for the other half of the
 * `(scope, tier)` pair, and the exact counterpart of `isTier` (ratify/tier.ts): `scope` is declared
 * `string | undefined` on the frozen `GroundedFact`, a TYPE that evaporates at runtime, and every value
 * that reaches a door arrives from `JSON.parse` (the CLI wire), an SDK-parsed MCP argument (`node` is a
 * bare `object` there), a CAS blob, or an in-process embedder — none of them validated.
 *
 * Byte-exact and TOTAL over `unknown`, by the same discipline as `isTier`: `typeof v === 'string'` FIRST,
 * so nothing reaches a comparison by coercion — no `String` object, no `Symbol`, no array, no object whose
 * `toString`/`valueOf` renders a legitimate scope name. That last shape is not hypothetical: a scope is
 * used as a property KEY (`hasOwnProperty(scopes, scope)`), and a property key coerces, so `["core"]` and
 * `{toString:() => 'core'}` both READ as the scope `core` in an authorization lookup while remaining
 * `!==`-unequal to the string `'core'` — and to every other copy of themselves — at every later comparison.
 * No case-folding, no trimming, no Unicode normalization: the value that is checked is the value stored.
 *
 * It is a SHAPE test and NOT an authorization decision: a `true` here says only that the value can be
 * safely compared and used as a lookup key, never that any actor may write it. The decision is
 * `actorInScope` (adapter-io/src/policy.ts) — see the file header.
 */
export function isScope(v: unknown): v is string {
  return typeof v === "string" && v.length > 0
}
