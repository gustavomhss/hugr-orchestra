// @atlas/adapter-io — test/governed-promote.test.ts  (KNOW-8 — the governed PROMOTION door)
//
// Everything here runs the REAL `createGovernedPromote` over the REAL `createGovernedEmit`. The only doubles
// are the store (in-memory CAS + a seedable staging side) and the truth gate — i.e. exactly the two seams a
// unit test cannot bring, and neither of them is a gate this suite claims to have exercised.
//
// The cases are the traps this door was designed against, each of which has already been PAID FOR ONCE
// somewhere in this repo:
//   · the ratifier is really consulted (else KNOW-8 goes from vacuously-true to false);
//   · the count reported is SETTLED, never attempted (8 processes × 5 sites: 40 reported, 5 durable);
//   · `unreadable` never degrades to empty on a write path (one emit onto a torn sidecar erased 402 nodes);
//   · a row whose CAS bytes are gone is a PER-ROW refusal, not a skip and not a batch throw;
//   · one degenerate anchor does not take the batch down;
//   · an ungranted `atlas:mined` refuses, and that refusal is the CORRECT behaviour, not an obstacle;
//   · a mined identity colliding with a governed node fails closed — including against a LEGACY row that
//     predates the ADR-0007 governance carrier, which is the shape that reads UNCONFIRMABLE.

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { CurrentNode } from "@atlas/knowledge"
import { createGovernedEmit } from "../src/governed-emit.js"
import {
  createGovernedPromote,
  REJECTED_CANDIDATE_UNREADABLE,
  REJECTED_DEGENERATE_CANDIDATE,
} from "../src/governed-promote.js"
import type { GroundedFact } from "@atlas/knowledge"
import type { AtlasPolicy } from "../src/policy.js"
import type { DiskStore } from "../src/store.js"
import { HOLDS_GATE, NA_GATE } from "./harness/governed-fixtures.js"
import {
  CURATOR,
  CURATOR_POLICY,
  MINED_SCOPE,
  NO_CURATOR_POLICY,
  makePromoteFixture,
  minedFact,
  realKey,
} from "./harness/promote-fixtures.js"
import { reasonOf } from "./door-regression-support.js"

const AT = asHash("deadbeef")

/** The door under test, composed EXACTLY as `compose.ts` composes it: the governed emit leg with
 *  `origin:'promoted'`, over the same store the staging read rides. */
function promoter(opts: {
  store: DiskStore
  policy?: AtlasPolicy
  actor?: string
  ratifyToken?: string
  gate?: typeof HOLDS_GATE
  origin?: "authored" | "promoted"
}): { promote: (at: typeof AT) => ReturnType<ReturnType<typeof createGovernedPromote>["promote"]> } {
  return createGovernedPromote({
    store: opts.store,
    emit: createGovernedEmit({
      store: opts.store,
      gate: opts.gate ?? HOLDS_GATE,
      policy: opts.policy ?? CURATOR_POLICY,
      actor: opts.actor ?? CURATOR,
      origin: opts.origin ?? "promoted",
      ...(opts.ratifyToken !== undefined ? { ratifyToken: opts.ratifyToken } : {}),
    }).emit,
  })
}

describe("KNOW-8 — the promotion door consults the ratifier (the fast path does not apply)", () => {
  it("a staged candidate with NO ratify token is REFUSED `unratified` — nothing durable", () => {
    // teeth: breaks-on "the default context is used". Drop `origin:'promoted'` (or delete the `!promoted`
    // conjunct in `route`) and this candidate — T2 ∧ advisory ∧ grounded — fast-paths to `auto-accept`, the
    // token is never read, and `promoted` comes back 1 with a durable row.
    const fx = makePromoteFixture()
    fx.stage(minedFact({ anchor: "src/pay.ts::charge", claimNorm: "charge() re-reads the ledger" }))

    const out = promoter({ store: fx.store }).promote(AT) // no ratifyToken

    expect(out.read).toBe(true)
    expect(out.candidates).toBe(1)
    expect(out.promoted).toBe(0)
    expect(out.refused).toBe(1)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("unratified")
    expect(fx.persists()).toHaveLength(0) // NOTHING was published
  })

  it("CONTROL — the SAME candidate through an `authored` leg auto-accepts with no token at all", () => {
    // The other half of the teeth, and the reason the case above is not vacuous: the refusal is caused by
    // `origin`, not by anything about the fact. Same store, same policy, same actor, same absent token.
    const fx = makePromoteFixture()
    fx.stage(minedFact({ anchor: "src/pay.ts::charge", claimNorm: "charge() re-reads the ledger" }))

    const out = promoter({ store: fx.store, origin: "authored" }).promote(AT)

    expect(out.promoted).toBe(1)
    expect(fx.persists()).toHaveLength(1)
  })

  it("WITH a ratifier named, the same candidate is promoted and the row lands in the PROJECTION", () => {
    const fx = makePromoteFixture()
    const fact = minedFact({ anchor: "src/pay.ts::charge", claimNorm: "charge() re-reads the ledger" })
    fx.stage(fact)

    const out = promoter({ store: fx.store, ratifyToken: "seat:orchestrator" }).promote(AT)

    expect(out.promoted).toBe(1)
    expect(out.refused).toBe(0)
    expect(out.rows[0]!.settled).toBe(true)
    // The DURABLE evidence, asserted on the projection rather than on the door's own answer.
    const row = fx.projection().current.get(realKey(fact))
    expect(row).toBeDefined()
    expect(row!.claims).toEqual(["charge() re-reads the ledger"])
    expect(row!.scope).toBe(MINED_SCOPE) // the ADR-0007 governance carrier, stamped by the emit door
    expect(row!.tier).toBe("T2")
  })

  it("a `T0` staged candidate still needs BILLY — promotion does not launder the class", () => {
    // A mined row is T2 by construction, but the door must not become a way to commit a T0 with an ordinary
    // token merely because it arrived through staging. The KNOW-8 ladder is unchanged underneath.
    const fx = makePromoteFixture()
    fx.stage(minedFact({ anchor: "src/pay.ts::invariant", claimNorm: "a T0 claim", tier: "T0" }))

    expect(promoter({ store: fx.store, ratifyToken: "seat:orchestrator" }).promote(AT).promoted).toBe(0)
    expect(promoter({ store: fx.store, ratifyToken: "billy" }).promote(AT).promoted).toBe(1)
  })
})

describe("KNOW-8 — the count reported is SETTLED, never attempted", () => {
  it("3 staged · 1 promotable ⇒ `promoted: 1`, and `promoted + refused === candidates`", () => {
    // teeth: breaks-on "the count is the number of rows ATTEMPTED" — return `rows.length` (or the staged
    // count) as `promoted` and this reads 3. The measured shape of that defect: 8 mine processes × 5 sites
    // reported 40 candidates committed with 5 durable, every process exiting 0.
    const fx = makePromoteFixture()
    const ok = minedFact({ anchor: "src/a.ts::one", claimNorm: "promotable" })
    fx.stage(ok)
    // (2) an ungrounded-at-the-door row: the gate answers NA for THIS fact only (see the per-fact gate below)
    const ungrounded = minedFact({ anchor: "src/b.ts::two", claimNorm: "fails the truth door" })
    fx.stage(ungrounded)
    // (3) a row whose bytes were pruned out of CAS.
    const holed = minedFact({ anchor: "src/c.ts::three", claimNorm: "bytes are gone" })
    fx.stageRowWithoutBytes(holed)

    const perFact = {
      gateHolds: (n: GroundedFact) =>
        (n as { claimNorm?: string }).claimNorm === "fails the truth door" ? "NA" : "HOLDS",
    } as typeof HOLDS_GATE
    const out = promoter({ store: fx.store, ratifyToken: "seat:orchestrator", gate: perFact }).promote(AT)

    expect(out.candidates).toBe(3)
    expect(out.promoted).toBe(1) // SETTLED — exactly the one row the store now holds because of this call
    expect(out.refused).toBe(2)
    expect(out.promoted + out.refused).toBe(out.candidates)
    // and the projection agrees with the number, which is the assertion the count itself cannot make
    expect([...fx.projection().current.keys()]).toEqual([realKey(ok)])
  })

  it("a fully-refused pass reports 0 promoted and publishes nothing", () => {
    const fx = makePromoteFixture()
    fx.stage(minedFact({ anchor: "src/a.ts::one", claimNorm: "one" }))
    fx.stage(minedFact({ anchor: "src/b.ts::two", claimNorm: "two" }))

    const out = promoter({ store: fx.store, ratifyToken: "tok", gate: NA_GATE }).promote(AT)

    expect(out.candidates).toBe(2)
    expect(out.promoted).toBe(0)
    expect(fx.persists()).toHaveLength(0)
    for (const r of out.rows) expect(reasonOf(r.rejected)).toBe("ungrounded")
  })

  it("an honestly EMPTY staging reports 0 candidates, 0 promoted, and `read: true`", () => {
    const out = promoter({ store: makePromoteFixture().store, ratifyToken: "tok" }).promote(AT)
    expect(out).toEqual({ read: true, candidates: 0, promoted: 0, refused: 0, rows: [] })
  })
})

describe('KNOW-8 — `unreadable` staging is a REFUSAL, never "0 candidates"', () => {
  for (const refusal of ["unreadable", "untrusted", "contended"] as const) {
    it(`a \`${refusal}\` staging read refuses whole — nothing read, nothing attempted`, () => {
      // teeth: breaks-on "a refused staging read degrades to the empty projection". Swallowing `settled:false`
      // here is the same amplification that turned a torn sidecar read into a 402-node erasure, pointed the
      // other way: it would report a clean, complete promotion of nothing over candidates that are still on
      // disk. Asserted on the WHOLE record so `read:false` cannot be confused with `candidates:0`.
      const fx = makePromoteFixture()
      fx.stage(minedFact({ anchor: "src/a.ts::one", claimNorm: "still staged, just unread" }))
      fx.refuseStaging(refusal)

      const out = promoter({ store: fx.store, ratifyToken: "tok" }).promote(AT)

      expect(out).toEqual({ read: false, refusal, candidates: 0, promoted: 0, refused: 0, rows: [] })
      expect(out.read).toBe(false) // and `read:false` is NOT `candidates:0` — the distinction IS the fix
      expect(fx.persists()).toHaveLength(0)
    })
  }

  it("the staging READ writes nothing — no CAS put, no published generation", () => {
    // The read-only decision `store.ts` documents (`commitStaging((p) => ({ out: p }))`) short-circuits
    // before any CAS put. teeth: return a `next` from that decision and the staging sidecar is republished
    // by a command whose whole contract is that it only reads it.
    const fx = makePromoteFixture()
    const before = fx.puts().length
    promoter({ store: fx.store, ratifyToken: "tok" }).promote(AT)
    expect(fx.puts()).toHaveLength(before)
  })
})

describe("KNOW-8 — one bad row is that ROW's refusal, never the batch's", () => {
  it("a row whose CAS bytes are GONE is refused BY NAME, and the batch continues past it", () => {
    // teeth: breaks-on "a missing rehydration is skipped" (the row vanishes from the report and `candidates`
    // under-counts) and on "a missing rehydration throws" (the batch dies and the healthy rows are lost).
    // `mine` puts the bytes BEFORE it publishes the row, so this state means the CAS was pruned underneath —
    // a real, recoverable fault a curator has to be told about, per row.
    const fx = makePromoteFixture()
    const holed = minedFact({ anchor: "src/a.ts::gone", claimNorm: "bytes pruned" })
    const healthy = minedFact({ anchor: "src/b.ts::here", claimNorm: "bytes present" })
    fx.stageRowWithoutBytes(holed)
    fx.stage(healthy)

    const out = promoter({ store: fx.store, ratifyToken: "tok" }).promote(AT)

    expect(out.candidates).toBe(2) // the holed row is REPORTED, not skipped
    expect(out.promoted).toBe(1)
    const bad = out.rows.find((r) => r.nodeKey === realKey(holed))!
    expect(bad.settled).toBe(false)
    expect(bad.rejected).toBe(REJECTED_CANDIDATE_UNREADABLE) // EXACT constant, never a substring
    expect(out.rows.find((r) => r.nodeKey === realKey(healthy))!.settled).toBe(true)
  })

  it("a DEGENERATE-anchor row is refused BY NAME, and the batch continues past it", () => {
    // `governed-emit.ts` gate 2.1 throws `DegenerateAnchorError` by design for a grounding that names no
    // single containing unit. teeth: remove the catch and this test dies with an uncaught throw, taking the
    // healthy candidate with it — one unpromotable row would make the whole curator pass unusable.
    const fx = makePromoteFixture()
    const degenerate = {
      ...minedFact({ anchor: "src/a.ts::x", claimNorm: "no single containing unit" }),
      grounding: { entries: [] },
    } as unknown as GroundedFact
    const healthy = minedFact({ anchor: "src/b.ts::here", claimNorm: "bytes present" })
    // The row carries a LABEL, not a derivable identity: `nodeKey` throws on this fact, so no key could be
    // minted for it — which is precisely why the door has to survive meeting it.
    fx.stageWithKey(degenerate, "nk-degenerate-label")
    fx.stage(healthy)

    const out = promoter({ store: fx.store, ratifyToken: "tok" }).promote(AT)

    expect(out.candidates).toBe(2)
    expect(out.promoted).toBe(1)
    expect(out.rows.filter((r) => r.rejected === REJECTED_DEGENERATE_CANDIDATE)).toHaveLength(1)
    expect(out.rows.find((r) => r.nodeKey === realKey(healthy))!.settled).toBe(true)
  })

  it("a throw that is NOT a degenerate anchor PROPAGATES — a broken disk is not a governance decision", () => {
    // The other direction, and the one a broad `catch` gets wrong: laundering an infrastructure failure into
    // a per-row "refusal" would report a dead store as a considered verdict about a candidate.
    const fx = makePromoteFixture()
    fx.stage(minedFact({ anchor: "src/a.ts::one", claimNorm: "one" }))
    const exploding = createGovernedPromote({
      store: fx.store,
      emit: () => {
        throw new Error("ENOSPC: no space left on device")
      },
    })
    expect(() => exploding.promote(AT)).toThrowError(/ENOSPC/)
  })
})

describe("KNOW-11 — an ungranted `atlas:mined` refuses, and that is the CORRECT behaviour", () => {
  it("with `atlas:mined` undeclared in the policy, every promotion refuses `unauthorized`", () => {
    // `.atlas/policy.json` does not grant `atlas:mined` until an admin appoints a curator, and `actorInScope`
    // is fail-closed on an undeclared scope. This is PINNED as correct rather than worked around: a promotion
    // door that could write an unowned scope would make "mining has no actor, so nobody owns a mined node"
    // — the ADR-0008 provenance property — false.
    const fx = makePromoteFixture()
    fx.stage(minedFact({ anchor: "src/a.ts::one", claimNorm: "one" }))

    const out = promoter({ store: fx.store, policy: NO_CURATOR_POLICY, ratifyToken: "tok" }).promote(AT)

    expect(out.promoted).toBe(0)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("unauthorized")
    expect(fx.persists()).toHaveLength(0)
  })

  it("an EMPTY actor is in no scope — the fail-closed v1 default denies every promotion", () => {
    const fx = makePromoteFixture()
    fx.stage(minedFact({ anchor: "src/a.ts::one", claimNorm: "one" }))
    const out = promoter({ store: fx.store, actor: "", ratifyToken: "tok" }).promote(AT)
    expect(out.promoted).toBe(0)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("unauthorized")
  })
})

describe("ARCH-10 — a mined identity colliding with a GOVERNED node fails closed", () => {
  const ANCHOR = "src/auth.ts::verify"

  it("against a CARRIED incumbent in another scope: `unauthorized for target`", () => {
    const fx = makePromoteFixture()
    // A governed T0 node alice ratified in `core`, at an identity a mined candidate will collide with.
    const governed = minedFact({ anchor: ANCHOR, claimNorm: "the billy-ratified T0 claim", scope: "core", tier: "T0" })
    const h = fx.store.put(governed as never) as unknown as string
    fx.seedProjection([
      {
        nodeKey: realKey(governed),
        family: "advisory",
        contentHash: h,
        claims: ["the billy-ratified T0 claim"],
        scope: "core",
        tier: "T0",
      },
    ])
    // The mined candidate: same anchor ⇒ SAME minted nodeKey (neither scope nor tier is in the identity).
    const mined = minedFact({ anchor: ANCHOR, claimNorm: "INJECTED from source-file text" })
    fx.stage(mined)
    expect(realKey(mined)).toBe(realKey(governed)) // PREMISE: the collision is real, not hoped for

    const out = promoter({ store: fx.store, ratifyToken: "tok" }).promote(AT)

    expect(out.promoted).toBe(0)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("unauthorized for target")
    // The governed node is UNTOUCHED — no set-union of a mined string into a ratified claim.
    expect(fx.projection().current.get(realKey(governed))!.claims).toEqual(["the billy-ratified T0 claim"])
  })

  it("against a LEGACY CARRIER-LESS incumbent (pre-ADR-0007 row): still fails closed", () => {
    // THE SHAPE THAT MUST BE CHECKED SEPARATELY. `incumbentDecision` reads authority off the ROW's `scope`;
    // a row with NO `scope` PROPERTY AT ALL takes the ADR-0007 legacy fallback to the authenticated CAS
    // bytes. So a fresh-row test proves nothing about the rows that actually predate the carrier — and those
    // are exactly the rows a first promotion in an existing repo will meet.
    const fx = makePromoteFixture()
    const governed = minedFact({ anchor: ANCHOR, claimNorm: "the pre-carrier claim", scope: "core", tier: "T0" })
    const h = fx.store.put(governed as never) as unknown as string
    const legacyRow: CurrentNode = {
      nodeKey: realKey(governed),
      family: "advisory",
      contentHash: h,
      claims: ["the pre-carrier claim"],
      // NO `scope`, NO `tier` — the carrier-less shape. Written as an omission, not as `undefined`.
    }
    expect("scope" in legacyRow).toBe(false) // PREMISE: this really is the legacy shape
    fx.seedProjection([legacyRow])
    fx.stage(minedFact({ anchor: ANCHOR, claimNorm: "INJECTED from source-file text" }))

    const out = promoter({ store: fx.store, ratifyToken: "tok" }).promote(AT)

    // Authority falls back to the BYTES, which say `core`; the curator holds only `atlas:mined`.
    expect(out.promoted).toBe(0)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("unauthorized for target")
    expect(fx.projection().current.get(realKey(governed))!.claims).toEqual(["the pre-carrier claim"])
  })

  it("against a legacy row whose BYTES are gone too: authority is unconfirmable ⇒ refused", () => {
    // Neither source can establish authority, so the door must refuse rather than treat "cannot tell" as
    // "nobody objects". A curator-scoped promotion is not a licence to adopt an unidentifiable node.
    const fx = makePromoteFixture()
    const governed = minedFact({ anchor: ANCHOR, claimNorm: "unreadable", scope: "core" })
    fx.seedProjection([
      { nodeKey: realKey(governed), family: "advisory", contentHash: "ch-never-put", claims: ["unreadable"] },
    ])
    fx.stage(minedFact({ anchor: ANCHOR, claimNorm: "INJECTED" }))

    const out = promoter({ store: fx.store, ratifyToken: "tok" }).promote(AT)

    expect(out.promoted).toBe(0)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("unauthorized for target")
  })
})

describe("KNOW-8 — idempotence, without a second mutable state machine", () => {
  it("a second pass over the SAME staging re-presents the rows and leaves the store where it was", () => {
    // MEASURED, not asserted, and reported honestly rather than as the "refusal" it is not. Staging has no
    // delete and the two sidecars have no shared commit, so a promoted row is NOT removed and NOT marked —
    // a marker would be a second state machine that can disagree with the projection. The second pass
    // therefore re-presents the same rows to the same door, where the incumbent guard and the KNOW-15 upsert
    // decide. What actually happens: the row is re-ratified (it still costs a token, so it can never become
    // a silent self-commit) and the STORE does not move — same nodeKey, same contentHash, same claim set.
    const fx = makePromoteFixture()
    const fact = minedFact({ anchor: "src/a.ts::one", claimNorm: "one" })
    fx.stage(fact)
    const door = promoter({ store: fx.store, ratifyToken: "tok" })

    const first = door.promote(AT)
    const afterFirst = fx.projection().current.get(realKey(fact))!
    const second = door.promote(AT)
    const afterSecond = fx.projection().current.get(realKey(fact))!

    expect(first.promoted).toBe(1)
    expect(second.promoted).toBe(1) // the report describes THIS invocation; it does not invent a 0
    // The state, which is what "idempotent" is actually a claim about:
    expect(afterSecond.contentHash).toBe(afterFirst.contentHash)
    expect(afterSecond.claims).toEqual(afterFirst.claims)
    expect(afterSecond.claims).toEqual(["one"]) // no set-union duplicate, no second claim
    expect(fx.projection().current.size).toBe(1)
  })

  it("a second pass with the token WITHDRAWN refuses — promotion never becomes tokenless on a re-run", () => {
    // The incumbent now carries `(atlas:mined, T2)`, so the door DERIVES T2 and joins it — and `origin`
    // still removes the fast path. teeth: an implementation that fast-paths "an update to a node I already
    // own" would make the second promotion tokenless, which is a self-commit by the back door.
    const fx = makePromoteFixture()
    fx.stage(minedFact({ anchor: "src/a.ts::one", claimNorm: "one" }))
    expect(promoter({ store: fx.store, ratifyToken: "tok" }).promote(AT).promoted).toBe(1)

    const out = promoter({ store: fx.store }).promote(AT) // no token this time
    expect(out.promoted).toBe(0)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("unratified")
  })
})
