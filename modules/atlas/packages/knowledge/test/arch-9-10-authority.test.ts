// @atlas/knowledge — test/arch-9-10-authority.test.ts  (ARCH-D3 · ADR-0010)
//
// THE CONFUSED DEPUTY, AT THE LAYER WHERE IT PHYSICALLY HAPPENS. ADR-0007 put the incumbent guard in ONE
// caller (`adapter-io/governed-emit.ts` §2.25). The reducer it protects — `upsert` — still had no notion of
// the incumbent's authority at all, so the safety of a ratified node was a property of one caller's gate
// ORDER rather than a property of the write itself. These scenarios pin the rule in the reducer: a write
// that LOWERS the governance class of the node it lands on, or MOVES that node to another scope, is refused
// by `upsert`, whoever calls it.
//
// DISCRIMINANT, NOT SUBSTRING. Every refusal below is asserted on the thrown `GovernanceAuthorityError`'s
// `.reason` FIELD, never on a substring of its message. The refusal prose in this repo quotes other refusal
// constants BY NAME (`governed-emit-reasons.ts`), so `toContain('governance-downgrade')` is also satisfied by
// a message that merely mentions the downgrade rule — a substring assertion cannot say WHICH gate refused.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef, Tier } from "@atlas/contracts"
import type { Grounding } from "@atlas/grounding"
import type { Candidate } from "@atlas/knowledge"

import { upsert, emptyStore, GovernanceAuthorityError } from "../src/write/upsert.js"
import type { StoreProjection, WriteRequest } from "../src/write/upsert.js"
import { nodeKey } from "../src/write/router.js"
import { route } from "../src/ratify/fastpath.js"
import { stage, ratify } from "../src/ratify/ratify.js"

// ── fixtures — obviously synthetic; no value here resembles a real credential ──────────────────────────

const anchor = (qualifiedPath: string): StructRef => ({
  kind: "symbol",
  qualifiedPath,
  subtreeHash: asSubtreeHash("st-synthetic-1"),
})
const grounded: Grounding = { entries: [{ anchor: anchor("src/auth.ts::verify"), path: "src/auth.ts" }] }

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  claimText: "auth verifies the signature before use",
  claimNorm: "auth verifies signature",
  slot: "invariant",
  grounding: grounded,
  provenance: { source: "agent:explorer", trusted: true },
  tier: "T2",
  ...over,
})

const KEY = String(nodeKey(candidate()))

const req = (over: Partial<WriteRequest> = {}): WriteRequest => ({
  nodeKey: KEY,
  contentHash: "ch-synthetic",
  family: "advisory",
  claimNorm: "auth verifies signature",
  ...over,
})

/** A projection holding ONE billy-ratified T0 node at `KEY`, scoped to `core`. */
function withRatifiedT0(): StoreProjection {
  return upsert(
    emptyStore(),
    req({ contentHash: "ch-t0", claimNorm: "billy-ratified T0 claim", tier: "T0", scope: "core" }),
  ).store
}

/** Run `upsert` and return the refusal DISCRIMINANT, or `undefined` if it was admitted. */
function refusalOf(store: StoreProjection, r: WriteRequest): string | undefined {
  try {
    upsert(store, r)
    return undefined
  } catch (e) {
    if (e instanceof GovernanceAuthorityError) return e.reason
    throw e // any OTHER throw is a fault, not a refusal — never swallowed
  }
}

// ── ARCH-10 — an UPDATE may not lower the authority of what it replaces ────────────────────────────────

describe("ARCH-10 — authority comes from the RESOURCE, enforced by the reducer (ADR-0010)", () => {
  it("SCN-AUTH-1: a T2 advisory CANNOT displace a billy-ratified T0 node at the same nodeKey", () => {
    const store = withRatifiedT0()
    const t0 = store.current.get(KEY)!
    expect(t0.tier).toBe("T0") // PREMISE: the resource declares the strictest class
    // PREMISE: the identity collides — `tier` is NOT in the nodeKey (hash(primaryAnchorId || slot)).
    expect(String(nodeKey(candidate({ tier: "T0" as Tier })))).toBe(String(nodeKey(candidate({ tier: "T2" as Tier }))))

    const attack = req({ contentHash: "ch-t2", claimNorm: "UNRATIFIED injected claim", tier: "T2", scope: "core" })
    expect(refusalOf(store, attack)).toBe("governance-downgrade")

    // AND the projection is untouched — a refusal that still mutated would be the same erasure by another name.
    expect(store.current.get(KEY)!.contentHash).toBe("ch-t0")
    expect(store.current.get(KEY)!.claims).toEqual(["billy-ratified T0 claim"])
  })

  it("SCN-AUTH-2: an off-lattice class cannot walk past the guard onto a T0 node", () => {
    const store = withRatifiedT0()
    for (const bogus of ["T3", "t0", " T0", "toString", "__proto__", null, 0, undefined, ""]) {
      const attack = req({ contentHash: "ch-x", tier: bogus as unknown as Tier, scope: "core" })
      expect(refusalOf(store, attack)).toBe("governance-downgrade")
    }
  })

  it("SCN-AUTH-3: relocating a carried node to another scope is refused (the other half of the pair)", () => {
    const store = withRatifiedT0()
    const attack = req({ contentHash: "ch-y", tier: "T0", scope: "attacker-private" })
    expect(refusalOf(store, attack)).toBe("governance-relocation")
  })

  it("SCN-AUTH-4: the guard does NOT over-block — re-stating the class, and RAISING it, both pass", () => {
    const store = withRatifiedT0()
    expect(refusalOf(store, req({ contentHash: "ch-restate", tier: "T0", scope: "core" }))).toBeUndefined()

    const t2Store = upsert(emptyStore(), req({ contentHash: "ch-t2", tier: "T2", scope: "core" })).store
    expect(refusalOf(t2Store, req({ contentHash: "ch-raise", tier: "T0", scope: "core" }))).toBeUndefined()
  })

  it("SCN-AUTH-5: a node that carries NO class is not protected by this gate — the honest limit, pinned", () => {
    // The reducer can only enforce what the RESOURCE declares. A carrier-less row (minted before ADR-0007,
    // or by an ungoverned caller) has no class to derive authority from, so this gate stands aside and the
    // door's CAS-bytes fallback is the only thing between it and a displacement. Pinned so the limit is a
    // stated property, not an accident someone later reads as coverage.
    const legacy = upsert(emptyStore(), req({ contentHash: "ch-legacy" })).store
    expect(legacy.current.get(KEY)!.tier).toBeUndefined()
    expect(refusalOf(legacy, req({ contentHash: "ch-any", tier: "T2", scope: "whatever" }))).toBeUndefined()
  })
})

// ── ARCH-9 — a gate-selecting field is derived, never chosen ───────────────────────────────────────────

describe("ARCH-9 — the ratification route is not selectable by the payload (ADR-0010)", () => {
  it("SCN-AUTH-6: a door-derived class OVERRIDES the payload-declared one and re-arms the gate", () => {
    const declaredT2 = candidate({ tier: "T2" as Tier })
    // Without a derived class the payload still selects (the ARCH-D3b CREATE leg — OPEN, owner DEFINE):
    expect(route(declaredT2, { contested: false, lowRisk: true })).toBe("auto-accept")
    // With one, the payload's self-declaration cannot buy the fast path.
    expect(route(declaredT2, { contested: false, lowRisk: true, derivedTier: "T0" })).toBe("full-ratify")
    expect(route(declaredT2, { contested: false, lowRisk: true, derivedTier: "T1" })).toBe("full-ratify")
  })

  it("SCN-AUTH-7: the join is one-way — a derived class can only make the gate HARDER, never softer", () => {
    const declaredT0 = candidate({ tier: "T0" as Tier })
    expect(route(declaredT0, { contested: false, lowRisk: true, derivedTier: "T2" })).toBe("full-ratify")
  })

  it("SCN-AUTH-8: an off-lattice derived class fails CLOSED, never open", () => {
    const declaredT2 = candidate({ tier: "T2" as Tier })
    for (const bogus of ["T3", "t0", " T2", "toString", "__proto__", null, 0, ""]) {
      expect(route(declaredT2, { contested: false, lowRisk: true, derivedTier: bogus as unknown as Tier })).toBe(
        "full-ratify",
      )
    }
  })
})

// ── the ratifier token — CHARACTERIZATION, not a fix ───────────────────────────────────────────────────

describe("KNOW-8 ratifier token — an ADVISORY MARKER, pinned as such (ADR-0010)", () => {
  it("SCN-AUTH-9: any non-empty string ratifies a T1 — the token authenticates NOTHING", () => {
    // Not a bug report in test form: a pin, so that no later reader (or doc) can describe this as
    // authentication without turning a test red. The value below is obviously synthetic.
    for (const by of ["lead", "anybody", ".", " ", "not-a-real-credential"]) {
      expect(ratify(stage(candidate({ tier: "T1" as Tier })), { by }).committed).toBe(true)
    }
    expect(ratify(stage(candidate({ tier: "T1" as Tier })), { by: "" }).committed).toBe(false)
  })

  it("SCN-AUTH-10: the T0 gate is a STRING COMPARISON against a caller-settable value", () => {
    const t0 = stage(candidate({ tier: "T0" as Tier }))
    expect(ratify(t0, { by: "billy" }).committed).toBe(true)
    expect(ratify(t0, { by: "someExplorer" }).committed).toBe(false)
    // The composition root sources `by` from `process.env.ATLAS_RATIFY_TOKEN` (adapter-io/compose.ts) with
    // no verification, so whoever can invoke the CLI can supply the string on the left. Pinned so the
    // product's own tests state the posture (ARCH-12) rather than implying a signature check.
  })
})
