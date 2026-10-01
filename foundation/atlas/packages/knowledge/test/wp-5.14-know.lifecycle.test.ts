// @atlas/knowledge — test/wp-5.14-know.lifecycle.test.ts  (WP-5.14.KNOW · EPIC-14)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the fact lifecycle (templated + scope-checked
// upserts, prior versions deduped in CAS) against the FROZEN oracles {template,authz,archive}.ts:
//   KNOW-10  templated write, no free prose — SCN-KNOW-10a-1 (free-prose reject), 10b-1 (missing field),
//            10b-2 (over-cap); plus the closed-slot + totality teeth of INV-KNOW-10.
//   KNOW-11  scope-owned write, universal read — SCN-KNOW-11a-1 (carries scope, fail-closed),
//            11b-1 (universal read), 11c-1 (out-of-scope write rejected); plus INV-KNOW-11 teeth.
//   KNOW-12  nothing dies — SCN-KNOW-12a-1 (prior re-spawnable), 12b-1 (deduped priors), 12c-1 (advisory
//            edit keeps NO pointer), 12d-1 (supersede adds ONLY a pointer), 12e-1 (working store lean).
// Held-out `-2` fixtures (queue/ territory, scope-D writer, chk-tail predicate, second edits/decays) are
// NOT referenced here.
//
// SEAM (sealed @atlas/kernel CAS; no raw hashing): the archive's dedup/re-spawn uses `createStore()` — the
// single content-addressed store — exactly as the card pins. The ownership anchor is the R3-surfaced
// optional `scope` field on the frozen `GroundedFact` (#187, owner-ratified 2026-08-03: `owner` was removed
// from this fence — see `req-knw.md#REQ-KNOW-11a` — so this suite no longer constructs one; #186 then
// removed the knowledge-side `authz()`/`inScope` decision entirely — see the KNOW-11 block below). The
// `slot`/`predicateSlot` divergence, the missing-field cells (a Candidate typed-required field omitted at
// runtime), and the off-vocab slot are expressed by casts — the only way to reach the `missing`/`out` cells
// of the enumerated validity product past the frozen type.
//
// MODELING NOTE (SCN-KNOW-12e-1, flagged — cf. router.ts MODELING NOTE): the "hot working set" and the
// KNOW-17 `decay` are UPSTREAM of this facet; here they are modeled as a caller-maintained `Map` and a plain
// delete. The archive-OWNED property under test is that SUPERSEDE routes the prior to COLD CAS (re-spawnable
// via `resolve`) and returns ONLY the superseder — so an edit never grows the hot set.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash, createStore } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import type { Candidate, GroundedFact, AdvisoryNode, PredicateNode } from "@atlas/knowledge"
import type { Grounding } from "@atlas/grounding"
import { validateTemplate, isClosedSlot } from "../src/write/template.js"
import { isScope } from "../src/write/authz.js"
import { bindArchive } from "../src/write/archive.js"
import { emptyStore, upsert } from "../src/write/upsert.js"
import type { WriteRequest } from "../src/write/projection-types.js"

// ── fixtures ────────────────────────────────────────────────────────────────

const grounding = (n: string): Grounding => ({
  entries: [
    { anchor: { kind: "symbol", qualifiedPath: `fn ${n}`, subtreeHash: asSubtreeHash(`st-${n}`) }, path: "src/x.ts" },
  ],
})

describe("WP-4.11-b.KNOW — claim provenance durability", () => {
  it("SCN-KNOW-14a-1 — persisted claim has source/trusted/sha receipt", () => {
    const firstReceipt = { source: "source:first", trusted: true, sha: "sha:first" } as const
    const secondReceipt = { source: "source:second", trusted: false, sha: "sha:second" } as const
    const create: WriteRequest = {
      nodeKey: "nk-provenance",
      contentHash: "ch-provenance-0",
      family: "advisory",
      claimNorm: "claim:first",
      provenanceByClaim: { "claim:first": firstReceipt },
    }
    let store = upsert(emptyStore(), create).store
    expect(store.current.get("nk-provenance")?.provenanceByClaim).toEqual({ "claim:first": firstReceipt })

    const update: WriteRequest = {
      ...create,
      contentHash: "ch-provenance-1",
      claimNorm: "claim:second",
      provenanceByClaim: { "claim:second": secondReceipt },
    }
    store = upsert(store, update).store
    expect(store.current.get("nk-provenance")?.claims).toEqual(["claim:first", "claim:second"])
    expect(store.current.get("nk-provenance")?.provenanceByClaim).toEqual({
      "claim:first": firstReceipt,
      "claim:second": secondReceipt,
    })

    const predicateCreate: WriteRequest = {
      nodeKey: "nk-provenance-predicate",
      contentHash: "ch-provenance-predicate-0",
      family: "predicate",
      claimNorm: "predicate:first",
      provenanceByClaim: { "predicate:first": firstReceipt },
    }
    store = upsert(store, predicateCreate).store
    store = upsert(store, {
      ...predicateCreate,
      contentHash: "ch-provenance-predicate-1",
      claimNorm: "predicate:second",
      provenanceByClaim: { "predicate:second": secondReceipt },
    }).store
    expect(store.current.get("nk-provenance-predicate")?.provenanceByClaim).toEqual({
      "predicate:second": secondReceipt,
    })
  })
})

/** A well-formed staged advisory candidate (all Candidate-carried required template fields; slot ∈ 12). */
const wellFormed = (): Candidate => ({
  claimText: "the queue drains FIFO under back-pressure",
  claimNorm: "cn-fifo",
  slot: "invariant",
  grounding: grounding("fifo"),
  provenance: { source: "agent://forge", trusted: true },
  tier: "T2",
})

const advisoryNode = (nk: string, opts: { scope?: string } = {}): AdvisoryNode => ({
  kind: "advisory",
  id: asNodeKey(nk),
  tier: "T2",
  claimNorm: `cn-${nk}`,
  grounding: grounding(nk),
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
  ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
})

const predicateNode = (nk: string, claimNorm: string): PredicateNode => ({
  kind: "predicate",
  id: asNodeKey(nk),
  tier: "T2",
  check: { kind: "index-query", query: `q-${claimNorm}` },
  grounding: grounding(nk),
  status: "HOLDS",
  freshness: "FRESH",
  claims: [],
  authoring: "PREDICATED",
})

// ── KNOW-10: templated write, no free prose ──────────────────────────────────

describe("WP-5.14.KNOW — templated write, 0 free prose (KNOW-10 visible goldens)", () => {
  it("SCN-KNOW-10a-1 — a free-prose blob (no template binding, no predicateSlot) is REJECTED", () => {
    const freeProse = {
      claimText: "anything at all",
      claimNorm: "",
      grounding: grounding("f5"),
    } as unknown as Candidate
    expect(validateTemplate(freeProse)).toBe(false) // 0 free-prose facts persist
  })

  it("SCN-KNOW-10b-1 — a fact with `provenance` absent, otherwise well-formed, is REJECTED", () => {
    const noReceipt = { ...wellFormed(), provenance: undefined } as unknown as Candidate
    expect(validateTemplate(noReceipt)).toBe(false) // receiptless node must not persist
  })

  it("SCN-KNOW-10b-2 — a fact whose `claimText` is 700 B (> the 512 B cap) is REJECTED", () => {
    const overCap: Candidate = { ...wellFormed(), claimText: "x".repeat(700) }
    expect(validateTemplate(overCap)).toBe(false) // unbounded prose leaks past the cap → rejected
    // boundary teeth: exactly 512 B PERSISTS, 513 B REJECTS
    expect(validateTemplate({ ...wellFormed(), claimText: "x".repeat(512) })).toBe(true)
    expect(validateTemplate({ ...wellFormed(), claimText: "x".repeat(513) })).toBe(false)
  })

  it("a well-formed fact (all required fields, ≤cap, slot ∈ 12) PERSISTS", () => {
    expect(validateTemplate(wellFormed())).toBe(true)
  })

  it("teeth-10 — the closed slot vocabulary has EXACTLY the 13 members; an off-vocab slot rejects", () => {
    const thirteen = [
      "invariant",
      "contract",
      "precondition",
      "postcondition",
      "sideeffect",
      "ownership",
      "perf-bound",
      "security-property",
      "gotcha",
      "rationale",
      "dependency",
      "count",
      "definition",
    ] as const
    for (const s of thirteen) expect(isClosedSlot(s)).toBe(true)
    expect(isClosedSlot("free-text" as unknown as (typeof thirteen)[number])).toBe(false) // adding one is a `cv` bump
    expect(isClosedSlot(undefined as unknown as (typeof thirteen)[number])).toBe(false) // no-slot blob
    expect(validateTemplate({ ...wellFormed(), slot: "free-text" as unknown as (typeof thirteen)[number] })).toBe(false)
  })

  it("teeth-10 — a missing claimNorm/grounding also rejects (required-field check is not partial)", () => {
    expect(validateTemplate({ ...wellFormed(), claimNorm: "" } as unknown as Candidate)).toBe(false)
    expect(validateTemplate({ ...wellFormed(), grounding: undefined } as unknown as Candidate)).toBe(false)
  })
})

// ── KNOW-11: scope-owned write, universal read ──────────────────────────────

// ── #186 — WHERE THE KNOW-11 GOLDENS ARE REALIZED, AND WHY NOT HERE ─────────────────────────────────────
// SCN-KNOW-11a-1 / 11b-1 / 11c-1 used to be transcribed in this file against `authz(op, actor, fact)` and
// `inScope(actor, scope)`. Those functions had ZERO production callers — proven on the BUILT `dist` in a
// subprocess, where a successful `atlas emit` reaches `actorInScope` (adapter-io/src/policy.ts) and
// `isScope` (this package) and reaches `authz`/`inScope` never — and they encoded a DIFFERENT rule
// (`actor === scope`, nominal equality) than the shipped door (admin-declared membership from
// `.atlas/policy.json`). A golden transcribed against the wrong function is not coverage; it is a green
// light pointing at nothing. #186 deleted the functions, so the transcription moves rather than dying:
//   · SCN-KNOW-11a-1 (a write carries a scope; scope-less fails closed)
//       → `packages/e2e-blackbox/test/s7-governance.blackbox.test.ts` — "DENY (absent scope)": exit 2,
//         `reason: malformed scope`, nothing persisted, through the REAL binary.
//   · SCN-KNOW-11b-1 (read is universal)
//       → `packages/adapter-io/src/governed-link.ts` header + S7: no read door is authz-gated at all.
//   · SCN-KNOW-11c-1 (an out-of-scope write is rejected)
//       → `packages/adapter-io/test/policy.test.ts` — `describe('actorInScope — fail-closed authz…')`,
//         six cases incl. absent-scope and prototype-name TEETH; and S7 "DENY (not in scope)" at the binary.
// What remains HERE is the half this package still owns: the runtime SHAPE of the ownership anchor.

describe("WP-5.14.KNOW — the KNOW-11 ownership ANCHOR, the half this package owns (#186)", () => {
  it("the ownership anchor is a non-empty string, checked at runtime — the type is erased", () => {
    const fact = advisoryNode("nk-a", { scope: "A" })
    expect(isScope(fact.scope)).toBe(true) // a real anchor
    expect(isScope(advisoryNode("nk-a").scope)).toBe(false) // absent ⇒ no anchor ⇒ the door fails closed
    expect(isScope("")).toBe(false) // empty ⇒ no anchor
  })

  it("the anchor guard is NOT an authorization decision — it passes a scope no policy declares", () => {
    // The exact confusion #186 removed: `isScope` says the value is comparable and usable as a lookup key,
    // never that anyone may write it. `actorInScope(policy, actor, scope)` decides that, in adapter-io.
    expect(isScope("a-scope-no-policy-has-ever-declared")).toBe(true)
  })
})

// ── KNOW-12: nothing dies — git + CAS, no redundant copy ──────────────────────

describe("WP-5.14.KNOW — nothing dies: CAS retention, dedup, pointer-not-copy (KNOW-12 visible goldens)", () => {
  it("SCN-KNOW-12a-1 — a superseded prior version stays recoverable (get(oldId) resolves post-supersede)", () => {
    const archive = bindArchive(createStore())
    const prd = predicateNode("nk-prd", "head")
    const w4 = predicateNode("nk-prd", "head2")
    const { supersededBy } = archive.supersede(prd, w4)
    expect(archive.resolve(supersededBy)).toEqual(prd) // old bytes re-spawn — no history lost, 0 deletes
  })

  it("SCN-KNOW-12b-1 — prior versions are their own CAS objects; two identical priors DEDUP to one address", () => {
    const archive = bindArchive(createStore())
    const priorA = predicateNode("nk-prd", "head")
    const priorB = predicateNode("nk-prd", "head") // identical bytes
    const distinct = predicateNode("nk-prd2", "tail")
    const a = archive.supersede(priorA, predicateNode("nk-prd", "head2")).supersededBy
    const b = archive.supersede(priorB, predicateNode("nk-prd", "head3")).supersededBy
    const c = archive.supersede(distinct, predicateNode("nk-prd2", "tail2")).supersededBy
    expect(a).toBe(b) // content-address dedup — never byte-copied twice
    expect(a).not.toBe(c) // distinct bytes ⇒ a second address
  })

  it("SCN-KNOW-12c-1 — an advisory edit-in-place keeps NO lineage pointer (git is the archive)", () => {
    // an advisory UPDATE never enters the predicate-only archive; the frozen AdvisoryNode carries no
    // `supersededBy` field at all — the advisory family accretes zero in-store lineage.
    const editedAdvisory = advisoryNode("nk-adv", { scope: "A" })
    expect("supersededBy" in editedAdvisory).toBe(false)
  })

  it("SCN-KNOW-12d-1 — a predicate supersede adds ONLY a pointer (old bytes not inlined into the new node)", () => {
    const archive = bindArchive(createStore())
    const prd = predicateNode("nk-prd", "head")
    const w4 = predicateNode("nk-prd", "head2")
    const { node, supersededBy } = archive.supersede(prd, w4)
    expect(node).toEqual(w4) // the superseder is `next` unchanged — no old bytes copied in
    expect("supersededBy" in node).toBe(false) // only the RETURN-LEG pointer links the prior
    expect(archive.resolve(supersededBy)).toEqual(prd) // the link (a pointer into CAS) resolves the prior
  })

  it("SCN-KNOW-12e-1 — the working store stays lean: edit occupies one hot slot, prior lives in cold CAS, decay drops", () => {
    const store = createStore()
    const archive = bindArchive(store)
    const hot = new Map<NodeKey, GroundedFact>()

    // an advisory edited in place (W3, UPDATE): the edit REPLACES the hot slot; the prior does not enter hot.
    const advKey = asNodeKey("nk-adv")
    hot.set(advKey, advisoryNode("nk-adv", { scope: "A" }))
    hot.set(advKey, advisoryNode("nk-adv", { scope: "A" })) // edit-in-place, same key
    expect(hot.size).toBe(1) // one hot slot — the working store does not grow on edit

    // a predicate supersede routes the prior to COLD CAS (re-spawnable) and keeps only the superseder hot.
    const prd = predicateNode("nk-prd", "head")
    hot.set(prd.id, prd)
    const { node, supersededBy } = archive.supersede(prd, predicateNode("nk-prd", "head2"))
    hot.set(node.id, node) // only the superseder occupies the hot slot
    expect(hot.get(prd.id)).toBe(node) // prior no longer hot
    expect(archive.resolve(supersededBy)).toEqual(prd) // prior lives in cold CAS, still recoverable

    // a fact decayed by KNOW-17 (upstream) drops from the hot set.
    const decayed = asNodeKey("nk-decayed")
    hot.set(decayed, advisoryNode("nk-decayed", { scope: "A" }))
    hot.delete(decayed) // KNOW-17 decay
    expect(hot.has(decayed)).toBe(false)
    expect(hot.size).toBe(2) // { nk-adv (edited), nk-prd (superseder) } — lean, no accreted priors
  })
})
