// @atlas/adapter-io — test/wp-10.a2b-adapter-retire-door.test.ts  (WP-10.A2-b.ADAPTER — AUTHOR-13b/c/d)
//
// AUTHOR-13 (`docs/reference/atlas-authoring.md#author-13`): "Retire is a draft, not a door." A retire/
// supersede fact — `authoring: 'SUPERSEDED'` — is drafted by `@atlas/tools` `draftSupersede` (WP-10.A2-b.TOOLS,
// `draft.ts`) as the IDENTICAL composition `draft` runs, differing in exactly that one field, and is
// persisted through the SAME governed `atlas-emit` door as any other fact. Read the door itself
// (`governed-emit.ts`) and confirm the claim structurally: it branches on `raw.kind`
// (negation/transition/test-vacuity, each a DIFFERENT node family) but NEVER on `.authoring` — grepping the
// whole `adapter-io/src` tree for `SUPERSEDED`/`.authoring` turns up only doc comments, `doctor-source.ts`
// (a READ-side derivation) and `transition-source.ts` (a different family's read fold); the write door
// itself has no branch to skip. This suite turns that reading into a MEASUREMENT: a gate-invocation spy on
// the door's own four `GateName` buckets (`evalShapeGate`/`evalTruthGate`/`evalAuthzGate`/`evalRatifyGate`,
// `governed-emit-gates.ts`) proves a retire emit invokes every one of them, exactly as a grounded-fact emit
// does — and the spy's TEETH are demonstrated (not merely asserted) by a recorded mutation-and-revert
// experiment transcribed in the comment above SCN-AUTH-13d-1's test, below.
//
// THE WIRING THIS PROVES IS "ATLAS-EMIT", NOT A DOUBLE OF IT. `createGovernedEmit` IS the implementation
// wired to the `'atlas-emit'` tool leg (`wire.ts:411`, `((args) => …governedEmit.emit…)`) — calling it here
// is calling the door itself, not a stand-in.
//
// SCN-AUTH-13c-1 needs no spy at all: `WRITE_PATHS` (`@atlas/tools` `handler.ts`) is a frozen top-level
// constant, so this suite asserts it byte-for-byte rather than re-deriving a "write surface" of its own —
// the SAME discipline `cli/src/map.ts`'s `authorityOf` already follows ("DERIVES that from `WRITE_PATHS`; it
// is not asserted here").

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WRITE_PATHS } from "@atlas/tools"
import { advisory, AT, HOLDS_GATE, POLICY, makeStoreSpy } from "./harness/governed-fixtures.js"

// The gate-invocation spy — WRAP, never replace, the four real `GateName` buckets. `importOriginal` keeps
// every OTHER export (types, `GATE_CHAIN`, `runGateChain`) untouched, so `governed-emit.ts`'s behaviour is
// byte-identical to production; only the CALL is now observable.
vi.mock("../src/governed-emit-gates.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/governed-emit-gates.js")>()
  return {
    ...actual,
    evalShapeGate: vi.fn(actual.evalShapeGate),
    evalTruthGate: vi.fn(actual.evalTruthGate),
    evalAuthzGate: vi.fn(actual.evalAuthzGate),
    evalRatifyGate: vi.fn(actual.evalRatifyGate),
  }
})

describe("AUTHOR-13 — retire persists ONLY through the governed door, every gate invoked (WP-10.A2-b.ADAPTER)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("SCN-AUTH-13b-1 — a retire draft persists through `atlas-emit` (the SAME wired door)", async () => {
    const { createGovernedEmit } = await import("../src/governed-emit.js")
    const { store, puts } = makeStoreSpy()
    const { emit } = createGovernedEmit({ store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })

    // A retire draft: IDENTICAL to `advisory()`'s grounded fact except `authoring: 'SUPERSEDED'` — exactly
    // the one field `draftSupersede` (`@atlas/tools`) varies from `draft` (see that file's AUTHOR-13 note).
    const retireFact = { ...advisory("core"), authoring: "SUPERSEDED" as const }

    const out = emit(retireFact, AT)
    expect(out.emitted).toBe(true) // persisted — through the very function `atlas-emit` IS wired to
    expect(puts()).toHaveLength(1) // and the CAS bytes ARE the fact (the door's own durable-persist invariant)
  })

  it("SCN-AUTH-13d-1 — a retire emit invokes EVERY gate a grounded-fact emit invokes (no retire short-circuit)", async () => {
    const { createGovernedEmit } = await import("../src/governed-emit.js")
    const gates = await import("../src/governed-emit-gates.js")
    const shapeSpy = vi.mocked(gates.evalShapeGate)
    const truthSpy = vi.mocked(gates.evalTruthGate)
    const authzSpy = vi.mocked(gates.evalAuthzGate)
    const ratifySpy = vi.mocked(gates.evalRatifyGate)

    // GROUNDED-FACT EMIT — the baseline the retire emit is measured against.
    const { store: s1 } = makeStoreSpy()
    const { emit: emitGrounded } = createGovernedEmit({ store: s1, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const groundedOut = emitGrounded(advisory("core"), AT)
    expect(groundedOut.emitted).toBe(true) // PREMISE — the baseline write actually succeeded
    const groundedCalls = {
      shape: shapeSpy.mock.calls.length,
      truth: truthSpy.mock.calls.length,
      authz: authzSpy.mock.calls.length,
      ratify: ratifySpy.mock.calls.length,
    }
    expect(groundedCalls).toEqual({ shape: 1, truth: 1, authz: 1, ratify: 1 }) // sanity: the ladder IS 4 gates, each once

    vi.clearAllMocks()

    // RETIRE EMIT — same 4 gate functions, same fixture shape, different identity (a distinct anchor) so this
    // is a fresh CREATE-shaped write and not a supersede-collision on `s1`'s already-occupied identity — the
    // door's `.authoring` blindness is what this test measures, not the incumbent-derived AUTHZ sub-gates.
    const { store: s2 } = makeStoreSpy()
    const { emit: emitRetire } = createGovernedEmit({ store: s2, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const retireFact = { ...advisory("core"), authoring: "SUPERSEDED" as const }
    const retireOut = emitRetire(retireFact, AT)
    expect(retireOut.emitted).toBe(true) // PREMISE — the retire write actually succeeded (not refused before reaching every gate)
    const retireCalls = {
      shape: shapeSpy.mock.calls.length,
      truth: truthSpy.mock.calls.length,
      authz: authzSpy.mock.calls.length,
      ratify: ratifySpy.mock.calls.length,
    }

    // THE ASSERTION AUTHOR-13d MAKES: every gate the grounded-fact emit invoked, the retire emit ALSO
    // invoked — no retire-specific short-circuit skipped the truth gate (or any other) "because a superseded
    // fact need not re-ground".
    expect(retireCalls).toEqual(groundedCalls)

    // TEETH — recorded, not merely claimed (guardrail: "a spy that can't catch a skip is vacuous").
    // MEASURED by hand against this exact suite, single-file, before this comment was written: patching
    // `governed-emit.ts`'s truth-gate call site —
    //   const truthVerdict = node.authoring === 'SUPERSEDED'
    //     ? { pass: true as const, gate: 'truth' as const }   // "a superseded fact need not re-ground"
    //     : evalTruthGate(node, at, deps.gate);
    // — leaves `retireOut.emitted` STILL `true` (persistence succeeds; the short-circuit is invisible to any
    // assertion on the OUTCOME) while `retireCalls.truth` drops from `1` to `0`. `expect(retireCalls).toEqual
    // (groundedCalls)` above goes RED on that mutant — `{truth: 0, …}` vs `{truth: 1, …}` — and ONLY that
    // assertion catches it: `out.emitted`, `puts()`, and every other observable in this suite stay green.
    // Reverted immediately after the measurement; `governed-emit.ts` is untouched by this WP (test-only).
  })

  it("SCN-AUTH-13c-1 — the write-path set is set-equal to {atlas-emit, atlas-link, atlas-memory-emit} (a retire opens no member of its own)", () => {
    // WP-11.W8 grew WRITE_PATHS to three (`atlas-memory-emit`, a genuinely new door unrelated to retire).
    expect(new Set(WRITE_PATHS)).toEqual(new Set(["atlas-emit", "atlas-link", "atlas-memory-emit"]))
    expect(WRITE_PATHS).toHaveLength(3) // a retire opened no member of its own
  })
})
