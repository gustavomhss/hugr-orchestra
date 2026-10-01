// @atlas/adapter-io — test/wp-10.a3-check.test.ts  (WP-10.A3.TOOLS/ADAPTER — the `check` acceptance goldens)
//
// Realizes the CAMPAIGN-10 `check` authoring goldens (docs/requirements/goldens-authoring.md) at the ACTUAL
// consumed surface: `@atlas/tools` `createCheck` (the `check` leg) built over `buildCheckPort` (this
// package's `GateChainRunner` implementation, `check-source.ts`) — NOT merely `runGateChain` itself (that
// parity is already pinned by `governed-emit-shape-gate.test.ts`, WP-10.A3.ADAPTER). This suite proves the
// landing pair end to end: the port declared in `@atlas/tools` and implemented here, wired exactly as
// `compose.ts` wires it, agrees with the REAL governed door (`createGovernedEmit`) over a boundary-straddling
// corpus — including inputs that fail TWO gates simultaneously (PROP-AUTH-11's own teeth clause).
//
//   · SCN-AUTH-11a-1 / 11b-1 — the `check` leg's verdict AND first-refusing gate agree with the door's, over
//     acceptance + each of the four single-gate refusals + several multi-gate-failure inputs.
//   · SCN-AUTH-11c-1 — a MUTANT `GateChainRunner` that skips the ratify bucket diverges from the door on a
//     T0-no-token input — demonstrating the parity assertion has teeth (it is not vacuously true for any port).
//   · SCN-AUTH-12b-1 — every refusing gate row the `check` leg reports carries a NON-EMPTY remedy.

import { describe, it, expect } from "vitest"
import type { GroundedFact } from "@atlas/knowledge"
import type { TruthGate, CheckOut, GateChainRunner } from "@atlas/tools"
import { createCheck } from "@atlas/tools"
import { createGovernedEmit } from "../src/governed-emit.js"
import { runGateChain } from "../src/governed-emit-gates.js"
import { buildCheckPort } from "../src/check-source.js"
import { reasonOf } from "./door-regression-support.js"
import { makeStoreSpy, POLICY, advisory, predicate, AT } from "./harness/governed-fixtures.js"

// A DETERMINISTIC truth-gate double: `HOLDS` iff `grounding.entries` is a non-empty array, else `NA` — the
// re-derivation itself is `governed-emit-shape-gate.test.ts`'s concern (already pinned there against the
// REAL `@atlas/grounding` wiring); what THIS suite needs is a gate whose pass/fail is easy to steer per case
// so the corpus below can reach EVERY one of the four gates, including `ratify`, which an unresolvable
// EMPTY-axes truth gate would mask (a real anchor never resolves against an empty index, so the truth gate
// would fail FIRST on every case, and `ratify` would never be reached at all).
const TRUTH_GATE: TruthGate = {
  gateHolds: (node) => {
    const g = node as unknown as { grounding?: { entries?: readonly unknown[] } }
    return Array.isArray(g.grounding?.entries) && g.grounding!.entries!.length > 0 ? "HOLDS" : "NA"
  },
}

function withGrounding(malformed: unknown): GroundedFact {
  const base = advisory("core") as unknown as Record<string, unknown>
  return { ...base, grounding: malformed } as unknown as GroundedFact
}

const wellFormedGrounding = {
  entries: [
    { anchor: { kind: "symbol", qualifiedPath: "src/util.ts::greet", subtreeHash: "sh-greet" }, path: "src/util.ts" },
  ],
}

describe("WP-10.A3 — `check` (@atlas/tools createCheck ∘ adapter-io buildCheckPort) ≡ the real governed door", () => {
  const corpus: readonly { readonly label: string; readonly fact: GroundedFact; readonly actor: string }[] = [
    {
      label: "accepted — well-formed, grounded, authorized, auto-accept T2",
      fact: withGrounding(wellFormedGrounding),
      actor: "alice",
    },
    { label: "shape alone — malformed tier", fact: { ...advisory("core"), tier: "T9" as never }, actor: "alice" },
    { label: "shape alone — malformed scope", fact: { ...advisory(), scope: ["core"] as never }, actor: "alice" },
    { label: "shape alone — malformed grounding", fact: withGrounding(undefined), actor: "alice" },
    {
      label: "truth alone — well-formed, empty entries (ungrounded)",
      fact: withGrounding({ entries: [] }),
      actor: "alice",
    },
    {
      label: "authz alone — well-formed + grounded-shape, wrong scope",
      fact: { ...withGrounding(wellFormedGrounding), scope: "secret" } as GroundedFact,
      actor: "alice",
    },
    {
      label: "ratify alone — T0 fact, no token",
      fact: { ...withGrounding(wellFormedGrounding), tier: "T0" as const },
      actor: "alice",
    },
    { label: "ratify alone — a PREDICATE fact routes full-ratify, no token", fact: predicate("core"), actor: "alice" },
    // multi-gate — the ONLY shape that can reveal an order divergence (PROP-AUTH-11's teeth clause).
    {
      label: "shape + authz — malformed tier AND wrong scope (shape must win)",
      fact: { ...advisory("secret"), tier: "T9" as never },
      actor: "alice",
    },
    {
      label: "shape + authz — malformed grounding AND wrong scope (shape must win)",
      fact: { ...withGrounding(undefined), scope: "secret" } as GroundedFact,
      actor: "alice",
    },
    {
      label: "truth + authz — ungrounded AND wrong scope (truth must win)",
      fact: { ...withGrounding({ entries: [] }), scope: "secret" } as GroundedFact,
      actor: "alice",
    },
    {
      label: "truth + authz — ungrounded AND empty actor (truth must win)",
      fact: withGrounding({ entries: [] }),
      actor: "",
    },
    {
      label: "authz + ratify — T0 fact, wrong scope, no token (authz must win)",
      fact: { ...withGrounding(wellFormedGrounding), scope: "secret", tier: "T0" as const } as GroundedFact,
      actor: "alice",
    },
    {
      label: "shape + truth + authz — malformed grounding, empty actor (shape must win)",
      fact: { ...withGrounding(undefined), scope: "secret" } as GroundedFact,
      actor: "",
    },
  ]

  it("SCN-AUTH-11a-1 / 11b-1 — over the WHOLE corpus, `check.wouldEmit` and the first-refusing gate agree with the real door's", () => {
    for (const { label, fact, actor } of corpus) {
      // TWO INDEPENDENT stores, both starting empty: one the REAL door writes through (so its accept path
      // still persists, exactly as production `atlas emit` does), one `check` reads a snapshot of and MUST
      // NEVER write to, regardless of verdict — the two spies isolate "did check write" from "did the door".
      const doorSpy = makeStoreSpy()
      const checkSpy = makeStoreSpy()
      const doorDeps = { store: doorSpy.store, gate: TRUTH_GATE, policy: POLICY, actor }
      const checkDeps = { store: checkSpy.store, gate: TRUTH_GATE, policy: POLICY, actor }
      const { emit } = createGovernedEmit(doorDeps)
      const checkLeg = createCheck(buildCheckPort(checkDeps))

      const doorOut = emit(fact, AT)
      const checkOut = checkLeg.check(fact, AT)

      expect(checkOut.wouldEmit, `[${label}]`).toBe(doorOut.emitted)

      const doorDiscriminant = reasonOf(doorOut.rejected)
      const lastGate = checkOut.gates[checkOut.gates.length - 1]
      const checkDiscriminant = checkOut.wouldEmit ? "" : reasonOf(lastGate?.reason)
      expect(checkDiscriminant, `[${label}] door said "${doorDiscriminant}", check said "${checkDiscriminant}"`).toBe(
        doorDiscriminant,
      )

      // TEETH — `check` NEVER writes, over EVERY corpus member, accepted or refused (AUTHOR-2). The door's
      // OWN spy is free to have persisted on the accepted case — that is the door doing its real job.
      expect(checkSpy.puts(), `[${label}]`).toHaveLength(0)
      expect(checkSpy.persists(), `[${label}]`).toHaveLength(0)
    }
  })

  it("SCN-AUTH-12b-1 — every REFUSING gate row `check` reports carries a non-empty remedy", () => {
    for (const { label, fact, actor } of corpus) {
      const spy = makeStoreSpy()
      const deps = { store: spy.store, gate: TRUTH_GATE, policy: POLICY, actor }
      const checkOut = createCheck(buildCheckPort(deps)).check(fact, AT)
      for (const g of checkOut.gates) {
        if (g.pass) continue
        expect(g.remedy, `[${label}] gate ${g.gate} refused with no remedy`).toBeDefined()
        expect(g.remedy!.length, `[${label}] gate ${g.gate}`).toBeGreaterThan(0)
      }
    }
  })

  it("every gate NAME `check` reports is a member of the closed GateName set, in door order", () => {
    const ORDER = ["shape", "truth", "authz", "ratify"]
    for (const { fact, actor } of corpus) {
      const spy = makeStoreSpy()
      const deps = { store: spy.store, gate: TRUTH_GATE, policy: POLICY, actor }
      const checkOut = createCheck(buildCheckPort(deps)).check(fact, AT)
      let lastIdx = -1
      for (const g of checkOut.gates) {
        const idx = ORDER.indexOf(g.gate)
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeGreaterThan(lastIdx) // strictly increasing ⇒ door order, never re-evaluated out of order
        lastIdx = idx
      }
    }
  })

  it("SCN-AUTH-11c-1 — a MUTANT `GateChainRunner` that SKIPS the ratify bucket diverges from the door on a T0-no-token input (teeth)", () => {
    // A deliberately broken port: it folds shape→truth→authz (via the REAL predicates, so those three still
    // agree) but reports `wouldEmit:true` unconditionally instead of folding `ratify` — the exact defect
    // REQ-AUTH-11c calls a defect in `check`, never a tolerated approximation.
    const mutantRunner: GateChainRunner = {
      runChain(candidate, at): CheckOut {
        const spy = makeStoreSpy()
        const folded = runGateChain(candidate, at, {
          store: spy.store,
          gate: TRUTH_GATE,
          policy: POLICY,
          actor: "alice",
        })
        if (folded.firstFailure !== undefined && folded.firstFailure.gate !== "ratify") {
          return { wouldEmit: false, gates: folded.gates }
        }
        // skip ratify entirely — always claim it would emit past authz.
        return { wouldEmit: true, gates: folded.gates.filter((g) => g.gate !== "ratify") }
      },
    }
    const mutantCheck = createCheck(mutantRunner)

    const spy = makeStoreSpy()
    const deps = { store: spy.store, gate: TRUTH_GATE, policy: POLICY, actor: "alice" }
    const { emit } = createGovernedEmit(deps)
    const t0NoToken = { ...withGrounding(wellFormedGrounding), tier: "T0" as const }

    const doorOut = emit(t0NoToken, AT)
    expect(doorOut.emitted).toBe(false) // T0, no ratify token ⇒ the real door refuses (KNOW-8)

    const mutantOut = mutantCheck.check(t0NoToken, AT)
    // DIVERGENCE — this is the failure the parity property exists to catch: a `check` that lies `wouldEmit:
    // true` when the door would refuse. Asserting it here (rather than silently tolerating it) is the guard.
    expect(mutantOut.wouldEmit).not.toBe(doorOut.emitted)

    // CONTROL — the REAL port (via `buildCheckPort`) does NOT diverge on the identical input.
    const realOut = createCheck(buildCheckPort(deps)).check(t0NoToken, AT)
    expect(realOut.wouldEmit).toBe(doorOut.emitted)
  })
})
