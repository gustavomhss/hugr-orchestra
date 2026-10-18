// @atlas/tools — src/slots.ts   (WP-10.A2-a.TOOLS — AUTHOR-5, ADR-0004)
//
// `slots` — the read-only DISCOVERY planner that answers "what can I say?" (§Discovery). `slots()` returns
// EXACTLY the members of the closed `PredicateSlot` union (`@atlas/knowledge`), each paired with its
// meaning, in a fixed order — nothing invented, nothing omitted (AUTHOR-5). It is a PLANNER: it reads a
// compile-time union and returns a value; it persists NOTHING and carries NO write authority (AUTHOR-2) —
// it is NOT a member of `GOVERNANCE_SURFACE` or `WRITE_PATHS`.
//
// THE CENTRAL DISCIPLINE (AUTHOR-5 / REQ-AUTH-5c): "derived from the union, not transcribed". A bare
// `SlotInfo[]` array literal — `[{slot:'invariant',...}, {slot:'contract',...}, ...]` — would ALSO happen
// to equal the union today, and would ALSO go silently stale the day a 14th slot is added to `PredicateSlot`
// (types.ts) without a matching line here: TypeScript erases a union at runtime, so nothing would catch the
// omission until a human noticed the door was lying. The fix here is `SLOT_MEANINGS: Record<PredicateSlot,
// string>` — a MAPPED object type whose key set TypeScript computes FROM the union, not the other way
// round. Adding a member to `PredicateSlot` without adding its key here is a MISSING-PROPERTY error at
// `tsc -b`, not a runtime surprise (SCN-AUTH-5c-1: proven live by the repair-and-revert below). `slots()`
// then reads `Object.keys` off THAT object — so the returned set can never diverge from the mapping's own
// key set, and the mapping's key set can never diverge from the union's members.

import type { PredicateSlot } from "@atlas/knowledge"
import type { SlotInfo, SlotsOut } from "./types.js"

export interface SlotsApi {
  /** The closed predicate-slot vocabulary (AUTHOR-5) — every member of `PredicateSlot`, each with its
   *  meaning, in the mapping's declaration order. Pure + total, no input. */
  slots(): SlotsOut
}

/**
 * THE TOTAL slot→meaning mapping (AUTHOR-5/5b/5c) — transcribed from the reference table
 * (`docs/reference/atlas-knowledge.md` §predicateSlot) plus `count` (#196c, added after that table was
 * written — its meaning is stated from the 196c count-slot design note: "the WITNESSED lower bound N").
 * `Record<PredicateSlot, string>` is a TypeScript MAPPED type: the key set is COMPUTED from the union, so
 * this object can be under-keyed only if the compiler is bypassed. That is the enforcement mechanism
 * REQ-AUTH-5c asks for — see the file header.
 */
const SLOT_MEANINGS: Record<PredicateSlot, string> = {
  invariant: "a property that must always hold",
  contract: "the interface / signature agreement",
  precondition: "what must hold on entry",
  postcondition: "what is guaranteed on exit",
  sideeffect: "observable effects (IO / mutation)",
  ownership: "owner / lifetime / concurrency ownership",
  "perf-bound": "complexity / latency / allocation bound",
  "security-property": "authz / crypto / taint property",
  gotcha: "a non-obvious pitfall / footgun",
  rationale: "why it is built this way (the WHY)",
  dependency: "a required relationship / ordering",
  count: "a witnessed lower-bound count over a structural set (e.g. distinct callers)",
  definition: "a term / ontology definition (feeds Awareness `ontology`)",
}

/** The mapping's OWN key set, typed as `PredicateSlot[]` — `Object.keys` widens to `string[]` at the type
 *  level, but every runtime key IS a `PredicateSlot` because `SLOT_MEANINGS` is total over exactly that
 *  union (no other key can exist on it). Declaration order is preserved (`Object.keys` on a
 *  string-keyed object literal with no integer-like keys — none of the 13 members parse as an array
 *  index — walks insertion order, which is the literal's own order above). */
const SLOT_ORDER = Object.keys(SLOT_MEANINGS) as readonly PredicateSlot[]

/**
 * Build the `slots` planner (AUTHOR-5). Pure + total, no injected port — unlike `anchors`/`draft` this leg
 * reads nothing but the compile-time union, so it needs no `GroundingComputer` and persists nothing
 * (AUTHOR-2).
 */
export function createSlots(): SlotsApi {
  const slots = (): SlotsOut => ({
    slots: SLOT_ORDER.map((slot): SlotInfo => ({ slot, meaning: SLOT_MEANINGS[slot] })),
  })
  return { slots }
}

// differential-vs-oracle (compile-time): the impl's `slots` conforms to the co-located frozen
// `SlotsApi.slots` signature.
const _slotsConforms: SlotsApi["slots"] = createSlots().slots
void _slotsConforms
