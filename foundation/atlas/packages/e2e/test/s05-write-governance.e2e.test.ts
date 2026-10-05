// @atlas/e2e — S5 · Write governance: authorization + the human-in-the-loop T0 bar
// AXIS: SECURITY (who may write, what auto-promotes, what fast-paths — every path fail-closed).
//
// STORY. Before a fact ever lands, Atlas must decide WHO may write it and WHETHER a human must sign.
// This story composes the REAL wired lifecycle of @atlas/knowledge (authz · tier · ratify · fastpath ·
// template · router/upsert · archive) over the SEALED @atlas/kernel CAS across the package seam, and
// proves the governance invariants cannot be tricked:
//   • an out-of-scope OR scope-less write is REFUSED (no ownership anchor ⇒ no write), reads are universal;
//   • the $0-LLM classifier NEVER auto-promotes a node to T0 — a keyword only FLAGS a candidate;
//   • a T0 node is NEVER auto-ratified — it takes the billy/human token, never an explorer, never empty;
//   • ONLY a grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested candidate fast-paths to auto-accept;
//   • an oversized / malformed / free-prose fact never passes template validation;
//   • every write routes to an upsert cell (DEDUP/CREATE/UPDATE/SUPERSEDE) — never a silent REJECT/loss —
//     and a predicate supersede is a dedup POINTER into CAS (0 byte-copy, 0 delete).
//
// UN-PARK BOUNDARY (owner-RATIFIED, WP-9.2.4.KNOWLEDGE — govern writes now). The composed-store FRONT
// DOOR `RouterApi.writeDecision(candidate, store)` — formerly PARKED — is now WIRED. It is COMPOSED,
// not invented: it mints the contentHash through the SEALED kernel `id` seam (atlas-knowledge:110), reuses
// WP-5.13-b's `nodeKey` VALUE + the pure `routeWrite` (write-time dedup is D0 contentHash / D1 nodeKey only;
// a `claimNorm` collision is reported, not merged), and takes the
// `StoreProjection` as DATA (the `upsert(store, req)` idiom / caller-side session-internal projection) — so
// NO OWNER-DEFINE composed store is fabricated. The runtime still ALSO routes via `routeWrite(RouteInputs)`
// + `upsert(store, req)` over already-resolved identity (the primitives the front door composes). This
// story exercises the routed-around path AND, with teeth, that `writeDecision` is exported and governs a
// candidate correctly — the un-park is real.
//
// INJECTED PORT (legitimate seam): the archive's SUPERSEDE defers its dedup/re-spawn to the CAS —
// `bindArchive(StoreApi)` is wired to the REAL sealed @atlas/kernel `createStore()` (the truest double),
// so the pointer-not-copy assertion has real teeth. All other oracles are the concrete exports, not fakes.

import { describe, it, expect } from "vitest"
import * as knowledge from "@atlas/knowledge"
import {
  isScope,
  classify,
  isT0Candidate,
  stage,
  ratify,
  route,
  isGrounded,
  isAdvisory,
  validateTemplate,
  routeWrite,
  upsert,
  emptyStore,
  currentNodes,
  bindArchive,
} from "@atlas/knowledge"
import type { Candidate, AdvisoryNode, PredicateNode, TerritoryView, Check } from "@atlas/knowledge"
import type { RouteInputs, WriteRequest, StoreProjection, NodeFamily } from "@atlas/knowledge"
import { asNodeKey, asSubtreeHash, createStore, id as kid } from "@atlas/kernel"
import type { Tier } from "@atlas/contracts"
import type { Grounding } from "@atlas/grounding"

// ── fixtures (mirrored from the proven WP-5.13/5.14/5.15 test shapes — not re-derived) ───────────────
const grounding = (n: string): Grounding => ({
  entries: [
    { anchor: { kind: "symbol", qualifiedPath: `fn ${n}`, subtreeHash: asSubtreeHash(`st-${n}`) }, path: "src/x.ts" },
  ],
})
const UNGROUNDED: Grounding = { entries: [] } // 0 entries — GROUND-2: never grounded

/** A persisted advisory fact, `scope` R3-optional (the KNOW-11 ownership fence; #187 owner-ratified
 *  2026-08-03 removed `owner` from this fence — see `req-knw.md#REQ-KNOW-11a`). */
const advisoryFact = (opts: { scope?: string } = {}): AdvisoryNode => ({
  kind: "advisory",
  id: asNodeKey("fact:payments.charge"),
  tier: "T2",
  claimNorm: "cn-charge",
  grounding: grounding("charge"),
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
  ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
})

const territory = (path: string): TerritoryView => ({
  path,
  owner: "seat/forge",
  tier: "T2",
  files: [`${path}mod.ts`],
  blastRadius: [],
})

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  claimText: "charge is idempotent per idempotency-key",
  claimNorm: "cn-idem",
  slot: "invariant",
  grounding: grounding("charge"),
  provenance: { source: "agent:explorer", trusted: true },
  tier: "T2",
  ...over,
})
const predicateCheck: Check = { kind: "assertion", expr: "balance >= 0" }

const predicateNode = (nk: string, q: string): PredicateNode => ({
  kind: "predicate",
  id: asNodeKey(nk),
  tier: "T2",
  check: { kind: "index-query", query: `q-${q}` },
  grounding: grounding(nk),
  status: "HOLDS",
  freshness: "FRESH",
  claims: [],
  authoring: "PREDICATED",
})

describe("S5 · write governance — authorization + the human-in-the-loop T0 bar (fail-closed)", () => {
  // ── 1. THE OWNERSHIP ANCHOR — the half of KNOW-11 this package owns (#186) ──────────────────────────
  //
  // This case used to assert the fence through `authz('write', actor, fact)` / `inScope(actor, scope)`.
  // Those had ZERO production callers — measured on the BUILT `dist` in a subprocess, where a successful
  // `atlas emit` reaches `actorInScope` (adapter-io/src/policy.ts) and `isScope` and reaches them never —
  // and they encoded a DIFFERENT rule (`actor === scope`) than the shipped door, which decides admin-declared
  // membership from `.atlas/policy.json`. #186 deleted them. The DECISION half of this story is asserted
  // where it runs, and neither place was touched: `packages/adapter-io/test/policy.test.ts`
  // (`describe('actorInScope — fail-closed authz…')`, six cases incl. absent-scope + prototype-name teeth)
  // and `packages/e2e-blackbox/test/s7-governance.blackbox.test.ts` (the same fence at the real binary:
  // ALLOW exit 0 / DENY exit 2 `reason: unauthorized` / absent-scope `reason: malformed scope`).
  it("refuses a scope-less or malformed ownership anchor, and does not pretend to answer authorization", () => {
    const factInScope = advisoryFact({ scope: "payments" })
    const scopeless = advisoryFact() // no scope ⇒ no ownership anchor

    expect(isScope(factInScope.scope)).toBe(true) // a real anchor the door can compare and look up
    // teeth (breaks-on "a scope-less or malformed anchor is treated as an anchor"):
    expect(isScope(scopeless.scope)).toBe(false) // absent ⇒ the door fails closed at gate 0
    expect(isScope("")).toBe(false) // empty ⇒ no anchor
    expect(isScope(["payments"])).toBe(false) // the property-key coercion hazard never passes the shape guard

    // and it is a SHAPE test only: it passes a scope no policy declares, because authorization is not its
    // question. That separation IS the #186 fix — one decision, in the door, over admin-declared policy.
    expect(isScope("a-scope-no-policy-has-ever-declared")).toBe(true)
  })

  // ── 2. NO AUTO-PROMOTE TIER — classify only FLAGS, never assigns ───────────────────────────────────
  it("classifies every territory as T2 and a T0-ish path only sets the t0Candidate flag (never a promotion)", () => {
    const t0ish = classify(territory("payments/"))
    expect(t0ish.t0Candidate).toBe(true) // security-critical name is FLAGGED
    // teeth (breaks-on "classify auto-promotes a node to T0"):
    expect(t0ish.tier).toBe("T2") // ...but the tier is NEVER written to T0 — human-ratified only
    expect(isT0Candidate("payments/charge.ts")).toBe(true)

    // the invariant `t0Candidate ⇒ tier == 'T2'` holds across the whole corpus.
    for (const p of ["auth/", "secrets/", "kms/", "crypto/", "queue/", "src/util/"]) {
      expect(classify(territory(p)).tier).toBe("T2")
    }
    expect(classify(territory("queue/")).t0Candidate).toBe(false) // a non-keyword path is not flagged
  })

  // ── 3. T0 NEVER AUTO-RATIFIES — billy/human token or nothing ───────────────────────────────────────
  it("never auto-ratifies a T0 node — it takes the billy token, never an explorer, never an empty token", () => {
    const t0Staged = stage(candidate({ tier: "T0" as Tier }))
    expect(ratify(t0Staged, { by: "billy" }).committed).toBe(true) // the human/security gate signs
    // teeth (breaks-on "a T0 node is auto-ratified without the human/billy gate"):
    expect(ratify(t0Staged, { by: "someExplorer" })).toEqual({ committed: false }) // an explorer cannot sign T0
    expect(ratify(t0Staged, { by: "" })).toEqual({ committed: false }) // an empty token never commits

    // a non-T0 staged candidate still needs SOME ratifier token (propose ≠ ratify), and it is a
    // returned verdict — never a throw.
    expect(ratify(stage(candidate()), { by: "lead" }).committed).toBe(true)
    expect(ratify(stage(candidate()), { by: "" }).committed).toBe(false)
    // the explorer's staged handle carries no commit — it cannot self-commit.
    expect("committed" in (stage(candidate()) as object)).toBe(false)
  })

  // ── 4. FASTPATH DISCIPLINE — only grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested auto-accepts ──────
  it("fast-paths ONLY a grounded low-risk T2 advisory candidate — risk/contest/T0/predicate route to full ratify", () => {
    const clean = candidate({ tier: "T2" }) // grounded advisory, no check
    expect(isGrounded(clean.grounding)).toBe(true)
    expect(isAdvisory(clean)).toBe(true)
    expect(route(clean, { lowRisk: true, contested: false })).toBe("auto-accept")

    // teeth (breaks-on "a risky/contested/T0 candidate is fast-pathed to auto-accept"):
    expect(route(candidate({ tier: "T0" as Tier }), { lowRisk: true, contested: false })).toBe("full-ratify") // T0
    expect(route(clean, { lowRisk: true, contested: true })).toBe("full-ratify") // reviewer veto / conflict
    expect(route(clean, { lowRisk: false, contested: false })).toBe("full-ratify") // over the risk threshold
    expect(route(candidate({ check: predicateCheck }), { lowRisk: true, contested: false })).toBe("full-ratify") // predicate
    expect(route(candidate({ grounding: UNGROUNDED }), { lowRisk: true, contested: false })).toBe("full-ratify") // ungrounded
    expect(isGrounded(UNGROUNDED)).toBe(false)
  })

  // ── 5. TEMPLATE CAP — no free prose, ≤512 B, closed-12 slot ────────────────────────────────────────
  it("rejects an oversized / missing-field / out-of-vocab-slot fact and accepts a well-formed one", () => {
    expect(validateTemplate(candidate())).toBe(true) // well-formed ⇒ persists

    // teeth (breaks-on "an oversized/malformed fact passes template validation"):
    expect(validateTemplate({ ...candidate(), claimText: "x".repeat(513) })).toBe(false) // > 512 UTF-8 bytes
    expect(validateTemplate({ ...candidate(), claimText: "x".repeat(512) })).toBe(true) // exactly the cap persists
    expect(validateTemplate({ ...candidate(), provenance: undefined } as unknown as Candidate)).toBe(false) // missing required receipt
    expect(validateTemplate({ ...candidate(), claimNorm: "" } as unknown as Candidate)).toBe(false) // missing required field
    expect(validateTemplate({ ...candidate(), slot: "free-text" as unknown as Candidate["slot"] })).toBe(false) // out-of-closed-slot
  })

  // ── 6a. EVERY WRITE AN UPSERT — DEDUP/CREATE/UPDATE/SUPERSEDE, never REJECT/throw ───────────────────
  it("routes every write to an upsert cell — never a silent REJECT/loss — leaving the inputs untouched", () => {
    // S0: an advisory @ nk-adv (bytes ch-a00) + a predicate @ nk-prd (check folded, bytes ch-p00).
    const seedS0 = (): StoreProjection => {
      let s = emptyStore()
      s = upsert(s, { nodeKey: "nk-adv", contentHash: "ch-a00", family: "advisory", claimNorm: "cn-eqbytes" }).store
      s = upsert(s, { nodeKey: "nk-prd", contentHash: "ch-p00", family: "predicate", claimNorm: "cn-head" }).store
      return s
    }
    const stream: readonly WriteRequest[] = [
      { nodeKey: "nk-adv", contentHash: "ch-a00", family: "advisory", claimNorm: "cn-eqbytes" }, // byte-identical ⇒ DEDUP
      { nodeKey: "nk-new", contentHash: "ch-b11", family: "advisory", claimNorm: "cn-fresh" }, // new subject ⇒ CREATE
      { nodeKey: "nk-adv", contentHash: "ch-c22", family: "advisory", claimNorm: "cn-latency" }, // advisory hit ⇒ UPDATE
      { nodeKey: "nk-prd", contentHash: "ch-d33", family: "predicate", claimNorm: "cn-head2" }, // same check ⇒ SUPERSEDE
      { nodeKey: "nk-prd2", contentHash: "ch-e44", family: "predicate", claimNorm: "cn-tail" }, // diff check ⇒ CREATE
    ]

    const s0 = seedS0()
    const before = currentNodes(s0).length
    let s = s0
    const routes: string[] = []
    for (const w of stream) {
      const r = upsert(s, w)
      routes.push(r.decision)
      s = r.store
    }
    expect(routes).toEqual(["DEDUP", "CREATE", "UPDATE", "SUPERSEDE", "CREATE"])
    // teeth (breaks-on "a write is silently rejected/lost instead of routed as an upsert"):
    expect(routes).not.toContain("REJECT") // admission (KNOW-2) is a separate door; the route never REJECTs
    expect(currentNodes(s0).length).toBe(before) // the seed projection is untouched (pure — no mutation)
    // nk-adv is still exactly ONE node after DEDUP+UPDATE — no append, no loss.
    expect(currentNodes(s).filter((n) => n.nodeKey === "nk-adv")).toHaveLength(1)

    // the routing is TOTAL over the finite hash-state product — every cell lands in an upsert cell.
    const valid = new Set(["DEDUP", "CREATE", "UPDATE", "SUPERSEDE"])
    for (const contentHashHit of [false, true])
      for (const nodeKeyHit of [false, true])
        for (const family of ["advisory", "predicate"] as readonly NodeFamily[])
          for (const checkSame of [false, true]) {
            const inputs: RouteInputs = { contentHashHit, nodeKeyHit, family, checkSame }
            expect(valid.has(routeWrite(inputs))).toBe(true) // never REJECT, never a throw
          }
  })

  // ── 6a-adjacency. UN-MERGE (WP-DEDUP-1) — a child-unit dup mints its OWN node (two nodes, not one) ────
  it("mints a distinct node for a child-unit fact whose claim duplicates a parent — two nodes, not one", () => {
    // a parent-unit advisory at `payments::charge` carries the idempotency claim.
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-parent",
      contentHash: "ch-parent",
      family: "advisory",
      claimNorm: "cn-idem",
      primaryAnchor: "payments::charge",
      slot: "invariant",
    }).store
    const before = currentNodes(s).length

    // a NEW fact is CREATE'd at the CHILD unit `payments::charge::retry` with the SAME claimNorm — a fresh
    // nodeKey. The ADJACENCY-B always-merge is REMOVED (WP-DEDUP-1): each grounding stays distinct (A2), so
    // the child mints its OWN node. Adjacency is now a derived-on-read `subsumes` relation (WP-DEDUP-2).
    const r = upsert(s, {
      nodeKey: "nk-child",
      contentHash: "ch-child",
      family: "advisory",
      claimNorm: "cn-idem",
      primaryAnchor: "payments::charge::retry",
      slot: "gotcha",
    })

    expect(r.decision).toBe("CREATE") // a routed CREATE stays a CREATE — no write-time merge
    // teeth (breaks-on "an adjacent-anchor duplicate is silently folded into the parent"):
    expect(currentNodes(r.store).length).toBe(before + 1) // TWO nodes now — the child lands
    expect(r.store.current.has("nk-parent")).toBe(true) // BOTH nodeKeys present
    expect(r.store.current.has("nk-child")).toBe(true)
    expect(r.store.current.get("nk-parent")!.claims).toEqual(["cn-idem"]) // the parent's claims unchanged
    // a NON-adjacent fact with the same claim is likewise its own node — a distinct subtree is a distinct node.
    const far = upsert(s, {
      nodeKey: "nk-far",
      contentHash: "ch-far",
      family: "advisory",
      claimNorm: "cn-idem",
      primaryAnchor: "refunds::issue",
      slot: "invariant",
    })
    expect(far.decision).toBe("CREATE")
    expect(far.store.current.has("nk-far")).toBe(true)
  })

  // ── 6b. SUPERSEDE IS A DEDUP POINTER — 0 byte-copy, 0 delete (injected real CAS) ────────────────────
  it("supersedes a predicate as a dedup CAS pointer, returning `next` unchanged (0 byte-copy, 0 delete)", () => {
    const archive = bindArchive(createStore()) // INJECTED PORT wired to the REAL sealed kernel CAS
    const prior = predicateNode("nk-prd", "head")
    const next = predicateNode("nk-prd", "head2")
    const { node, supersededBy } = archive.supersede(prior, next)

    expect(node).toBe(next) // the superseder is `next` UNCHANGED — old bytes never inlined
    expect("supersededBy" in node).toBe(false) // only the RETURN-LEG pointer links the prior
    // teeth (breaks-on "a write is silently rejected/lost instead of routed as an upsert"):
    expect(archive.resolve(supersededBy)).toEqual(prior) // prior lives in cold CAS, re-spawnable — nothing dies
    // content-address dedup: two identical priors collapse to ONE address (0 redundant byte-copy).
    const a = archive.supersede(predicateNode("nk-p", "x"), predicateNode("nk-p", "y")).supersededBy
    const b = archive.supersede(predicateNode("nk-p", "x"), predicateNode("nk-p", "z")).supersededBy
    expect(a).toBe(b)
  })

  // ── UN-PARK — the composed-store front-door is now WIRED (owner-RATIFIED reversal of the PARK) ──────
  it("the writeDecision front-door IS exported and governs a candidate — DEDUP/CREATE/UPDATE/SUPERSEDE", () => {
    // RATIFIED UN-PARK (WP-9.2.4.KNOWLEDGE): the front door is COMPOSED, not invented — it mints the
    // contentHash through the SEALED kernel `id` seam, reuses `nodeKey` + `routeWrite` (D0 contentHash / D1 nodeKey dedup only),
    // and takes the `StoreProjection` as DATA (the `upsert(store, req)` idiom), so no OWNER-DEFINE composed
    // store is fabricated. The barrel `export *` surfaces it — the presence assertion is now TRUE.
    expect("writeDecision" in knowledge).toBe(true)
    expect(typeof knowledge.writeDecision).toBe("function")
    // ...and the routed-around primitives this story exercised REMAIN wired (the front door composes them):
    expect(typeof routeWrite).toBe("function")
    expect(typeof upsert).toBe("function")

    // It governs a candidate over a projection CONSISTENT with the routed-around routeWrite/upsert above:
    // the projection is seeded from the SAME sealed `nodeKey`/`id` the front door computes (real hit/miss).
    const adv = candidate({ claimNorm: "cn-gov" }) // advisory (no check)
    const prd = candidate({ claimNorm: "cn-gov-p", check: predicateCheck }) // predicate
    const advKey = knowledge.nodeKey(adv) as string
    const prdKey = knowledge.nodeKey(prd) as string
    const advHash = kid(adv) as string

    const empty: StoreProjection = emptyStore()
    const seeded: StoreProjection = {
      current: new Map([
        [advKey, { nodeKey: advKey, family: "advisory" as NodeFamily, contentHash: "ch-x", claims: ["cn-old"] }],
        [prdKey, { nodeKey: prdKey, family: "predicate" as NodeFamily, contentHash: "ch-y", claims: ["cn-old"] }],
      ]),
      cas: new Set<string>(),
    }

    expect(knowledge.writeDecision(adv, empty)).toBe("CREATE") // fresh subject
    expect(knowledge.writeDecision(adv, seeded)).toBe("UPDATE") // advisory nodeKey hit ⇒ set-union
    expect(knowledge.writeDecision(prd, seeded)).toBe("SUPERSEDE") // predicate hit, same check
    // dedup precedence: the same bytes already retained short-circuits regardless of the nodeKey leg.
    const withBytes: StoreProjection = { current: seeded.current, cas: new Set<string>([advHash]) }
    expect(knowledge.writeDecision(adv, withBytes)).toBe("DEDUP")
  })
})
