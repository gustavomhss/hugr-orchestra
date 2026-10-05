// @atlas/adapter-io — test/governance-carrier-controls.test.ts  (ADR-0007 carrier — the CONTROLS)
//
// The held `door-regression-reject-disclosure` case proves the DEFECT is fixed. These are the controls that
// prove the FIX did not buy that at the price of something worse. Three independent things are pinned:
//
//   A. BACK-COMPAT, against a sidecar written in the OLD SHAPE BY HAND — raw JSON with no `scope`/`tier` on
//      the row, exactly what a projection minted before this WP looks like on disk. It must LOAD (the whole
//      file, not a degraded empty), must REFUSE, must never GRANT, and must never THROW.
//   B. IDENTITY DID NOT MOVE. The carrier is a ROW field; `nodeKey` must not start folding `scope`/`tier`,
//      which would silently re-address every stored fact and split every node from its own history. Pinned
//      with LITERAL digests, because this suite is otherwise structurally blind to a hash change: every
//      other assertion recomputes both sides, so a formula change moves both and stays green.
//   C. THE ORACLE STAYS SHUT, asserted on BYTES (`Buffer.compare`), not on shape. A `toBe` on two strings is
//      already byte-exact in JS, but the property under test is "no bit differs", so it is measured as bytes.
//
// Everything runs through the REAL `createDiskStore` + the REAL door — no store double.

import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { IDENTITY_SCHEMA } from "../src/identity-schema.js"
import { join } from "node:path"
import { describe, expect, it, afterEach } from "vitest"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createGovernedLink } from "../src/governed-link.js"
import { rehydrateProjection } from "../src/store.js"
import { AT, HOLDS, advisoryFact, freshWorkspace, keyOf, policyOf, reasonOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

const ANCHOR = "src/core.ts::carrier"

let ws: Workspace | undefined
afterEach(() => {
  if (ws !== undefined) ws.dispose()
  ws = undefined
})

/** The projection sidecar path for a workspace — `<root>/projection.json`, beside the `cas/` root (D4). */
function sidecarOf(w: Workspace): string {
  return join(w.casPath, "..", "projection.json")
}

describe("ADR-0007 carrier — controls", () => {
  it("CARRIER-1 — the row carries (scope, tier) and both survive a REAL disk round-trip", () => {
    ws = freshWorkspace()
    const alice = createGovernedEmit({
      store: ws.store,
      gate: HOLDS,
      policy: policyOf({ core: ["alice"] }),
      actor: "alice",
      ratifyToken: "billy",
    })
    const fact = advisoryFact({ anchor: ANCHOR, claimNorm: "a core claim", scope: "core", tier: "T1" })
    expect(alice.emit(fact, AT).emitted).toBe(true)

    // Read the SIDECAR BYTES, not the in-process value — the carrier has to survive JSON, which is the whole
    // point of calling it a round-trip. `WireProjection` serializes the entire `CurrentNode`, so the two new
    // optional fields ride along exactly as `sameAs` does; this asserts that rather than assuming it.
    const wire = JSON.parse(readFileSync(sidecarOf(ws), "utf8")) as { current: [string, Record<string, unknown>][] }
    expect(wire.current[0]![1].scope).toBe("core")
    expect(wire.current[0]![1].tier).toBe("T1")

    const row = rehydrateProjection(ws.store).current.get(keyOf(fact))
    expect(row?.scope).toBe("core")
    expect(row?.tier).toBe("T1")
  })

  /** An OLD-SHAPE sidecar, authored BY HAND: a row with no `scope`/`tier` property at all, exactly what a
   *  projection minted before the carrier looks like on disk. Emitting through the door and deleting the
   *  fields afterwards would prove nothing about a file this code has never seen. Returns the node key.
   *
   *  `identity` carries the #112 stamp because the variable under study here is the ROW SHAPE (a carrier-less
   *  `CurrentNode`), not the IDENTITY SCHEMA — those are orthogonal, and they must be varied one at a time.
   *  A hand-written sidecar with no stamp is refused by the write doors before any carrier logic runs, which
   *  would make every assertion below pass for the wrong reason. No expectation changed. */
  function writeLegacySidecar(
    w: Workspace,
    fact: ReturnType<typeof advisoryFact>,
    row: Record<string, unknown> = {},
  ): string {
    const addr = w.store.put(fact as unknown as CasObject)
    const key = keyOf(fact)
    writeFileSync(
      sidecarOf(w),
      JSON.stringify({
        current: [
          [
            key,
            {
              nodeKey: key,
              family: "advisory",
              contentHash: addr,
              claims: [(fact as { claimNorm: string }).claimNorm],
              ...row,
            },
          ],
        ],
        cas: [addr],
        identity: IDENTITY_SCHEMA, // #112 — the row shape is the variable here, not the identity schema
      }),
      "utf8",
    )
    return key
  }

  it("CARRIER-2 — a CARRIER-LESS row LOADS, is WRITABLE by its legitimate owner, and is UPGRADED by that write", () => {
    // THE AVAILABILITY PROPERTY, and the one the strict first version broke. A row written before the carrier
    // existed must not be bricked: the lead reversed the strict rule precisely because "unwritable forever,
    // with no migration door" is the outcome this codebase has twice ruled unacceptable. Authority for such a
    // row comes from the CAS bytes — the MORE authenticated source, and where authority lived before today.
    ws = freshWorkspace()
    const legacy = advisoryFact({ anchor: ANCHOR, claimNorm: "a pre-carrier claim", scope: "core" })
    const key = writeLegacySidecar(ws, legacy)

    // 1. IT LOADS — the whole file, row present, both carrier fields absent. A new optional field must never
    //    make an old sidecar unparseable (that would route every pre-existing store into `emptyStore()`).
    const loaded = rehydrateProjection(ws.store)
    expect(loaded.current.has(key)).toBe(true)
    expect(loaded.current.get(key)!.scope).toBeUndefined()
    expect(loaded.current.get(key)!.tier).toBeUndefined()

    // 2. ITS LEGITIMATE OWNER CAN WRITE IT. alice is in `core`, which is the scope the stored BYTES declare.
    const policy = policyOf({ core: ["alice"], public: ["mallory"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "billy" })
    const write = advisoryFact({ anchor: ANCHOR, claimNorm: "an addendum", scope: "core", gen: 2 })
    expect(keyOf(write)).toBe(key) // PREMISE — it lands on the legacy node
    expect(alice.emit(write, AT).emitted).toBe(true)

    // 3. UPGRADE ON WRITE — the legacy path DRAINS instead of living forever. One successful governed write
    //    and the row carries its governance; no new door, no task-#88 dependency.
    const row = rehydrateProjection(ws.store).current.get(key)!
    expect(row.scope).toBe("core")
    expect(row.tier).toBe("T2")
    expect(row.claims).toEqual(["a pre-carrier claim", "an addendum"]) // the UPDATE really happened
    const wire = JSON.parse(readFileSync(sidecarOf(ws), "utf8")) as { current: [string, Record<string, unknown>][] }
    expect(wire.current[0]![1].scope).toBe("core") // durable, not just in-process

    // 4. AND THE FALLBACK IS NO LONGER REACHABLE FOR IT — the node is now judged on its row. Proof: pruning
    //    the bytes now yields the CARRIED-row answer (`unverifiable`, authority established from the row),
    //    which is precisely the answer a carrier-less row could never produce.
    const addr = row.contentHash
    rmSync(join(ws.casPath, addr.slice(0, 2), addr))
    const afterPrune = alice.emit(advisoryFact({ anchor: ANCHOR, claimNorm: "third", scope: "core", gen: 3 }), AT)
    expect(afterPrune.emitted).toBe(false)
    expect(reasonOf(afterPrune.rejected)).toBe("unverifiable target")
  })

  it("CARRIER-6 — the fallback CANNOT GRANT where the bytes do not, and never throws", () => {
    // The fallback reads authority off the CAS bytes; it must not become a grant. mallory holds `public`;
    // the bytes say `core`. Refused — and refused identically when the bytes are gone, so the legacy path
    // discloses no storage health either.
    ws = freshWorkspace()
    const legacy = advisoryFact({ anchor: ANCHOR, claimNorm: "a pre-carrier claim", scope: "core" })
    const key = writeLegacySidecar(ws, legacy)
    const policy = policyOf({ core: ["alice"], public: ["mallory"] })
    const mallory = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "mallory", ratifyToken: "billy" })
    const probe = advisoryFact({ anchor: ANCHOR, claimNorm: "probe", scope: "public", gen: 9 })
    expect(keyOf(probe)).toBe(key)

    expect(() => mallory.emit(probe, AT)).not.toThrow()
    const healthy = Buffer.from(mallory.emit(probe, AT).rejected ?? "", "utf8")
    expect(mallory.emit(probe, AT).emitted).toBe(false)
    expect(reasonOf(healthy.toString())).toBe("unauthorized for target")

    // Bytes gone ⇒ authority cannot be established at all ⇒ the SAME string. Asserted as BYTES, with the
    // non-empty guard, because two empty buffers also compare equal (the vacuity trap).
    const addr = rehydrateProjection(ws.store).current.get(key)!.contentHash
    rmSync(join(ws.casPath, addr.slice(0, 2), addr))
    expect(() => mallory.emit(probe, AT)).not.toThrow()
    const pruned = Buffer.from(mallory.emit(probe, AT).rejected ?? "", "utf8")
    expect(healthy.length).toBeGreaterThan(0)
    expect(Buffer.compare(healthy, pruned)).toBe(0)
  })

  it("CARRIER-7 — a row that HAS a scope never takes the fallback: mismatched ⇒ unverifiable, malformed ⇒ unauthorized", () => {
    // THE NARROWNESS IS THE POINT. Only a row with NO `scope` property falls back. If "malformed" or
    // "disagrees with the bytes" collapsed into "absent", the carrier would be bypassable by WRITING JUNK
    // rather than by deleting — strictly easier, and it would let a forged row borrow the bytes' authority.
    ws = freshWorkspace()
    const bytes = advisoryFact({ anchor: ANCHOR, claimNorm: "the real claim", scope: "other" })
    // (a) WELL-FORMED but MISMATCHED: the row says `core`, the authenticated bytes say `other`.
    const key = writeLegacySidecar(ws, bytes, { scope: "core", tier: "T2" })
    const policy = policyOf({ core: ["alice"], other: ["carol"] })
    const write = advisoryFact({ anchor: ANCHOR, claimNorm: "addendum", scope: "core", gen: 2 })
    expect(keyOf(write)).toBe(key)

    // alice is in the ROW's scope ⇒ authority established from the row ⇒ corroboration then refuses.
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "billy" })
    const aliceOut = alice.emit(write, AT)
    expect(aliceOut.emitted).toBe(false)
    expect(reasonOf(aliceOut.rejected)).toBe("unverifiable target")

    // carol is in the BYTES' scope only. If the mismatch fell back to the bytes she would be authorized —
    // she must not be. This is the assertion that pins "mismatched is not absent".
    const carol = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "carol", ratifyToken: "billy" })
    const carolOut = carol.emit(advisoryFact({ anchor: ANCHOR, claimNorm: "addendum", scope: "other", gen: 3 }), AT)
    expect(carolOut.emitted).toBe(false)
    expect(reasonOf(carolOut.rejected)).toBe("unauthorized for target")

    // (b) MALFORMED: a JSON-reachable non-string scope on the row. `isScope` refuses it; it must NOT be
    //     re-routed to the bytes, and `actorInScope` must never see it (a property key COERCES: `["core"]`
    //     reads as `core` in a lookup while staying `!==`-unequal to every string).
    ws.dispose()
    ws = freshWorkspace()
    const bytes2 = advisoryFact({ anchor: ANCHOR, claimNorm: "the real claim", scope: "core" })
    const key2 = writeLegacySidecar(ws, bytes2, { scope: ["core"], tier: "T2" })
    const alice2 = createGovernedEmit({
      store: ws.store,
      gate: HOLDS,
      policy: policyOf({ core: ["alice"] }),
      actor: "alice",
      ratifyToken: "billy",
    })
    const out2 = alice2.emit(advisoryFact({ anchor: ANCHOR, claimNorm: "addendum", scope: "core", gen: 2 }), AT)
    expect(keyOf(advisoryFact({ anchor: ANCHOR, claimNorm: "addendum", scope: "core", gen: 2 }))).toBe(key2)
    expect(out2.emitted).toBe(false)
    expect(reasonOf(out2.rejected)).toBe("unauthorized for target")
  })

  it("CARRIER-8 — `atlas-link` takes the SAME narrow fallback, so a legacy node is not unlinkable", () => {
    // The brick the lead reversed had a twin one door over: `rowAuthorized` required a scope ON THE ROW, so a
    // carrier-less node could never be linked either. Same fallback, same narrowness — and the stranger still
    // learns nothing, in either byte-state.
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"], public: ["mallory"] })
    const one = advisoryFact({ anchor: "src/a.ts::one", claimNorm: "first", scope: "core" })
    const two = advisoryFact({ anchor: "src/b.ts::two", claimNorm: "second", scope: "core" })
    const [h1, h2] = [ws.store.put(one as unknown as CasObject), ws.store.put(two as unknown as CasObject)]
    const [k1, k2] = [keyOf(one), keyOf(two)]
    writeFileSync(
      sidecarOf(ws),
      JSON.stringify({
        current: [
          [k1, { nodeKey: k1, family: "advisory", contentHash: h1, claims: ["first"] }], // carrier-less
          [k2, { nodeKey: k2, family: "advisory", contentHash: h2, claims: ["second"] }], // carrier-less
        ],
        cas: [h1, h2],
        identity: IDENTITY_SCHEMA, // #112 — see `writeLegacySidecar`: carrier shape, not identity schema
      }),
      "utf8",
    )

    // 1. THE OWNER CAN LINK THEM — authority falls back to the authenticated bytes (`core`).
    const alice = createGovernedLink({ store: ws.store, policy, actor: "alice", ratifyToken: "billy" })
    expect(alice.link(k1, k2).linked).toBe(true)

    // 2. A STRANGER STILL CANNOT, and learns nothing about storage in the process.
    const mallory = createGovernedLink({ store: ws.store, policy, actor: "mallory", ratifyToken: "billy" })
    const healthy = Buffer.from(mallory.link(k1, k2).rejected ?? "", "utf8")
    expect(reasonOf(healthy.toString())).toBe("unauthorized")
    rmSync(join(ws.casPath, h1.slice(0, 2), h1))
    const pruned = Buffer.from(mallory.link(k1, k2).rejected ?? "", "utf8")
    expect(healthy.length).toBeGreaterThan(0)
    expect(Buffer.compare(healthy, pruned)).toBe(0)
  })

  it("CARRIER-3 — nodeKey does NOT fold scope or tier: LITERAL digests, pinned", () => {
    // The suite recomputes every hash on both sides of every assertion, so it cannot see a formula change.
    // These are LITERALS, executed against the pre-change source and transcribed. If the carrier ever leaks
    // into the identity preimage these go red — which is the only way this repo can notice.
    const base = advisoryFact({ anchor: ANCHOR, claimNorm: "identity probe", scope: "core", tier: "T2" })
    expect(keyOf(base)).toBe("e2ae963da90f3e44ad0f0fb4d9a0f29ccfe0eac4e28f282b4a4cf7fc64c787e6")

    // Same anchor + slot, DIFFERENT governance on both axes ⇒ the SAME node. This is the property ADR-0007
    // is built on (authority is derived from the resource precisely BECAUSE the identity cannot carry it),
    // and it is what makes the row carrier necessary rather than optional.
    const moved = advisoryFact({ anchor: ANCHOR, claimNorm: "identity probe", scope: "other", tier: "T0" })
    expect(keyOf(moved)).toBe(keyOf(base))

    // The CONTENT address DOES move with governance — the bytes ARE the fact, `scope`/`tier` are fields of
    // it, and that has always been true. Pinned so the two are never confused for one another.
    expect(id(base as unknown as CasObject) as unknown as string).toBe(
      "ef20e5d059505046f23066ba827fe1af935aa0ffddbea3d68cea104bc7c16b77",
    )
    expect(id(moved as unknown as CasObject)).not.toBe(id(base as unknown as CasObject))
  })

  it("CARRIER-4 — the stranger's refusal is BYTE-identical across both storage states (asserted as bytes)", () => {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"], public: ["mallory"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "billy" })
    const mallory = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "mallory", ratifyToken: "billy" })

    const owned = advisoryFact({ anchor: ANCHOR, claimNorm: "a core claim", scope: "core" })
    expect(alice.emit(owned, AT).emitted).toBe(true)
    const addr = rehydrateProjection(ws.store).current.get(keyOf(owned))!.contentHash

    const probe = advisoryFact({ anchor: ANCHOR, claimNorm: "probe", scope: "public", gen: 9 })
    const healthy = Buffer.from(mallory.emit(probe, AT).rejected ?? "", "utf8")
    rmSync(join(ws.casPath, addr.slice(0, 2), addr))
    const pruned = Buffer.from(mallory.emit(probe, AT).rejected ?? "", "utf8")

    expect(healthy.length).toBeGreaterThan(0) // anti-vacuity: two empty buffers also compare equal
    expect(Buffer.compare(healthy, pruned)).toBe(0) // not one bit differs
  })

  it("CARRIER-5 — `atlas-link` closes the SAME oracle on its ENDPOINTS, and keeps SCN-GL-7 for the owner", () => {
    // SCN-GL-14 pinned this precedence for the CLASS walk and could not pin it for the ENDPOINTS, because
    // the endpoint authz gate physically could not run before the read-back it depended on. So the leak
    // survived at the endpoints: name two nodes you have no authority over and the reason told you whether
    // their bytes were intact. Both nodes here are minted through the REAL emit door, so their rows carry
    // the governance the link door now reads.
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"], public: ["mallory"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "billy" })
    const one = advisoryFact({ anchor: "src/a.ts::one", claimNorm: "first", scope: "core" })
    const two = advisoryFact({ anchor: "src/b.ts::two", claimNorm: "second", scope: "core" })
    expect(alice.emit(one, AT).emitted).toBe(true)
    expect(alice.emit(two, AT).emitted).toBe(true)
    const [kOne, kTwo] = [keyOf(one), keyOf(two)]
    const addr = rehydrateProjection(ws.store).current.get(kOne)!.contentHash

    const mallory = createGovernedLink({ store: ws.store, policy, actor: "mallory", ratifyToken: "billy" })
    const healthy = Buffer.from(mallory.link(kOne, kTwo).rejected ?? "", "utf8")
    rmSync(join(ws.casPath, addr.slice(0, 2), addr))
    const pruned = Buffer.from(mallory.link(kOne, kTwo).rejected ?? "", "utf8")
    expect(healthy.length).toBeGreaterThan(0)
    expect(Buffer.compare(healthy, pruned)).toBe(0) // no bit of storage health reaches a stranger

    // ANTI-VACUITY, the SCN-GL-7 distinction: the endpoints' OWN author still gets the honest, actionable
    // reason for the very same pruned store — and it is NOT the string the stranger was handed.
    const owner = createGovernedLink({ store: ws.store, policy, actor: "alice", ratifyToken: "billy" }).link(kOne, kTwo)
    expect(owner.linked).toBe(false)
    expect(reasonOf(owner.rejected)).toBe("unverifiable endpoint")
    expect(Buffer.compare(Buffer.from(owner.rejected ?? "", "utf8"), healthy)).not.toBe(0)
  })
})
