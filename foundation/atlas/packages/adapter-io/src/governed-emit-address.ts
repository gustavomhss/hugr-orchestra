// @atlas/adapter-io — src/governed-emit-address.ts  (the emit door's ADDRESSABILITY gate)
//
// ── THE DEFECT THIS MODULE CLOSES (task #136) ────────────────────────────────────────────────────────────
// A canonical-form violation in an emitted fact reached the operator as `status: error` / exit 1, while
// `@atlas/tools` `faultOf` classified the SAME verdict as `refused`. Measured through the real binary:
//
//   atlas emit <grounded fact carrying `confidence: 0.5`>  → exit 1 · status: error
//     reason: canonical-form violation: floats forbidden (non-integer/non-finite number)
//   atlas emit <ungrounded fact>                           → exit 2 · status: rejected
//   faultOf(...) over BOTH verdicts                        → 'refused'
//
// ── THE DECISION: THE EXIT CODE FOLLOWS THE DOOR'S RECORD ────────────────────────────────────────────────
// Neither classifier is changed. `deriveStatus` (cli/src/map.ts) is a pure function of ONE verdict and reads
// the record a governed door carries back; `renderVerdict` is right to fall through to `error` when there is
// no record. What was wrong is that THE DOOR HAD MADE A DECISION AND FAILED TO RECORD IT — `id(node)` sat
// unguarded inside the commit's `decide` callback, so a violation escaped as a throw out of the middle of a
// governed write, and a throw carries no `EmitOut`. So the fix is here, at the door, not at the renderer.
//
// FOLLOWING THE FAULT CLASS INSTEAD WAS MEASURED AND REJECTED. `faultOf`'s `refused` is documented as the
// RESIDUAL class ("everything that is not one of THIS module's two discriminants"), and it swallows the
// composition root declining a tool it never bound: `faultOf({rejected: "tool 'atlas-query' not wired at
// this seam"})` is `'refused'` too. Routing exit codes through it therefore re-classifies an UNWIRED TOOL as
// a governance refusal — contradicting golden SCN-CLI-3b-1's own text ("`1` for `error`") and performing
// exactly the widening `cli/src/render.ts` documents as forbidden. The two classifiers answer DIFFERENT
// questions (whose fault vs. what process outcome); the overlap in their vocabularies is not agreement.
//
// WHY THIS IS A GOVERNANCE REFUSAL AND NOT A USAGE ERROR. `exit 1` means, per `map.ts`, "malformed args /
// unwired tool — a usage/wiring error". A float in a fact is neither: it parses against the published
// `atlas-emit` schema (`node` is declared a bare `object`), the tool was wired and ran, and every gate was
// evaluated. What refused it is KERNEL-1, a ratified LAW ("floats forbidden … fail-closed reject … never
// emit two CAS objects for one fact"), and ADR-0003 states the governed-door property invariant as: a
// refusal is FAIL-CLOSED-VISIBLE on both transports — CLI exit 2 / MCP `isError`. MCP already answered
// `isError`; only the exit code dissented, and it told an agent to go and fix its invocation.
//
// AN ENGINE FAULT IS NOT A DECISION. The `cyclic` shape exhausts the stack and arrives as a `RangeError`,
// which `fault.ts` files as `internal-fault` ("a defect in Atlas, not in your arguments"). It is RE-THROWN
// unchanged. Recording it as `emitted:false` would put our own defect behind the caller's name — the exact
// misattribution `fault.ts` exists to remove, committed in the opposite direction.

import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
// The KNOW-10/KNOW-15i closed-slot refusal `upsert` raises (#152) — recognised STRUCTURALLY; see below.
import { isClosedSlotError } from "@atlas/knowledge"
import { UnaddressableCasObjectError } from "./sidecar-commit.js"

/** The canonicalizer's own name for every one of its refusals (`kernel/canonical.ts` — floats, unsupported
 *  value types, NFC key collisions all carry it). Matched as a DISCRIMINANT by EQUALITY, which is how this
 *  repo compares refusals everywhere: the name is the contract, the prose is commentary. */
const CANONICAL_VIOLATION = "canonical-form violation"

/** The DISCRIMINANT of a message — everything before the first `:`. */
const discriminantOf = (message: string): string => message.split(":")[0]!

/** The addressability verdict: the minted content address, or the door's recorded refusal. */
export type Addressed = { readonly hash: Hash; readonly rejected?: undefined } | { readonly rejected: string }

/**
 * Mint the content address of `node`, converting a canonical-form violation into a RECORDED refusal.
 *
 * The reason travels VERBATIM — the canonicalizer already says which value it refused and why, and that text
 * is what the operator reads on the `reason:` line and what the S24 black-box story pins by discriminant.
 * Wrapping it would add a second name for one condition.
 *
 * Anything that is NOT a canonical-form violation is RE-THROWN untouched (see the header): a `RangeError`
 * from a cyclic value is an engine fault, and `@atlas/tools` must keep filing it as `internal-fault`.
 */
export function addressOf(node: GroundedFact): Addressed {
  try {
    return { hash: id(node as CasObject) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (e instanceof Error && discriminantOf(message) === CANONICAL_VIOLATION) return { rejected: message }
    throw e
  }
}

/**
 * The SECOND leg, and it is not redundant with the first: `canonicalForm` EXCLUDES the mutable side-indexes
 * `grounding` / `status` / `freshness` at every level (KERNEL-8), so a value the CAS cannot store can sit in
 * one of them, canonicalize FINE, clear every gate, and only be caught by the store's own write door.
 *
 * MEASURED (task #136), through the real `createGovernedEmit` over a real `createDiskStore`: a `BigInt`
 * parked in `grounding` — a field on EVERY `GroundedFact` — reaches `sidecar-commit.ts`'s CAS_EMPTY guard.
 * That file states the opposite in a comment ("No product caller reaches it today — both governed doors
 * compute `id(node)` themselves before handing the same object over, so an unaddressable object never gets
 * this far"); the claim is false, and the guard there is load-bearing rather than belt-and-braces.
 *
 * The guard did its job (nothing durable) but as an ESCAPING THROW — the same missing record, one layer
 * down. Re-file it as the door's own decision, keeping the store's message verbatim so the `unaddressable-
 * cas-object` discriminant that `archive.ts` / `attach.ts` / `sidecar-commit.ts` all share reaches the user.
 * Every other throw — `IdentitySchemaError`, an ENOSPC from `publish` — propagates UNCHANGED: those are not
 * decisions about the caller's bytes.
 *
 * ── THE SECOND RE-FILE: THE CLOSED-SLOT REFUSAL (#152) — THE SAME DEFECT, ONE GATE OVER ───────────────────
 * `upsert` (@atlas/knowledge) now refuses a write whose `predicateSlot` is outside the closed 13, and it
 * refuses by THROWING a named class — for the reasons its own ARCH-10 block gives, and because the door
 * discards `UpsertResult.decision`, so a returned refusal would have persisted nothing while the door
 * reported `emitted: true`. That throw arrived here having made a decision and, like the canonical-form
 * violation above, failed to RECORD it. MEASURED through the real binary before this line existed:
 *
 *   atlas emit <fact with predicateSlot 'free-text-whatever'>  → exit 1 · status: error
 *     reason: closed-slot-violation: this write declares predicateSlot 'free-text-whatever' …
 *   atlas emit <ungrounded fact>                               → exit 2 · status: rejected
 *
 * Byte-for-byte the header's own defect, so it takes the header's own decision: the exit code follows the
 * door's record. Nothing about the refusal's TEXT is restated here — `e.message` travels verbatim, so the
 * `closed-slot-violation` discriminant is minted in exactly one place (`knowledge/src/write/closed-slot.ts`).
 *
 * STRUCTURAL, never `instanceof`. `UnaddressableCasObjectError` above can use `instanceof` because it is
 * raised and caught inside `@atlas/adapter-io`'s own dependency of `@atlas/kernel`; this one crosses a
 * package boundary, and two `dist` copies of `@atlas/knowledge` in one process (a hoist that did not
 * dedupe, an embedder pinning its own) give two distinct class objects — under which `instanceof` answers
 * `false` and silently converts a governance decline back into an unhandled throw at the user's door.
 * `tools/src/fault.ts` records the identical hazard for its own tag and resolves it the identical way.
 */
export function commitRefusalOf(e: unknown): string {
  if (e instanceof UnaddressableCasObjectError) return e.message
  if (isClosedSlotError(e)) return e.message
  throw e
}
