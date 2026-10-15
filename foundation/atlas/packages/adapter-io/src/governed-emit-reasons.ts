// @atlas/adapter-io — src/governed-emit-reasons.ts  (the emit door's structured refusal vocabulary)
//
// SPLIT OUT OF `governed-emit.ts` (ADR-0007 carrier WP), which crossed the 400-LOC ceiling when the carrier
// separated `unauthorized for target` from `unverifiable target` again. A real seam, not a line-count
// dodge: these strings are the door's USER-VISIBLE CONTRACT and its DISCLOSURE SURFACE — each one carries
// the paragraph explaining what it may and may not tell the caller — while the module they came from is
// control flow. They are consumed ONLY by `governed-emit.ts`; the split changes no behaviour and no export
// (they were module-private there and are package-private here — `src/index.ts` does not re-export them).
//
// The two COMMIT reasons at the bottom are the exception the rule needs stated: they are door-wide, reached
// either before any incumbent exists or after every gate has cleared, so they disclose nothing about a node.
//
// THE PRECEDENCE RULE THEY ENCODE lives in `governed-emit.ts`'s header, where the gate ORDER is: a refusal
// may never tell the caller more about the incumbent than the gates it has already CLEARED entitle it to.

/** The structured fail-closed reasons (TOOLS-7b / KNOW-11 / KNOW-8) — an ungrounded, unauthorized, OR
 *  unratified write never lands. */
export const REJECTED_UNGROUNDED = "ungrounded: citation does not re-derive FRESH at source (TOOLS-7b / GROUND-6)"
export const REJECTED_UNAUTHORIZED = "unauthorized: actor not in fact scope (KNOW-11)"
export const REJECTED_UNAUTHORIZED_ANCHOR =
  "unauthorized for anchor: the scope this write DECLARES is not the scope the admin policy says OWNS the " +
  "code this fact is anchored in (`authz.anchors` in .atlas/policy.json). Being authorized for the scope a " +
  "write names is not authority over the CODE it will be served against: the read projection scopes a pack " +
  "by the fact's computed primary anchor and never looks at the declared scope, so an unbound declaration " +
  "let an actor publish into a territory it holds no scope in. Declare the owning scope, or ask an admin to " +
  "rebind the prefix — this is a re-classification-shaped act (ADR-0009), not a field to retry with"
// AMENDED (KNOW-8 promotion door): this read `T0/contested fact requires human+billy ratification`, and that
// enumeration is no longer the whole set of writes that reach this gate. A PROMOTED candidate routes to full
// ratification because of where it came from — the door derived `origin:'promoted'` — and is typically
// neither `T0` nor contested, so the old text told a curator their T2 advisory was a contested T0. The
// reason now names the ROUTE (full ratification was owed) and lists what owes it, which is what the caller
// can act on; `billy` stays named because it is still the T0-only requirement.
export const REJECTED_UNRATIFIED =
  "unratified: this write owed FULL ratification and no valid ratifier was named (KNOW-8) — set ATLAS_RATIFY_TOKEN. " +
  "A write owes full ratification when it is T0, a predicate, contested, or a PROMOTION of a staged candidate " +
  "(the fast path does not apply to a machine-proposed fact no human has read). A T0 fact additionally requires the billy token"
export const REJECTED_DOWNGRADE =
  "governance-downgrade: this write declares a weaker tier than the node it targets — re-classification is " +
  "a separate governed act, never a side effect of emitting a fact (KNOW-8: a T0 class is human-ratified)"
export const REJECTED_UNAUTHORIZED_TARGET =
  "unauthorized for target: the actor is not in the scope the node it targets already lives in (KNOW-11) — " +
  "being authorized for the scope this write DECLARES is not authority over the node it lands on. The SAME " +
  "refusal, byte for byte, also covers a target whose ROW carries no confirmable scope at all — a node " +
  "minted before the governance carrier existed, or a row whose stored scope is malformed. In that state no " +
  "scope can authorize ANYONE, so the refusal is identical for every caller and discloses nothing; it is " +
  'never read as "authority granted". Re-classification is the separate governed act that would repair it ' +
  "(ADR-0009, task #88)"
export const REJECTED_UNVERIFIABLE_TARGET =
  "unverifiable target: the stored fact behind this node is not readable from CAS (pruned store / partial " +
  "restore), or its bytes do not corroborate the governance the projection row declares, so the write " +
  "cannot be checked against what the node actually is. This is a STORAGE fault, not an authorization one, " +
  "and it is reported as itself ONLY to a caller already shown to hold authority in the row's scope — an " +
  "operator who can act on it. A caller without that authority gets `unauthorized for target` in BOTH byte-" +
  "states, so this reason can never be used as a storage-health oracle over someone else's scope"
export const REJECTED_MALFORMED_TIER =
  "malformed tier: a fact must declare one of the three governance classes (T0 | T1 | T2). `Tier` is a " +
  "type-only union with no runtime validator upstream, so an off-lattice value is refused HERE or nowhere"
export const REJECTED_MALFORMED_SCOPE =
  "malformed scope: a fact must declare its owning scope as a NON-EMPTY STRING — the other half of the " +
  "`(scope, tier)` pair a reader trusts, and just as type-only. A scope is used as a property KEY by the " +
  'authz lookup, and property keys COERCE: `["core"]` and `{toString:…}` read as the scope `core` there ' +
  "while staying `!==`-unequal to every string AND to every later copy of themselves — so an unvalidated " +
  "scope passes authz and then fails the relocation gate forever, bricking the node for everyone"
export const REJECTED_MALFORMED_FAMILY =
  "malformed family: `kind` disagrees with `check`. The node family is discriminated by check PRESENCE — " +
  "`nodeKey` folds a check into the identity and `route` sends any check-bearing candidate to full " +
  "ratification — while `upsert` was handed the declared `kind`, and both are author-supplied. So a " +
  "`predicate` MUST carry a well-formed `check` (index-query | assertion, with a string body) and an " +
  '`advisory` MUST carry none: keeping the check while declaring `kind:"advisory"` routed an UPDATE onto a ' +
  "predicate node (free text on a checked fact, one generation of supersede lineage dropped), and declaring " +
  '`kind:"predicate"` with no check threw a raw TypeError out of the door instead of refusing'
export const REJECTED_MALFORMED_GROUNDING =
  "malformed grounding: `grounding` must be an object carrying an `entries` ARRAY, and every entry must " +
  "carry an `anchor` OBJECT. Nothing downstream validates this shape — `isGrounded`/`driftDetect` (the " +
  "truth-gate's own real-grounding + freshness predicates) read `grounding.entries.length` and each " +
  "`entry.anchor.subtreeHash` assuming both are already there, and a payload that skips either (an absent " +
  "`grounding`, a missing/non-array `entries`, a `null` entry, an entry with no `anchor`) used to reach the " +
  "truth door and THROW a raw `Cannot read properties of undefined` out of the write door instead of being " +
  "refused (the 2026-07-25 dogfood). Refused HERE, before the truth gate ever runs, for the same reason as " +
  "`malformed tier`/`malformed scope`: the payload's OWN shape is checked before any incumbent is read, so " +
  "it discloses nothing. A `subtreeHash`/`qualifiedPath` of the wrong TYPE is not this refusal — it clears " +
  "this gate and is caught by the truth gate itself as an ordinary ungrounded fact (never a throw either " +
  "way), so this refusal never widens beyond the shapes that used to crash"
export const REJECTED_MALFORMED_RELATION =
  "malformed relation: a relation fact (ADR-0015 D2) is identified by the ordered triple (endpointA, " +
  "relationKind, endpointB), and one of the three is not well-formed. endpointA and endpointB must each be a " +
  "non-empty unit key and must be DISTINCT (a self-relation is an intrinsic predicate about one unit, not a " +
  "two-ended fact), and relationKind must be a closed-vocabulary member (depends-on | calls). This is the " +
  "2-ended analogue of `malformed family`: the payload's OWN shape is refused before any incumbent is read, " +
  "so it discloses nothing. Re-state the relation naming both units it connects with a supported kind"
/** The COMMIT refusals (door stage 5 — `store.commitProjection`). Neither is error handling dressed as a
 *  gate: each names a state in which the door REFUSES to make a write durable, and each REPLACES a silent
 *  loss that used to be reported as `status: ok` — a contended writer's node vanishing under a concurrent
 *  one (measured: 1–5 nodes per 8-writer race, 6/6 trials), and a write onto a projection that only LOOKED
 *  empty erasing every fact in the store (measured: 402 nodes → 1, from ONE emit with no concurrency).
 *
 *  DISCRIMINANTS, not prose: `contended` and `unreadable store` are new reason NAMES, and the suites pin
 *  them by equality on the text before the first `:` (`reasonOf`) for the reason that helper documents —
 *  every constant here quotes its neighbours by name, so a substring assertion cannot tell them apart.
 *
 *  Both are DOOR-WIDE, not incumbent-derived: they disclose nothing about any node (they are reached before
 *  any incumbent can be resolved, or after every gate has already passed), so they sit outside the
 *  increasing-disclosure ordering rather than at a point in it. */
export const REJECTED_CONTENDED =
  "contended: the projection advanced under this write — other writers published a new generation on every " +
  "one of this write's attempts, so it was never applied. NOTHING was written and no gate was bypassed; " +
  "re-run the emit. The refusal is deliberate: the alternative — publishing a decision taken against a " +
  "snapshot that has since moved — is how a governed write silently overwrites a node it never gated"
export const REJECTED_UNREADABLE_STORE =
  "unreadable store: the projection sidecar exists but no generation of it parses, so the incumbent this " +
  "write must be gated against cannot be read. REFUSED rather than applied to an empty projection — " +
  'treating "corrupt" as "no knowledge" is what let one emit replace a 402-node store with a single row and ' +
  "report success. Restore `.atlas/projection.*.json` from a backup, or delete them deliberately to start " +
  "empty; this is a storage fault a human repairs, not a licence for the door to start over"

export const REJECTED_RELOCATION =
  "governance-relocation: this write declares a DIFFERENT scope than the node it targets — moving a node " +
  "between scopes is a re-classification, an explicit out-of-band signed act, never a side effect of " +
  "emitting a claim (ADR-0009). That act has NO DOOR YET (task #88), so a node cannot be migrated at all " +
  "today; a renamed scope is recovered by the admin declaring both names in the policy"
