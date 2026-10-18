// @atlas/adapter-io — test/governed-link-endpoint-existence.test.ts  (task #144 · the EXISTENCE fold)
//
// ── THE LEAK ────────────────────────────────────────────────────────────────────────────────────────────
// `governed-link.ts` resolved both endpoints against the projection (gate 2) BEFORE it ran the endpoint
// authz gate (gate 3), and answered an absent one with its own reason, `unknown node: <key> not in the
// current projection`. So ANY caller — `actor: ''` included — could tell that string from `unauthorized` and
// thereby learn whether a nodeKey names a current node, at keys it can name freely. The door's own header
// forbids exactly this: "a refusal may never tell the caller more about nodes it has no authority over than
// the gates it already CLEARED entitle it to."
//
// ── THE DECISION: THE TWO REFUSALS COLLAPSE, THEY ARE NOT REORDERED ─────────────────────────────────────
// Swapping the gates does not work, and the reason is structural rather than awkward. Authority is carried
// BY THE ROW (ADR-0007), so a nodeKey with no row has no scope; nothing can authorize anyone over it; and
// "not authorized" is the only answer that can be COMPUTED about it. Authz-first therefore SUBSUMES the
// existence gate instead of preceding it — one refusal, not two in a new order.
//
// Nor can the distinction be EARNED by clearing the other endpoint. A caller told "X is absent" once it
// holds authority over Y could still tell that apart from "X exists, outside your scope" — the same oracle,
// one gate deeper. There is no point on this ladder at which the answer is earned, because the thing that
// would grant it (a row) is the thing whose existence is in question.
//
// ── THE COST, STATED ────────────────────────────────────────────────────────────────────────────────────
// An operator who mistypes a 64-hex nodeKey is told `unauthorized`. That is why the reason PROSE names both
// causes and points at the read door: the discriminant can no longer carry the difference, so the
// remediation text must.
//
// ── HONEST SIZING — this closes no live escalation today ────────────────────────────────────────────────
// Node existence is NOT secret in this product. Measured through the real CLI: an actor the write door
// refuses runs `atlas query <scope>` and gets exit 0 with the full 64-hex nodeKey of every current node in
// that territory. `createQuery` takes neither actor nor policy, so the read leg is structurally incapable of
// authz. The value here is that the door's own invariant is now TRUE BY CONSTRUCTION, ahead of the authoring
// doors that will let a human NAME a nodeKey. Recorded so nobody reads this file as a breach report.

import { describe, it, expect } from "vitest"
import { reasonOf } from "./door-regression-support.js"
import { addressOf, blindTo, fact, fixture, POLICY } from "./governed-link-support.js"
import type { LinkFixture } from "./governed-link-support.js"
import { createGovernedLink } from "../src/governed-link.js"
import type { DiskStore } from "../src/store.js"
import type { AtlasPolicy } from "../src/policy.js"

// ── the THREE-SCOPE fixture ─────────────────────────────────────────────────────────────────────────────
// alice holds `core` + `other` — she is the ANTI-VACUITY WITNESS, the actor entitled to honest answers.
// mallory holds `other` only — authorized over her OWN node and a stranger to alice's, which is the shape
// that keeps mattering on this ladder: SHE CLEARS THE GATE IN FRONT AND IS JUDGED BY THE GATE UNDER TEST.
// `vault` is held by NOBODY, so it gives even alice an endpoint that EXISTS and is out of her reach — the
// yardstick the absent-endpoint refusal has to match byte for byte.
const TRI: AtlasPolicy = {
  ...POLICY,
  authz: { scopes: { core: ["alice"], other: ["mallory", "alice"], vault: [] } },
}
const N0 = fact({ claim: "alpha", scope: "core", tier: "T2" }) //  n0 — alice's
const N1 = fact({ claim: "mu", scope: "other", tier: "T2" }) //    n1 — mallory's (and alice's)
const N2 = fact({ claim: "vaulted", scope: "vault", tier: "T2" }) // n2 — EXISTS, nobody's

function door(store: DiskStore, actor: string, ratifyToken = "billy") {
  return createGovernedLink({ store, policy: TRI, actor, ratifyToken })
}

/** The refusal BYTES of one probe, with the two things every probe must also be true of. */
function refusalBytes(
  store: DiskStore,
  actor: string,
  a: string,
  b: string,
  retract: boolean,
  token = "billy",
): Buffer {
  const out = door(store, actor, token).link(a, b, retract)
  expect(out.linked, `${actor} ${a}/${b} retract=${String(retract)} must be refused`).toBe(false)
  return Buffer.from(out.rejected ?? "", "utf8")
}

// ── SCN-GL-2 family — what the folded gate still guarantees ─────────────────────────────────────────────

describe("SCN-GL-2 — an ABSENT endpoint is refused exactly as an out-of-reach one is", () => {
  /** alice refused because an endpoint EXISTS but lives in `vault`, which nobody holds. The yardstick. */
  function outOfScopeBytes(): Buffer {
    const fx = fixture([N0, N2])
    const bytes = refusalBytes(fx.store, "alice", "n0", "n1", false)
    expect(reasonOf(bytes.toString("utf8"))).toBe("unauthorized")
    expect(fx.persists()).toHaveLength(0)
    return bytes
  }

  it("SCN-GL-2 — an absent SECOND endpoint: byte-identical, no echoed key, nothing persisted", () => {
    const fx = fixture([N0, N1])
    expect(() => door(fx.store, "alice").link("n0", "n-nope")).not.toThrow() // a door REFUSES, never throws
    const bytes = refusalBytes(fx.store, "alice", "n0", "n-nope", false)
    // DISCRIMINANT EQUALITY (see `reasonOf`) — a substring assertion is blind in exactly the direction that
    // matters here, because every refusal's prose quotes other refusals by name.
    expect(reasonOf(bytes.toString("utf8"))).toBe("unauthorized")
    expect(Buffer.compare(bytes, outOfScopeBytes())).toBe(0) // …and not ONE byte of the prose differs
    expect(bytes.toString("utf8")).not.toContain("n-nope") // the probed key is never echoed back
    expect(fx.persists()).toHaveLength(0)
  })

  it("SCN-GL-2b — the FIRST endpoint, the mirror: the TypeError teeth survive the fold", () => {
    // MEASURED before this fold existed: deleting the `nodeA === undefined` guard left 221 files / 1614
    // tests green while turning the refusal into `TypeError: Cannot read properties of undefined (reading
    // 'contentHash')` — an uncaught crash out of a door its own header calls total. The guards are still
    // load-bearing after the fold: they must stay AHEAD of `rowAuthorized` in the `||` chain, and this case
    // is what says so. One refusal STRING is not one code path.
    const fx = fixture([N0, N1])
    expect(() => door(fx.store, "alice").link("n-nope", "n0")).not.toThrow() // THE MUTANT DIES HERE
    const bytes = refusalBytes(fx.store, "alice", "n-nope", "n0", false)
    expect(reasonOf(bytes.toString("utf8"))).toBe("unauthorized")
    expect(Buffer.compare(bytes, outOfScopeBytes())).toBe(0)
    expect(bytes.toString("utf8")).not.toContain("n-nope")
    expect(fx.persists()).toHaveLength(0)
  })

  it("SCN-GL-2c — BOTH endpoints absent is the SAME refusal, and names NEITHER key", () => {
    // This case used to pin WHICH of the two absent keys the door named first. There is nothing to name any
    // more, and that is the repair: naming one told the caller it had been resolved — looked up, and missed.
    const fx = fixture([N0, N1])
    const bytes = refusalBytes(fx.store, "alice", "n-absent-a", "n-absent-b", false)
    expect(Buffer.compare(bytes, outOfScopeBytes())).toBe(0)
    expect(bytes.toString("utf8")).not.toContain("n-absent-a")
    expect(bytes.toString("utf8")).not.toContain("n-absent-b")
    expect(fx.persists()).toHaveLength(0)
  })

  it("SCN-GL-2d — ANTI-VACUITY: alice is not simply blocked; the same door links her real nodes", () => {
    // Without this, everything above passes on a door that refuses alice unconditionally — in which case the
    // byte-identity is an accident, not a property. It also pins that the fold did not OVER-block: an absent
    // endpoint reading `unauthorized` must not make a present, in-scope one read `unauthorized` too.
    const fx = fixture([N0, N1])
    expect(door(fx.store, "alice").link("n0", "n1").linked).toBe(true)
    expect(fx.persists()).toHaveLength(1)
  })
})

// ── THE ORACLE MATRIX ───────────────────────────────────────────────────────────────────────────────────
//
// {pair state} × {store health} × {probed endpoints} × {actors} × {modes} × {ratify tokens}, hashing the
// refusal BYTES of every cell. The law: every UNAUTHORIZED actor gets the SAME discriminant and the SAME
// byte-string in EVERY one of their cells. A fix that cannot be shown byte-identical across states is not a
// fix — a single differing cell is a channel, and which channel it is (existence, storage health, pair
// state, class membership) depends only on which axis it varies along.
//
// The token axis is in here because gate order is the whole subject: an unauthorized actor must be refused
// by the ENDPOINT gate, so their refusal may not change when the ratify token does. If it does, some gate
// downstream of authz is answering first.

/** The pair `(n0,n1)` in each of the three states the stored relation can record, built through the REAL
 *  door by alice — never hand-written, so no cell is priced against a state no door can produce. */
function fixtureInState(state: "unlinked" | "asserted" | "retracted"): LinkFixture {
  const fx = fixture([N0, N1, N2])
  if (state === "unlinked") return fx
  expect(door(fx.store, "alice").link("n0", "n1").linked, "setup: the assertion must land").toBe(true)
  if (state === "retracted") {
    expect(door(fx.store, "alice").link("n0", "n1", true).linked, "setup: the retraction must land").toBe(true)
  }
  return fx
}

const PAIR_STATES = ["unlinked", "asserted", "retracted"] as const
const HEALTH = ["healthy", "pruned-n0", "pruned-n1", "pruned-n2", "pruned-all"] as const
/** Every probe an unauthorized actor can make that must come back with ONE answer. `a !== b` throughout —
 *  the DISTINCT gate is a pure function of the caller's own two arguments, discloses nothing about any node,
 *  and legitimately keeps its own reason (pinned separately in `governed-link.test.ts` SCN-GL-1). */
const PROBES = [
  ["n0", "n1"], //  both exist; n0 out of mallory's reach
  ["n1", "n0"], //  the mirror
  ["n0", "n2"], //  both exist; n2 is nobody's
  ["n1", "nX"], //  mallory's OWN node paired with an ABSENT key — she clears the gate on `a`
  ["nX", "n1"], //  the mirror
  ["n0", "nX"], //  an out-of-reach node paired with an absent key
  ["nX", "nY"], //  neither exists
] as const
const ACTORS = ["mallory", "", "nobody@nowhere"] as const
const TOKENS = ["billy", ""] as const

function blindFor(fx: LinkFixture, health: (typeof HEALTH)[number]): DiskStore {
  if (health === "healthy") return fx.store
  if (health === "pruned-all") return blindTo(fx.store, addressOf(N0), addressOf(N1), addressOf(N2))
  const target = health === "pruned-n0" ? N0 : health === "pruned-n1" ? N1 : N2
  return blindTo(fx.store, addressOf(target))
}

describe("THE ORACLE MATRIX — one answer, every cell", () => {
  it("every unauthorized actor gets the SAME discriminant and the SAME bytes in every cell", () => {
    const seen = new Map<string, string[]>() // refusal bytes (hex) → the cells that produced them
    let cells = 0
    for (const state of PAIR_STATES) {
      for (const health of HEALTH) {
        const fx = fixtureInState(state)
        const before = fx.persists().length // alice's setup writes; nothing below may add to them
        const store = blindFor(fx, health)
        for (const [a, b] of PROBES) {
          for (const actor of ACTORS) {
            for (const retract of [false, true]) {
              for (const token of TOKENS) {
                const label = `${state}/${health}/${a}~${b}/actor=${actor || "<empty>"}/retract=${String(retract)}/token=${token || "<empty>"}`
                const bytes = refusalBytes(store, actor, a, b, retract, token)
                const hex = bytes.toString("hex")
                const bucket = seen.get(hex)
                if (bucket === undefined) seen.set(hex, [label])
                else bucket.push(label)
                cells += 1
              }
            }
          }
        }
        expect(fx.persists(), `no probe may write (${state}/${health})`).toHaveLength(before)
      }
    }

    // THE LAW. Reported as the full partition rather than as a boolean, so a failure names the axis that
    // leaked instead of merely saying `2 !== 1`.
    const partition = [...seen].map(([hex, labels]) => ({
      discriminant: reasonOf(Buffer.from(hex, "hex").toString("utf8")),
      count: labels.length,
      firstCell: labels[0],
    }))
    expect(partition, JSON.stringify(partition, null, 1)).toHaveLength(1)
    expect(partition[0]!.discriminant).toBe("unauthorized")

    // ANTI-VACUITY. Two empty buffers also compare equal, and a matrix of zero cells is trivially uniform.
    expect(Buffer.from([...seen.keys()][0]!, "hex").length).toBeGreaterThan(0)
    expect(cells).toBe(PAIR_STATES.length * HEALTH.length * PROBES.length * ACTORS.length * 2 * TOKENS.length)
    expect(cells).toBe(1260)
  })

  it("ANTI-VACUITY — the axes the matrix holds constant ARE observable, to the actor entitled to them", () => {
    // Without this the matrix could be uniform because every cell is broken in the same way, or because the
    // prunes and the pair states never took effect. alice holds `core` + `other`, so she has cleared the
    // endpoint gate on `(n0,n1)` and is entitled to the honest answer on every axis the matrix varies.
    const distinct = new Set<string>()

    // STORE-HEALTH axis: healthy ⇒ the link is hers to make; pruned ⇒ the honest storage answer.
    expect(door(fixtureInState("unlinked").store, "alice").link("n0", "n1").linked).toBe(true)
    const prunedFx = fixtureInState("unlinked")
    const prunedOut = door(blindFor(prunedFx, "pruned-n0"), "alice").link("n0", "n1")
    expect(prunedOut.linked).toBe(false)
    expect(reasonOf(prunedOut.rejected)).toBe("unverifiable endpoint")
    distinct.add(reasonOf(prunedOut.rejected))

    // PAIR-STATE axis: retracting an unasserted pair, and re-asserting a retracted one, are distinguishable
    // to her and to nobody else — the gate-4.5 precedence rule, still intact after the fold.
    const notLinked = door(fixtureInState("unlinked").store, "alice").link("n0", "n1", true)
    expect(notLinked.linked).toBe(false)
    distinct.add(reasonOf(notLinked.rejected))
    const reAssert = door(fixtureInState("retracted").store, "alice").link("n0", "n1")
    expect(reAssert.linked).toBe(false)
    distinct.add(reasonOf(reAssert.rejected))

    // Three DIFFERENT answers to alice across the axes the matrix collapses to one for everyone else. That
    // is what makes the matrix a property of the gates rather than an artefact of the fixture.
    expect(distinct.size).toBe(3)
    expect(distinct.has("unauthorized")).toBe(false)
  })

  it("ANTI-VACUITY — the EXISTENCE axis is collapsed even for alice, and that is the decision", () => {
    // The one axis the anti-vacuity witness may NOT resolve, stated as a case so it cannot be mistaken for
    // an oversight. Nobody can hold authority over a node that does not exist, so nobody earns the answer —
    // alice included. If a future edit "restores the useful diagnostic" for authorized callers, this fails.
    const fx = fixtureInState("unlinked")
    const absent = refusalBytes(fx.store, "alice", "n0", "nX", false)
    const unreachable = refusalBytes(fx.store, "alice", "n0", "n2", false) // n2 exists, in nobody's `vault`
    expect(reasonOf(absent.toString("utf8"))).toBe("unauthorized")
    expect(Buffer.compare(absent, unreachable)).toBe(0)
  })
})
