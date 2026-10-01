// @atlas/adapter-io — test/governed-emit.test.ts  (COMPOSE-A — the governed durable emit leg)
//
// The governed write door persists DURABLY only through three fail-closed gates, in order: the GROUND
// truth-gate, the KNOW-11 owner-scoped authz gate, then the KNOW-15 upsert + durable persist (projection
// sidecar + the whole fact into CAS). These cases pin each gate with a FAKE DiskStore + FAKE gate + a
// literal policy, and the teeth are wired so removing any one governed step flips a golden RED:
//   - drop the authz check      → the unauthorized golden RED (a denied write would persist).
//   - drop `store.put(node)`    → the read-back golden RED (the CAS bytes ARE the fact — invariant 6).
//   - drop `persistProjection`  → the durability golden RED (no projection persisted).

import { describe, it, expect } from "vitest"
import { reasonOf } from "./door-regression-support.js"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Candidate, GroundedFact, StoreProjection } from "@atlas/knowledge"
import { emptyStore, normalizeCheck, route } from "@atlas/knowledge"
import { createGovernedEmit } from "../src/governed-emit.js"
import type { DiskStore } from "../src/store.js"
import {
  makeStoreSpy,
  HOLDS_GATE,
  NA_GATE,
  POLICY,
  advisory,
  mkAdvisory,
  predicate,
  realKey,
  AT,
} from "./harness/governed-fixtures.js"

// ── cases ──────────────────────────────────────────────────────────────────────────────────────────

describe("COMPOSE-A — createGovernedEmit (truth-door · authz · upsert · durable persist)", () => {
  it("SCN-GE-1 — gate NOT HOLDS ⇒ emitted:false, NOTHING persisted (truth door)", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: NA_GATE, policy: POLICY, actor: "alice" })
    const out = emit(advisory("core"), AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toContain("ungrounded")
    // teeth: the truth door short-circuits BEFORE any write — nothing put, nothing persisted.
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(0)
  })

  it("SCN-GE-2 — gate HOLDS but actor NOT in fact scope ⇒ unauthorized, NOTHING persisted (authz)", () => {
    const spy = makeStoreSpy()
    // alice is granted `core`, but the fact is scoped to `secret` — the authz gate must deny.
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const out = emit(advisory("secret"), AT)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unauthorized") // EQUALITY: the WRITE's own scope, never the incumbent's
    // TEETH — drop the authz check and this write would persist: assert NOTHING did.
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(0)
  })

  it("SCN-GE-3 — HOLDS + authorized ⇒ emitted:true, projection persisted + node in CAS + re-readable (invariant 6)", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const node = advisory("core")
    const out = emit(node, AT)

    expect(out.emitted).toBe(true)
    expect(out.id).toBeDefined()
    const contentHash = out.id!
    // it is the content id of the persisted fact (the sealed kernel seam).
    expect(contentHash).toBe(id(node as CasObject))

    // TEETH — durability golden: drop `persistProjection` and this flips (no projection persisted).
    expect(spy.persists()).toHaveLength(1)
    // TEETH — read-back golden (invariant 6): drop `store.put(node)` and this flips (get ⇒ undefined).
    expect(spy.puts()).toHaveLength(1)
    expect(spy.store.get(contentHash)).toEqual(node)
  })

  it("SCN-GE-3-seal — the OPERATOR emit door STRIPS a payload-supplied `seal` from the CAS bytes (billy T0, forgery closed)", () => {
    // A `seal` (`proven`) is a TRUST SIGNAL write-gated to the sound admit path (mine-decide, from buildSound's
    // oracle verdict). This is the operator door (`atlas emit <json>`) whose payload is UNTRUSTED — a hand-
    // written `seal:'proven'` must NOT survive onto the stored node. The seal is destructured off at the `node`
    // snapshot (gate 0), so it reaches neither the CAS bytes nor the WriteRequest/row.
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const forged = { ...advisory("core"), seal: "proven" as const }
    const out = emit(forged, AT)

    expect(out.emitted).toBe(true)
    const contentHash = out.id!
    const readBack = spy.store.get(contentHash) as { seal?: unknown } | undefined
    // TEETH: without the strip, the operator's forged `seal:'proven'` would round-trip through CAS here.
    expect(readBack?.seal).toBeUndefined()
    // and the stripped bytes are the seal-less node (content id differs from the forged object's id).
    expect(contentHash).not.toBe(id(forged as CasObject))
  })

  it("SCN-GE-3-seal-absent — a seal-less (legacy) fact still emits + reads back clean (back-compat)", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const node = advisory("core") // no `seal` — every stored fact today
    const out = emit(node, AT)

    expect(out.emitted).toBe(true)
    const readBack = spy.store.get(out.id!) as (typeof node & { seal?: unknown }) | undefined
    expect(readBack?.seal).toBeUndefined() // absent-tolerant: no crash, nothing fabricated
  })

  it("AC-2 (INVERTED, billy T0) — the OPERATOR emit door does NOT stamp a payload-supplied `seal` onto the PROJECTION ROW", () => {
    // A seal is a forgeable trust signal if an untrusted `atlas emit <json>` payload can stamp it. The
    // operator door strips it, so a forged `seal:'proven'` reaches neither the WriteRequest nor the durable
    // row. `slot` (a routing/identity leg, not a trust signal) still rides — it is not stripped.
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const forged = { ...advisory("core"), predicateSlot: "invariant" as const, seal: "proven" as const }
    const out = emit(forged, AT)
    expect(out.emitted).toBe(true)

    const projection = spy.persists()[spy.persists().length - 1]!
    expect(projection.current.size).toBe(1) // the sole node — read it directly (the door mints its own key from predicateSlot)
    const row = [...projection.current.values()][0]!
    // TEETH: without the operator-door strip, the forged `seal:'proven'` would land on the durable row here.
    expect(row.seal).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(row, "seal")).toBe(false)
    expect(row.slot).toBe("invariant") // control: `slot` is not a trust signal — it still rides, as before
  })

  it("AC-1 (SEAL-PROMOTE-CARRY) — a PROMOTE (origin:promoted) of a seal-bearing fact keeps `seal:proven` on the durable ROW + CAS bytes", () => {
    // `origin:'promoted'` is the DOOR-DERIVED trust key (never from the payload): a mined fact re-emitted from
    // content-addressed staging written by the sound admit path. Its `seal` is trusted, so it must survive the
    // staging→current promote (before this WP the #187 strip fired unconditionally ⇒ the durable row lost it).
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
      origin: "promoted",
    })
    const staged = { ...advisory("core"), seal: "proven" as const }
    const out = emit(staged, AT)
    expect(out.emitted).toBe(true)
    // the durable projection ROW carries the trusted seal.
    const projection = spy.persists()[spy.persists().length - 1]!
    const row = [...projection.current.values()][0]!
    expect(row.seal).toBe("proven") // ⚑ RED before SEAL-PROMOTE-CARRY: the promote stripped it here.
    // and the CAS bytes ARE the fact (read-back invariant), so they carry it too.
    const readBack = spy.store.get(out.id!) as { seal?: unknown } | undefined
    expect(readBack?.seal).toBe("proven")
  })

  it("AC-4 (SEAL-PROMOTE-CARRY, SECURITY) — an AUTHORED UPDATE over a promoted `proven` node DROPS the seal; a promote UPDATE re-stamps it", () => {
    // The security surface: a `proven` seal is trust in the WRITE that carried it, not in the (anchor, slot)
    // place. An authored operator UPDATE has its own forged seal stripped at the door AND must not INHERIT the
    // incumbent's proven seal through the reducer's `...prior` — otherwise an operator could re-mint a node's
    // body while silently keeping a proven seal it never earned.
    const spy = makeStoreSpy()
    const promoted = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
      origin: "promoted",
    }).emit
    const authored = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" }).emit

    // 1. a promote lands a proven node in current.
    expect(promoted({ ...advisory("core"), seal: "proven" as const }, AT).emitted).toBe(true)
    let row = [...spy.persists()[spy.persists().length - 1]!.current.values()][0]!
    expect(row.seal).toBe("proven")

    // 2. an AUTHORED operator UPDATE at the same (anchor, slot), even carrying a forged seal, DROPS it. Same
    //    anchor `src/util.ts::greet` ⇒ same nodeKey ⇒ UPDATE; a different claim body ⇒ new bytes (not DEDUP).
    const out = authored(
      {
        ...mkAdvisory({
          id: "nk-governed-1",
          anchor: "src/util.ts::greet",
          claimNorm: "a different governed claim body",
          scope: "core",
        }),
        seal: "proven" as const,
      },
      AT,
    )
    expect(out.emitted).toBe(true)
    row = [...spy.persists()[spy.persists().length - 1]!.current.values()][0]!
    expect(row.seal).toBeUndefined() // did NOT inherit the prior proven seal (no forgery by omission).
    expect(Object.prototype.hasOwnProperty.call(row, "seal")).toBe(false)

    // 3. a PROMOTE UPDATE carrying its OWN trusted seal RE-STAMPS proven.
    expect(
      promoted(
        {
          ...mkAdvisory({
            id: "nk-governed-1",
            anchor: "src/util.ts::greet",
            claimNorm: "yet another governed body",
            scope: "core",
          }),
          seal: "proven" as const,
        },
        AT,
      ).emitted,
    ).toBe(true)
    row = [...spy.persists()[spy.persists().length - 1]!.current.values()][0]!
    expect(row.seal).toBe("proven")
  })

  it("A1 (196b, SEAL += justified) — a PROMOTE of a `seal:justified` fact carrying a `derivation` round-trips both onto the durable ROW + CAS bytes", () => {
    // 196b CORRECTION 5: `justified` is a first-class seal value (not the absence of one), and its own grounds
    // travel as `derivation` (the contestable chain that leads a reader to the same conclusion — the exact
    // parallel of the `proven` seal's `witness`). A promoted (trusted admit-path) justified fact must keep both.
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
      origin: "promoted",
    })
    const derivation = "isScope rejects {} by a typeof-first check, so a non-string never reaches the branch"
    const staged = { ...advisory("core"), seal: "justified" as const, derivation }
    const out = emit(staged, AT)
    expect(out.emitted).toBe(true)

    // the durable projection ROW carries the trusted `justified` seal (the seal carrier is seal-value-agnostic).
    const row = [...spy.persists()[spy.persists().length - 1]!.current.values()][0]!
    expect(row.seal).toBe("justified") // ⚑ RED before Seal += 'justified' (type would not admit the value)
    // the CAS bytes ARE the fact, so they carry BOTH the seal and its derivation (surfaced by `atlas node`).
    const readBack = spy.store.get(out.id!) as { seal?: unknown; derivation?: unknown } | undefined
    expect(readBack?.seal).toBe("justified")
    expect(readBack?.derivation).toBe(derivation)
  })

  it("A1-forgery (196b) — an AUTHORED emit CANNOT forge `seal:justified` onto the row (the seal strip is value-agnostic)", () => {
    // The forgery surface is identical for `justified` as for `proven`: an untrusted `atlas emit <json>` payload
    // must not stamp ANY seal onto the durable row. The existing gate-0 strip is seal-value-agnostic, so adding
    // `justified` to the vocabulary opens no new forgery. (The `derivation` prose is harmless content, not a
    // trust/authz leg, so it rides with the CAS bytes like `claimNorm` — the seal is what's guarded.)
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const forged = { ...advisory("core"), seal: "justified" as const, derivation: "forged grounds" }
    const out = emit(forged, AT)
    expect(out.emitted).toBe(true)
    const row = [...spy.persists()[spy.persists().length - 1]!.current.values()][0]!
    expect(row.seal).toBeUndefined() // stripped: an authored payload cannot mint a justified seal on the row
    expect(Object.prototype.hasOwnProperty.call(row, "seal")).toBe(false)
  })

  it("SCN-GE-4 — empty ATLAS_ACTOR ⇒ denied fail-closed (no actor is in any scope)", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "" })
    const out = emit(advisory("core"), AT)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unauthorized") // EQUALITY: the WRITE's own scope, never the incumbent's
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(0)
  })

  it("SCN-GE-5 — put-before-persist crash-safety: a failing `put` NEVER persists the projection (no dangling ref)", () => {
    const persists: StoreProjection[] = []
    const throwingStore: DiskStore = {
      put() {
        throw new Error("EIO: disk full") // CAS write fails mid-emit (authorized + grounded fact)
      },
      get() {
        return undefined
      },
      persistProjection(p) {
        persists.push(p)
      },
      loadProjection() {
        return persists.length > 0 ? persists[persists.length - 1] : undefined
      },
      // The ATOMIC commit door — the seam `createGovernedEmit` actually writes through. It was MISSING from
      // this literal, and because `tsc -b` covered only `src`, the `: DiskStore` annotation above never
      // checked it. The consequence was not cosmetic: `emit` died with
      //   TypeError: deps.store.commitProjection is not a function
      // BEFORE reaching `put`, so the `EIO: disk full` this fixture exists to raise was never thrown, and
      // neither `put` nor `persistProjection` was ever called. `expect(...).toThrow()` accepts ANY throw, so
      // the test passed on the TypeError and `expect(persists).toHaveLength(0)` held vacuously. The stated
      // teeth ("reverse the order — persistProjection before put — and this flips RED") were therefore
      // FALSE: the named mutant lives inside a callback this test never entered.
      // Ordering below is copied from harness/governed-fixtures.ts: put-before-publish, and a decision with
      // no `next` writes nothing.
      commitProjection(decide) {
        const decision = decide(persists.length > 0 ? persists[persists.length - 1]! : emptyStore())
        if (decision.next === undefined) return { settled: true, out: decision.out }
        for (const obj of decision.put ?? []) this.put(obj as CasObject)
        persists.push(decision.next)
        return { settled: true, out: decision.out }
      },
      commitStaging(decide) {
        const decision = decide(emptyStore())
        return { settled: true, out: decision.out }
      },
    }
    const { emit } = createGovernedEmit({ store: throwingStore, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    // `put` runs BEFORE `persistProjection`, so a CAS-write failure throws before the sidecar is written.
    expect(() => emit(advisory("core"), AT)).toThrow()
    // TEETH — reverse the order (persistProjection before put) and this flips RED: the sidecar would be
    // persisted referencing a contentHash whose bytes never landed in CAS (a dangling reference).
    expect(persists).toHaveLength(0)
  })

  // ── INTEGRITY: the write door MINTS routing identity, it NEVER trusts the author payload `node.id` ──────
  // The dedup/routing `nodeKey` is recomputed from CONTENT (frozen `nodeKey(node)` = anchor+slot[+check]).
  // Both teeth kill the SAME mutant — `nodeKey: node.id` (trusting the author-supplied payload id for
  // routing): with that mutant, two payloads with different `id`s can never collide (SCN-GE-6 goes RED), and
  // a spoofed `id` hijacks an unrelated node (SCN-GE-7 goes RED).

  it("SCN-GE-6 — DIFFERENT payload `id`, SAME real identity ⇒ ONE node, claims set-union (minted, not trusted)", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    // Same anchor (⇒ same real advisory nodeKey), DIFFERENT author-declared payload `id`, different claim body.
    const f1 = mkAdvisory({
      id: "author-picked-AAAA",
      anchor: "src/util.ts::greet",
      claimNorm: "claim one",
      scope: "core",
    })
    const f2 = mkAdvisory({
      id: "author-picked-BBBB",
      anchor: "src/util.ts::greet",
      claimNorm: "claim two",
      scope: "core",
    })
    // PREMISE: distinct payload ids, but the REAL minted identity collides.
    expect(f1.id).not.toBe(f2.id)
    expect(realKey(f1)).toBe(realKey(f2))

    expect(emit(f1, AT).emitted).toBe(true)
    expect(emit(f2, AT).emitted).toBe(true)

    const projection = spy.persists()[spy.persists().length - 1]! // the final durable projection
    // TEETH (kills `nodeKey: node.id`): identity is minted ⇒ f2 UPDATES f1's ONE node, not a second node.
    expect(projection.current.size).toBe(1)
    const node = projection.current.get(realKey(f1))!
    expect(node.claims).toContain("claim one")
    expect(node.claims).toContain("claim two") // set-union in place ⇒ a real collision, not a DEDUP no-op
  })

  it("SCN-GE-7 — payload `id` spoofing an unrelated node does NOT hijack it (identity minted from content)", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    // 1) An honest node X lands at its real identity.
    const nodeX = mkAdvisory({
      id: "x-declared",
      anchor: "src/util.ts::greet",
      claimNorm: "honest X claim",
      scope: "core",
    })
    expect(emit(nodeX, AT).emitted).toBe(true)
    const keyX = realKey(nodeX)

    // 2) An attacker fact at a DIFFERENT anchor sets its payload `id` = X's real nodeKey to try to hijack X.
    const attacker = mkAdvisory({ id: keyX, anchor: "src/evil.ts::pwn", claimNorm: "HIJACKED", scope: "core" })
    expect(attacker.id as unknown as string).toBe(keyX) // the spoof is armed
    expect(realKey(attacker)).not.toBe(keyX) // but its MINTED identity is its own, not X's
    expect(emit(attacker, AT).emitted).toBe(true)

    const projection = spy.persists()[spy.persists().length - 1]!
    // TEETH (kills `nodeKey: node.id`): routing on the minted key ⇒ the attacker gets its OWN node; X untouched.
    expect(projection.current.size).toBe(2)
    expect(projection.current.get(keyX)!.claims).toEqual(["honest X claim"]) // X NOT hijacked
    expect(projection.current.get(keyX)!.claims).not.toContain("HIJACKED")
  })

  // ── RATIFY GATE (KNOW-8 / KNOW-18): the tier-ratification machinery composed BETWEEN authz and upsert ─────
  // MUTANT (N7 — the finding): the door was truth-gate → authz → upsert ONLY; the `route`/`ratify` block was
  // NEVER composed, so a T0 fact bypassed the human+billy gate at the write door. DELETE the `route(...)===
  // 'full-ratify' ⇒ ratify(...)` block (restore the pre-N7 door) and SCN-GE-R2/R4/R5 all go RED: a T0 (or a
  // non-billy-ratified) fact would PERSIST. SCN-GE-R1/R3 pin that the fix does NOT over-block the common path.

  it("SCN-GE-R1 — a grounded T2 ADVISORY fast-paths (auto-accept): emits with NO ratify token (common path unbroken)", () => {
    const spy = makeStoreSpy()
    // No `ratifyToken` supplied at all — the fast-path (grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested)
    // never consults it. This is the existing common case; wiring ratify MUST NOT break it.
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const out = emit(advisory("core"), AT) // tier defaults T2
    expect(out.emitted).toBe(true)
    expect(spy.puts()).toHaveLength(1)
    expect(spy.persists()).toHaveLength(1)
  })

  it("SCN-GE-R2 — a T0 fact with NO ratify token ⇒ REJECTED fail-closed, NOTHING persisted (KNOW-8)", () => {
    const spy = makeStoreSpy()
    // Grounded + authorized, but T0 ⇒ route=full-ratify; absent token ⇒ ratify refuses. Kills the missing-
    // ratify-composition mutant: pre-N7 this T0 fact would have persisted through the authz→upsert door.
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const out = emit(advisory("core", "T0"), AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toContain("unratified")
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(0)
  })

  it("SCN-GE-R3 — a T0 fact WITH the billy token ⇒ emits (the human/security gate signs)", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
    })
    const node = advisory("core", "T0")
    const out = emit(node, AT)
    expect(out.emitted).toBe(true)
    expect(spy.persists()).toHaveLength(1)
    expect(spy.puts()).toHaveLength(1)
    expect(spy.store.get(out.id!)).toEqual(node) // read-back invariant holds through the ratified path
  })

  it("SCN-GE-R4 — a T0 fact with a NON-billy token ⇒ REJECTED (T0 requires billy, KNOW-8), NOTHING persisted", () => {
    const spy = makeStoreSpy()
    // A generic ratifier ('lead') commits a NON-T0 full-ratify fact, but a T0 fact needs billy specifically.
    const { emit } = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "lead",
    })
    const out = emit(advisory("core", "T0"), AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toContain("unratified")
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(0)
  })

  it("SCN-GE-R5 — a PREDICATE fact routes to full-ratify: rejected with NO token, emits WITH any ratifier", () => {
    // route sends ANY predicate (even T2) to full-ratify. No token ⇒ rejected; a generic 'lead' token (not
    // T0) ⇒ commits. Extra teeth on the same missing-composition mutant across the predicate family.
    const denySpy = makeStoreSpy()
    const denied = createGovernedEmit({ store: denySpy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const noTok = denied.emit(predicate("core"), AT)
    expect(noTok.emitted).toBe(false)
    expect(noTok.rejected ?? "").toContain("unratified")
    expect(denySpy.persists()).toHaveLength(0)

    const okSpy = makeStoreSpy()
    const allowed = createGovernedEmit({
      store: okSpy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "lead",
    })
    expect(allowed.emit(predicate("core"), AT).emitted).toBe(true)
    expect(okSpy.persists()).toHaveLength(1)
  })

  it("SCN-KNOW-14b-1 — false-trusted claim persists as advisory, never predicate", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "lead",
    })
    const input = {
      ...predicate("core"),
      provenance: { source: "held-out-source", trusted: false, sha: "sha-held-out" },
    } as Extract<GroundedFact, { kind: "predicate" }>
    const out = emit(input, AT)
    expect(out.emitted).toBe(true)
    const row = [...spy.persists().at(-1)!.current.values()][0]!
    expect(row.family).toBe("advisory")
    expect(row.provenanceByClaim).toEqual({
      [normalizeCheck(input.check)]: input.provenance,
    })
    const stored = spy.store.get(out.id!)
    expect(stored).toMatchObject({ kind: "advisory", provenance: input.provenance })
    expect((stored as { kind: string }).kind).not.toBe("predicate")
  })

  it("SCN-KNOW-14c-1 — false-trusted claim contributes zero to fast gate / cannot auto-accept", () => {
    const input = { ...predicate("core"), provenance: { source: "source:untrusted", trusted: false } } as Extract<
      GroundedFact,
      { kind: "predicate" }
    >
    const candidate = { ...input, slot: undefined } as unknown as Candidate
    expect(route(candidate, { contested: false, lowRisk: true })).toBe("full-ratify")

    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const out = emit(input, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected ?? "").toContain("unratified")
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(0)
  })

  it("held-out-shaped variant — different source string and false-trusted predicate-shaped input remain advisory/blocked", () => {
    const input = {
      ...predicate("core"),
      provenance: { source: "different-source", trusted: false, sha: "different-sha" },
    } as Extract<GroundedFact, { kind: "predicate" }>
    const view = { ...input, slot: undefined } as unknown as Candidate
    expect(route(view, { contested: false, lowRisk: true })).toBe("full-ratify")

    const spy = makeStoreSpy()
    const promoted = createGovernedEmit({
      store: spy.store,
      gate: HOLDS_GATE,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "lead",
    })
    expect(promoted.emit(input, AT).emitted).toBe(true)
    expect([...spy.persists().at(-1)!.current.values()][0]!.family).toBe("advisory")
  })

  // ── WP-10.A4.ADAPTER (AUTHOR-14 — SCN-AUTH-14b-1 / 14c-1) ────────────────────────────────────────────
  // `EmitOut.nodeKey` was widened onto the type (WP-10.A4.TOOLS); this door now POPULATES it on success —
  // `targetKey`, the SAME minted routing key the incumbent guard + `WriteRequest.nodeKey` already carry, no
  // re-mint. These two cases prove BOTH consumers from ONE receipt, EACH RESOLVED THROUGH ITS REAL CONSUMER
  // rather than asserted by literal equality — the honest reading of "prove it, don't claim it".
  //
  // FRAMING NOTE (measured, not assumed): the wired per-node read door (`atlas node <addr>` /
  // `NodeSource.resolve` in `adapter-io/src/wire.ts:452-482`) resolves EXCLUSIVELY by CONTENT ADDRESS —
  // `readStore.get(addr as Hash)`, the SAME `store.get` this suite's `spy.store.get` fakes (keyed by
  // `id(obj)`, `governed-fixtures.ts`). `nodeKey` (`hash(primaryAnchorId ‖ slot[‖ check])`, `router.ts`) is a
  // DIFFERENT digest over a DIFFERENT (smaller) preimage than `id`/`contentHash` (the whole node bytes) — SCN
  // -GE-3's own sibling golden pins that rewording a claim moves the CONTENT hash but NOT the nodeKey, i.e.
  // the two are provably NOT interchangeable. So `out.id` is what actually resolves through the WIRED
  // `atlas node` door; `out.nodeKey` is what resolves through the LINK door (`governed-link.ts`'s
  // `proj.current.get(a/b)`) and the incumbent/authz gates in THIS file — the receipt's two consumers are
  // `atlas node` (via `id`) and `atlas-link` (via `nodeKey`), not the SAME field serving both. Mirrored here
  // rather than importing `wire.ts` (out of this WP's file scope) — the mirror is the identical one-liner.
  it("SCN-AUTH-14b-1 / 14c-1 — the receipt serves BOTH its real consumers from one emit", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" })
    const node = advisory("core")
    const out = emit(node, AT)
    expect(out.emitted).toBe(true)

    // ADDITIVE: nodeKey is now present on a success receipt, and equals the SAME minted identity the door
    // routes the write's OWN durable row under (never re-derived independently — one identity, one read).
    expect(out.nodeKey).toBeDefined()
    expect(out.id).toBeDefined()
    expect(String(out.nodeKey)).toBe(realKey(node))

    // ── ARM 1 — `atlas node <addr>` (mirrors wire.ts's `NodeSource.resolve`: CAS content-address lookup). ──
    const resolveNode = (addr: string): unknown =>
      /^[0-9a-f]{64}$/.test(addr) ? spy.store.get(addr as unknown as Parameters<typeof spy.store.get>[0]) : undefined
    expect(resolveNode(String(out.id))).toEqual(node) // out.id resolves through the per-node read door
    // TEETH — out.nodeKey does NOT resolve there (a different digest over a different preimage); proving the
    // negative is what keeps this golden from silently degrading into an equality-of-two-strings vacuity.
    expect(String(out.nodeKey)).not.toBe(String(out.id))

    // ── ARM 2 — `atlas-link` (mirrors governed-link.ts: `proj.current.get(nodeKey)`). ──────────────────────
    const projection = spy.persists().at(-1)!
    const row = projection.current.get(String(out.nodeKey))
    expect(row).toBeDefined() // out.nodeKey resolves through the link door's own row lookup
    expect(row!.contentHash).toBe(String(out.id)) // and that row names the SAME CAS object `id` addresses
    expect(spy.store.get(row!.contentHash as unknown as Parameters<typeof spy.store.get>[0])).toEqual(node)

    // ── the drift/doctor CAS read-back arm (byte-unchanged) — `id` alone, unchanged by the widening. ───────
    expect(spy.store.get(out.id!)).toEqual(node)
  })
})
