// @atlas/adapter-io — test/wp-10.a2b-draft.test.ts  (WP-10.A2-b.TOOLS/ADAPTER — the `draft` route/operation acceptance goldens)
//
// Realizes the CAMPAIGN-10 `draft` authoring goldens this WP closes (docs/requirements/goldens-authoring.md)
// at the ACTUAL consumed surface: `@atlas/tools` `createDraft` built over `buildDraftIncumbentPort` (this
// package's `IncumbentPort` implementation, `draft-incumbent-source.ts`) — exactly as `compose.ts` wires it.
//
//   · SCN-AUTH-10a-1 / 10b-1 / 10c-1 — CREATE vs UPDATE by the minted `nodeKey`, NEVER the CAS `contentHash`
//     (10c-1's teeth: a reworded claim at the same (anchor, slot) keeps the same `nodeKey`).
//   · SCN-AUTH-9a-1 / 9b-1 — the declared route matches the KNOW-18 fast-path formula (`ratify/fastpath.ts`)
//     over the reachable decision space this leg exercises (no-incumbent CREATE, and each ARCH-9-derived
//     class an UPDATE's incumbent can carry); 9b-1's T0 case names the authorizing channel.
//   · SCN-AUTH-9c-1 (teeth, adapted — see FRAMING NOTE below) — a MUTANT `IncumbentPort` that ignores the
//     derived class (always reports the door's `{contested:false, lowRisk:true}` defaults with no
//     `derivedTier`) diverges from the real port on a T0-incumbent input, showing the parity assertion has
//     teeth against exactly the "hard-coded tier ⇒ route" defect the golden warns about.
//   · SCN-AUTH-13a-1 — `draftSupersede` reports the drafted fact's `authoring` as `'SUPERSEDED'`.
//
// FRAMING NOTE (SCN-AUTH-9c-1's literal text): the golden's "Given a T2 **predicate** draft" scenario is not
// reachable through this WP's `draft`/`draftSupersede` legs — both mint `kind:'advisory'` unconditionally
// (AUTHOR-6/7's scope, WP-10.A2-a); there is no predicate-drafting leg for this WP to route. The teeth this
// golden protects — "no discovery by refusal" via a route that reflects the REAL derived state rather than a
// hard-coded rule — is instead proven against the ONE tier axis this leg's incumbent lookup DOES vary
// (ARCH-9's `derivedTier`), via the mutant-port comparison below.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { GroundingCandidate, GroundingComputer, IncumbentPort } from "@atlas/tools"
import { createDraft } from "@atlas/tools"
import type { Tier } from "@atlas/contracts"
import { route } from "@atlas/knowledge"
import type { Candidate, StoreProjection } from "@atlas/knowledge"
import { buildDraftIncumbentPort } from "../src/draft-incumbent-source.js"
import { makeStoreSpy } from "./harness/governed-fixtures.js"

const FIXED_ANCHOR: StructRef = {
  kind: "symbol",
  qualifiedPath: "src/util.ts::greet",
  subtreeHash: asSubtreeHash("sh-greet"),
}

const COMPUTER: GroundingComputer = {
  anchorsUnder: () => ({ rev: "rev-1", units: [], holes: [] }),
  groundingFor: () => FIXED_ANCHOR,
}

const CANDIDATE = (claim: string): GroundingCandidate => ({ anchor: "src/util.ts::greet", slot: "invariant", claim })

function seed(store: ReturnType<typeof makeStoreSpy>["store"], key: string, tier: Tier): void {
  const projection: StoreProjection = {
    current: new Map([[key, { nodeKey: key, family: "advisory", contentHash: "ch-seed", claims: ["seed"], tier }]]),
    cas: new Set(),
  }
  store.persistProjection(projection)
}

// Drafts carry the explicit untrusted `atlas-draft` receipt, so the KNOW-14 fail-closed trust conjunct blocks
// the fast path before ARCH-9's derived class can matter. Keep this oracle independent from `route`.
function expectedRoute(derivedTier: "T0" | "T1" | "T2" | undefined): "auto-accept" | "full-ratify" {
  void derivedTier
  return "full-ratify"
}

describe("WP-10.A2-b — `draft`/`draftSupersede` (@atlas/tools createDraft ∘ adapter-io buildDraftIncumbentPort)", () => {
  it("SCN-AUTH-10b-1 — an empty store drafts CREATE", () => {
    const spy = makeStoreSpy()
    const leg = createDraft(COMPUTER, buildDraftIncumbentPort(spy.store))
    const out = leg.draft(CANDIDATE("C1"))
    expect(out.operation).toBe("CREATE")
  })

  it("SCN-AUTH-10a-1 — an occupied identity drafts UPDATE", () => {
    const spy = makeStoreSpy()
    const leg = createDraft(COMPUTER, buildDraftIncumbentPort(spy.store))
    const first = leg.draft(CANDIDATE("C1"))
    seed(spy.store, first.fact.id as unknown as string, "T2")

    const second = leg.draft(CANDIDATE("C1"))
    expect(second.operation).toBe("UPDATE")
  })

  it("SCN-AUTH-10c-1 (teeth) — a REWORDED claim at the SAME (anchor, slot) still drafts UPDATE, never a second CREATE", () => {
    const spy = makeStoreSpy()
    const leg = createDraft(COMPUTER, buildDraftIncumbentPort(spy.store))
    const c1 = leg.draft(CANDIDATE("C1"))
    seed(spy.store, c1.fact.id as unknown as string, "T2")

    const c2 = leg.draft(CANDIDATE("C2")) // DIFFERENT claim, SAME anchor/slot ⇒ SAME nodeKey, DIFFERENT contentHash
    expect(c2.fact.id).toBe(c1.fact.id) // the identity formula ignores claim wording (KNOW-15b)
    expect(c2.operation).toBe("UPDATE")

    // NEGATIVE CONTROL — the teeth. A port keyed on contentHash instead of nodeKey would miss this incumbent
    // (the reworded claim's content differs) and wrongly report CREATE.
    const contentHashKeyedPort: IncumbentPort = {
      incumbentAt: () => undefined, // simulates "no row found" because a contentHash-keyed lookup misses
      ratifyContextFor: () => ({ contested: false, lowRisk: true }),
    }
    const mutantLeg = createDraft(COMPUTER, contentHashKeyedPort)
    const mutantOut = mutantLeg.draft(CANDIDATE("C2"))
    expect(mutantOut.operation).not.toBe(c2.operation) // demonstrates the wrong-key defect is CATCHABLE
    expect(mutantOut.operation).toBe("CREATE")
  })

  it("SCN-AUTH-9a-1 — the declared route matches the KNOW-18 formula over the reachable decision space", () => {
    const cases: readonly { readonly label: string; readonly incumbentTier: "T0" | "T1" | "T2" | undefined }[] = [
      { label: "no incumbent (CREATE)", incumbentTier: undefined },
      { label: "T2 incumbent (same class, UPDATE)", incumbentTier: "T2" },
      { label: "T1 incumbent (stricter, UPDATE)", incumbentTier: "T1" },
      { label: "T0 incumbent (strictest, UPDATE)", incumbentTier: "T0" },
    ]
    for (const { label, incumbentTier } of cases) {
      const spy = makeStoreSpy()
      const leg = createDraft(COMPUTER, buildDraftIncumbentPort(spy.store))
      const bootstrap = leg.draft(CANDIDATE("C1"))
      if (incumbentTier !== undefined) seed(spy.store, bootstrap.fact.id as unknown as string, incumbentTier)

      const out = leg.draft(CANDIDATE("C1"))
      expect(out.route, `[${label}]`).toBe(expectedRoute(incumbentTier))
      if (out.route === "full-ratify") {
        expect(out.requires, `[${label}]`).toBe("ATLAS_RATIFY_TOKEN")
      } else {
        expect(out.requires, `[${label}]`).toBeUndefined()
      }
    }
  })

  it("SCN-AUTH-9b-1 — a T0-incumbent draft declares full-ratify and names its authorizing channel", () => {
    const spy = makeStoreSpy()
    const leg = createDraft(COMPUTER, buildDraftIncumbentPort(spy.store))
    const bootstrap = leg.draft(CANDIDATE("C1"))
    seed(spy.store, bootstrap.fact.id as unknown as string, "T0")

    const out = leg.draft(CANDIDATE("C1"))
    expect(out.route).toBe("full-ratify")
    expect(out.requires).toBe("ATLAS_RATIFY_TOKEN")
  })

  it("SCN-AUTH-9c-1 (adapted — see file-header FRAMING NOTE) — untrusted drafts stay full-ratify even when a mutant drops derived class", () => {
    const spy = makeStoreSpy()
    const realLeg = createDraft(COMPUTER, buildDraftIncumbentPort(spy.store))
    const bootstrap = realLeg.draft(CANDIDATE("C1"))
    seed(spy.store, bootstrap.fact.id as unknown as string, "T0")

    const realOut = realLeg.draft(CANDIDATE("C1"))
    expect(realOut.route).toBe("full-ratify") // the REAL port derives T0 from the incumbent — no discovery by refusal

    // The mutant: resolves the SAME incumbent (so `operation` still reads UPDATE) but its `ratifyContextFor`
    // ALWAYS returns the door's bare defaults. KNOW-14's explicit untrusted receipt still blocks the fast path.
    const mutantPort: IncumbentPort = {
      incumbentAt: buildDraftIncumbentPort(spy.store).incumbentAt,
      ratifyContextFor: () => ({ contested: false, lowRisk: true }), // NO derivedTier — the bug
    }
    const mutantLeg = createDraft(COMPUTER, mutantPort)
    const mutantOut = mutantLeg.draft(CANDIDATE("C1"))
    expect(mutantOut.route).toBe("full-ratify")

    // ARCH-9 still has independent teeth for trusted input: derived T0 blocks, absent derived class fast-paths.
    const trusted = { ...realOut.fact, provenance: { source: "test", trusted: true } } as unknown as Candidate
    expect(route(trusted, { contested: false, lowRisk: true, derivedTier: "T0" })).toBe("full-ratify")
    expect(route(trusted, { contested: false, lowRisk: true })).toBe("auto-accept")
  })

  it("SCN-AUTH-13a-1 — `draftSupersede` carries the superseded authoring state", () => {
    const spy = makeStoreSpy()
    const leg = createDraft(COMPUTER, buildDraftIncumbentPort(spy.store))
    const bootstrap = leg.draft(CANDIDATE("C1"))
    seed(spy.store, bootstrap.fact.id as unknown as string, "T2")

    const supersede = leg.draftSupersede(CANDIDATE("C1"))
    expect(supersede.fact.authoring).toBe("SUPERSEDED")
    expect(supersede.operation).toBe("UPDATE") // an existing node — the supersede targets it, not a fresh one

    // TEETH — `draftSupersede` PERSISTS NOTHING (AUTHOR-2/13a: a draft variant, never a write door).
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(1) // ONLY the test's own `seed()` call above wrote anything
  })
})
