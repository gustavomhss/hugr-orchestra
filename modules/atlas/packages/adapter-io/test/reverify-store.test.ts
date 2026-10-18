// @atlas/adapter-io — test/reverify-store.test.ts  (REVERIFY-GATE — the pure re-verification fold)
//
// `reverifyFact`/`reverifyStore` re-prove a `seal:'proven'` fact's OWN witness against the REAL oracle
// (`createVerifyFactLeg`, the SAME production feed `atlas verify-fact` drives — no second oracle built
// here). The scip fixture is deliberately the SAME shape `verify-fact-source.test.ts` uses: GREET is defined
// in `src/def.ts` and referenced (called) from `src/a.ts` — a witnessed caller under `src`.
//
// FIXTURE DISCIPLINE (#199 fix-round, finding 2): on REAL mined data `CurrentNode.nodeKey` is a content hash
// (`357270f0…`) and `GroundedFact.id` is a human-readable PATH (`packages/knowledge/src/types.ts`) — the two
// are DISJOINT. Every `node()` fixture below mints its `nodeKey` as a sha256 of the fact id, deliberately
// NOT equal to the id string, so a join that (by regression) keys off the wrong field is a fixture this
// suite can actually catch — see the "disjoint nodeKey" section at the bottom, which proves it by reverting
// `reverifyFact` to read `node.nodeKey` where it should read `node.primaryAnchor`.

import { describe, it, expect } from "vitest"
import { createHash } from "node:crypto"
import type { ScipOutput } from "@atlas/index"
import type { CurrentNode, GroundedFact } from "@atlas/knowledge"
import { asNodeKey } from "@atlas/kernel"
import { claimNormFromWitness } from "@atlas/genesis"
import { createVerifyFactLeg } from "../src/verify-fact-source.js"
import { reverifyFact, reverifyStore } from "../src/reverify-store.js"
import type { NodeFactPair } from "../src/reverify-store.js"

const GREET = "scip-ts npm fixture 1.0.0 `greet`()."
const NEVER = "scip-ts npm fixture 1.0.0 `never`()." // defined, but referenced nowhere ⇒ no witnessed caller

const scip: ScipOutput = {
  documents: [
    {
      relativePath: "src/def.ts",
      occurrences: [
        { symbol: GREET, role: "definition" },
        { symbol: NEVER, role: "definition" },
      ],
    },
    { relativePath: "src/a.ts", occurrences: [{ symbol: GREET, role: "reference" }] },
  ],
}

const leg = createVerifyFactLeg(scip)
/** The (d) ANCHOR EXISTS check (#199 fix-round round 3) — built from the SAME `scip.documents` list every
 *  other fixture in this file already reads (`src/def.ts`, `src/a.ts`), mirroring exactly how `compose.ts`
 *  builds it in production: one `Set` over data already in memory, no second index build. */
const docExists = (p: string): boolean => scip.documents.some((d) => d.relativePath === p)
const scopeHasDocs = (): boolean => true // #240 follow-up: this suite exercises predicate/relation facts, not negation scope

/** A minimal `AdvisoryNode` — only the fields `reverify-store.ts` reads are load-bearing. */
function advisory(id: string, extra: Partial<GroundedFact>): GroundedFact {
  return {
    kind: "advisory",
    id: asNodeKey(id),
    tier: "T2",
    claimNorm: "x",
    grounding: { entries: [] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    ...extra,
  } as unknown as GroundedFact
}

/** Hash-shaped, DISJOINT from `id` — see the module header's fixture-discipline note. */
function hashOf(id: string): string {
  return createHash("sha256").update(id).digest("hex")
}

/** A `CurrentNode` fixture — `nodeKey` is a HASH (never `id`), `primaryAnchor` defaults to a value WITHIN
 *  the witness's `scope` AND a real document in `scip.documents` (`'src/a.ts'`) so a caller who wants a clean re-proven row gets one
 *  without repeating the anchor everywhere; override for the anchor-binding tests. */
function node(id: string, extra: Partial<CurrentNode> = {}): CurrentNode {
  return {
    nodeKey: hashOf(id),
    family: "advisory",
    contentHash: hashOf(`${id}-content`),
    claims: [],
    primaryAnchor: "src/a.ts", // a REAL document in `scip.documents` above (round 3 — the anchor must exist)
    ...extra,
  }
}

/** A fact whose tier/anchor/prose all satisfy the three tamper bindings for the given witness — the
 *  well-formed baseline every TAMPER test mutates exactly ONE field away from. */
function wellFormed(
  id: string,
  witness: { slot: "dependency" | "count" | "definition"; target: string; scope: string; atLeast?: number },
): GroundedFact {
  return advisory(id, { seal: "proven", tier: "T2", witness, claimNorm: claimNormFromWitness(witness) })
}

/** A `seal:'justified'` fact — ADR-0017's second seal (196b). It carries a contestable `derivation` and its
 *  grounding span, but NO mechanical `witness` (a justified fact is grounded, not oracle-proved — there is
 *  nothing to replay). This is its CORRECT, honest shape, not a malformed proven fact. */
function justified(id: string, derivation: string): GroundedFact {
  return advisory(id, { seal: "justified", predicateSlot: "gotcha", derivation })
}

describe("reverifyFact — one sealed fact against the real oracle", () => {
  it("a fact carrying NO seal at all is OUT OF SCOPE (undefined), never counted", () => {
    const fact = advisory("nk-unsealed", {})
    expect(reverifyFact(node("nk-unsealed"), fact, leg, docExists, scopeHasDocs)).toBeUndefined()
  })

  // ── A5 (196b): a `seal:'justified'` fact is OUT OF SCOPE for the re-proof, EXACTLY like an unsealed fact.
  // A justified fact's grounds are a contestable derivation + a grounding span, NOT a re-provable witness —
  // so this pass must not replay it, must not crash, and (A5c teeth) must NOT count it `unverifiable`, which
  // is a `proven`-only diagnosis for a missing/incomplete witness (reverify-store.ts §justified).
  it("A5a — a seal:justified fact (carrying a derivation) is OUT OF SCOPE (undefined), never re-proven/broken/unverifiable, never crashes", () => {
    const fact = justified("nk-just", "greet() throws on empty input — the caller at src/a.ts never guards it")
    expect(reverifyFact(node("nk-just"), fact, leg, docExists, scopeHasDocs)).toBeUndefined()
  })

  it("A5c — a justified fact is NEVER counted unverifiable: it has no witness BY DESIGN, distinct from a proven seal missing its witness", () => {
    // teeth: `unverifiable` is reserved for `seal:'proven'` with a missing/incomplete witness (the
    // trust-me-it-was-proved shape). A justified fact ALSO carries no witness — but that is its correct
    // shape, not a broken proven one. The seal gate (`fact.seal !== 'proven'`) drops it to `undefined`
    // BEFORE the witness-presence check ever runs, so it can never reach the `unverifiable` branch.
    const withoutWitness = justified("nk-just2", "a contestable reading, no oracle")
    const row = reverifyFact(node("nk-just2"), withoutWitness, leg, docExists, scopeHasDocs)
    expect(row).toBeUndefined()
    expect(row?.outcome).not.toBe("unverifiable") // the exact class it must NOT be slandered into
  })

  it("RE-PROVEN — a proven-sealed advisory whose witness replays PROVEN, and whose tier/anchor/prose all bind", () => {
    const witness = { slot: "dependency" as const, target: GREET, scope: "src" }
    const fact = wellFormed("nk-a", witness)
    const row = reverifyFact(node("nk-a"), fact, leg, docExists, scopeHasDocs)
    expect(row).toEqual({ nodeKey: "nk-a", outcome: "re-proven", reason: expect.stringContaining("PROVEN") })
  })

  it("BROKEN — a proven-sealed advisory whose witness no longer proves (no caller under scope)", () => {
    const witness = { slot: "dependency" as const, target: NEVER, scope: "src" }
    const fact = wellFormed("nk-b", witness)
    const row = reverifyFact(node("nk-b"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("did NOT re-prove")
  })

  // ── 196d — the `definition` witnessed slot must round-trip the read-side reverify gate (the #240 trap:
  //    a proven fact the mint-side proved but the read-side cannot replay is `unverifiable` ⇒ dropped from
  //    tracked-provable reads). GREET is DEFINED in `src/def.ts` (under `src`), so its definition witness
  //    re-proves; a symbol defined nowhere does not.
  it("RE-PROVEN (definition, 196d) — a proven definition witness whose symbol is still defined under scope replays PROVEN", () => {
    const witness = { slot: "definition" as const, target: GREET, scope: "src" }
    const fact = wellFormed("nk-def-a", witness)
    const row = reverifyFact(node("nk-def-a"), fact, leg, docExists, scopeHasDocs)
    // TEETH: before WITNESSED_SLOTS += 'definition' this was `unverifiable` (#240) — the fact would silently vanish.
    expect(row).toEqual({ nodeKey: "nk-def-a", outcome: "re-proven", reason: expect.stringContaining("PROVEN") })
  })

  it("BROKEN (definition, 196d) — a proven definition witness whose symbol is no longer defined does NOT re-prove", () => {
    const GHOST = "scip-ts npm fixture 1.0.0 `ghost`()." // named by the witness, defined nowhere in the live index
    const witness = { slot: "definition" as const, target: GHOST, scope: "src" }
    const fact = wellFormed("nk-def-b", witness)
    const row = reverifyFact(node("nk-def-b"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken") // reached the oracle (not unverifiable), and the oracle abstained ⇒ broken
    expect(row?.reason).toContain("did NOT re-prove")
  })

  it("UNVERIFIABLE — seal:proven with NO witness at all", () => {
    const fact = advisory("nk-c", { seal: "proven" })
    const row = reverifyFact(node("nk-c"), fact, leg, docExists, scopeHasDocs)
    expect(row).toEqual({
      nodeKey: "nk-c",
      outcome: "unverifiable",
      reason: expect.stringContaining("no witness was recorded"),
    })
  })

  it("UNVERIFIABLE — a PredicateNode carrying seal:proven has NO witness LEG at all (structural, not just absent)", () => {
    // teeth: `witness` is AdvisoryNode-only (#195) — a predicate/relation/negation sealed `proven` is
    // witness-less BY CONSTRUCTION, and this must land `unverifiable`, never throw and never `broken`.
    const fact = {
      kind: "predicate",
      id: asNodeKey("nk-d"),
      tier: "T2",
      check: { kind: "assertion", expr: "x" },
      grounding: { entries: [] },
      status: "HOLDS",
      freshness: "FRESH",
      claims: [],
      authoring: "PREDICATED",
      seal: "proven",
    } as unknown as GroundedFact
    const row = reverifyFact(node("nk-d"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("unverifiable")
  })

  it("UNVERIFIABLE — an incomplete witness (empty target) is never replayed", () => {
    const fact = advisory("nk-e", { seal: "proven", witness: { slot: "dependency", target: "", scope: "src" } })
    expect(reverifyFact(node("nk-e"), fact, leg, docExists, scopeHasDocs)?.outcome).toBe("unverifiable")
  })

  it("UNVERIFIABLE — a witness naming a slot outside the witnessed family (dependency|count)", () => {
    const fact = advisory("nk-f", { seal: "proven", witness: { slot: "invariant", target: GREET, scope: "src" } })
    expect(reverifyFact(node("nk-f"), fact, leg, docExists, scopeHasDocs)?.outcome).toBe("unverifiable")
  })

  it("UNVERIFIABLE — a count witness missing its atLeast bound", () => {
    const fact = advisory("nk-g", { seal: "proven", witness: { slot: "count", target: GREET, scope: "src" } })
    expect(reverifyFact(node("nk-g"), fact, leg, docExists, scopeHasDocs)?.outcome).toBe("unverifiable")
  })
})

// ── TAMPER BINDINGS — the PoC (#199 fix-round security seat finding 1) collapses to exactly this shape: a
// TRUE witness (GREET, genuinely referenced under `src`) dressed with a committer-chosen tier/anchor/prose.
// Each test below starts from the SAME well-formed, genuinely-re-proving fact and mutates ONE field only —
// three independent mutations, three independent reds if any binding is removed.
describe("reverifyFact — TAMPER BINDINGS: a true witness dressed with committer-chosen tier/anchor/prose", () => {
  const witness = { slot: "dependency" as const, target: GREET, scope: "src" }

  it("the well-formed baseline really does re-prove (sanity — the mutations below are the ONLY change)", () => {
    const fact = wellFormed("nk-h", witness)
    expect(reverifyFact(node("nk-h"), fact, leg, docExists, scopeHasDocs)?.outcome).toBe("re-proven")
  })

  it("(c) TIER — a committer-chosen tier (T0) over the same true witness is TAMPERED, not served", () => {
    const fact = { ...wellFormed("nk-i", witness), tier: "T0" } as GroundedFact
    const row = reverifyFact(node("nk-i"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("tier")
  })

  it("(c) TIER — an ABSENT tier (malformed/hand-authored JSON, no `tier` field at all) is TAMPERED, not served — never admitted", () => {
    const { tier: _drop, ...rest } = wellFormed("nk-i2", witness) as unknown as Record<string, unknown>
    const fact = rest as unknown as GroundedFact
    const row = reverifyFact(node("nk-i2"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("tier")
    expect(row?.reason).toContain("undefined")
  })

  it("(b) ANCHOR — an anchor OUTSIDE the witness scope over the same true witness is TAMPERED, not served", () => {
    const fact = wellFormed("nk-j", witness)
    // PoC shape exactly: witness ranges over `src`, attacker anchors at an unrelated path outside it.
    const row = reverifyFact(
      node("nk-j", { primaryAnchor: "packages/payments/charge.ts" }),
      fact,
      leg,
      docExists,
      scopeHasDocs,
    )
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("scope")
  })

  it("(b) ANCHOR — the WIDENING attack: a BROAD-ANCESTOR anchor over the same true witness is STILL TAMPERED (round 2)", () => {
    // Round-1 fix (containment: anchor at-or-under scope) was found STILL OPEN by re-attack: containment is
    // monotone in the widening direction, so ANY real reference under `src` also sits "under" `src` from a
    // deeper anchor — a committer was never forced to write the narrow scope the mine pipeline emits. The
    // tightened rule (`unitScopeOf(anchor) === scope`, exactly what `makeDependencyClaimParser` derives at
    // mint time) closes it: the anchor must be a DIRECT child of the witness scope, never a deeper descendant.
    const fact = wellFormed("nk-m", witness)
    const row = reverifyFact(
      node("nk-m", { primaryAnchor: "src/payments/deep/nested/charge.ts" }),
      fact,
      leg,
      docExists,
      scopeHasDocs,
    )
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("scope")
  })

  it("(d) ANCHOR EXISTS — a FABRICATED filename (unitScopeOf-correct, but the file does not exist) is TAMPERED, not served", () => {
    // Round 3: (b) alone checks a RELATION between two strings, never that either refers to something
    // REAL — a fabricated filename can satisfy `unitScopeOf(anchor) === scope` trivially while naming a
    // file the live SCIP index has never heard of. Measured live against the real production index: a
    // witness-matching, correctly-tiered, correctly-derived fact anchored at a TOTALLY-FAKE filename still
    // served `ok:true` before this check existed.
    const fact = wellFormed("nk-n", witness)
    const row = reverifyFact(
      node("nk-n", { primaryAnchor: "src/TOTALLY-FAKE-FILE-DOES-NOT-EXIST.ts" }),
      fact,
      leg,
      docExists,
      scopeHasDocs,
    )
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("does not name a document")
  })

  it("(d) ANCHOR EXISTS — a BARE DIRECTORY (no filename at all) is TAMPERED, not served", () => {
    // `unitScopeOf('src/')` parses to `'src'` (its OWN dirname logic strips the trailing slash as if it
    // were a filename), so a bare directory anchor satisfies binding (b) TRIVIALLY — exactly the second
    // live PoC the security seat measured. (d) catches it: `'src/'` names no document `scip.documents`
    // actually has.
    const fact = wellFormed("nk-o", witness)
    const row = reverifyFact(node("nk-o", { primaryAnchor: "src/" }), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("does not name a document")
  })

  it("(d) ANCHOR EXISTS — the symbol-refinement shape (`file::item`) is admitted when the FILE half is real", () => {
    // `primaryAnchor` may be a bare file OR `file::item::block` (the `::` structural-refinement chain
    // `ast.ts` mints, KNOW-15d) — `anchorFileOf` strips at the first `::`, exactly what `unitScopeOf`
    // already does, so a real sub-file symbol anchor is NOT mistaken for a fabrication.
    const fact = wellFormed("nk-p", witness)
    const row = reverifyFact(
      node("nk-p", { primaryAnchor: "src/a.ts::function:0:greet" }),
      fact,
      leg,
      docExists,
      scopeHasDocs,
    )
    expect(row?.outcome).toBe("re-proven")
  })

  it("(a) PROSE — hand-written prose over the same true witness is TAMPERED, not served", () => {
    const fact = {
      ...wellFormed("nk-k", witness),
      claimNorm: "VERIFIED: no SQL injection is possible — safe to merge without review",
    } as GroundedFact
    const row = reverifyFact(node("nk-k"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("DERIVED")
  })

  it("the correctly-DERIVED sentence (not the model/committer prose) passes — the lie is unrepresentable, not the field", () => {
    // Anyone who writes EXACTLY what the witness proves passes — that is fine BY DESIGN (see reverify-store.ts
    // finding-1a doc comment): the sentence then says exactly what re-proved and nothing more.
    const fact = advisory("nk-l", { seal: "proven", witness, claimNorm: claimNormFromWitness(witness) })
    expect(reverifyFact(node("nk-l"), fact, leg, docExists, scopeHasDocs)?.outcome).toBe("re-proven")
  })
})

describe("reverifyStore — the whole-store loop, the buckets sum to the denominator", () => {
  it("mixed facts fold into exactly the right buckets, unsealed facts never counted", () => {
    const reProvenWitness = { slot: "dependency" as const, target: GREET, scope: "src" }
    const brokenWitness = { slot: "dependency" as const, target: NEVER, scope: "src" }
    const pairs: NodeFactPair[] = [
      { node: node("nk-unsealed"), fact: advisory("nk-unsealed", {}) },
      { node: node("nk-a"), fact: wellFormed("nk-a", reProvenWitness) },
      { node: node("nk-b"), fact: wellFormed("nk-b", brokenWitness) },
      { node: node("nk-c"), fact: advisory("nk-c", { seal: "proven" }) },
    ]
    const report = reverifyStore(pairs, leg, docExists, scopeHasDocs)
    expect(report).toEqual({
      sealedProven: 3,
      reProven: 1,
      broken: 1,
      unverifiable: 1,
      dangling: 0,
      rows: [
        { nodeKey: "nk-a", outcome: "re-proven", reason: expect.stringContaining("PROVEN") },
        { nodeKey: "nk-b", outcome: "broken", reason: expect.stringContaining("did NOT re-prove") },
        { nodeKey: "nk-c", outcome: "unverifiable", reason: expect.stringContaining("no witness was recorded") },
      ],
    })
  })

  it("an EMPTY store folds to the honest all-zero report, never a throw", () => {
    expect(reverifyStore([], leg, docExists, scopeHasDocs)).toEqual({
      sealedProven: 0,
      reProven: 0,
      broken: 0,
      unverifiable: 0,
      dangling: 0,
      rows: [],
    })
  })

  it("A5b — a MIXED store (one proven + one justified): the proven fact re-proves as today, the justified fact is SKIPPED, counts stay honest", () => {
    // The justified fact must NOT inflate any bucket — `sealedProven` (the denominator) counts only the
    // proven fact, and the three outcome counts still sum to it. A justified fact is out of scope exactly
    // like an unsealed one: present in the store, absent from this pass.
    const reProvenWitness = { slot: "dependency" as const, target: GREET, scope: "src" }
    const pairs: NodeFactPair[] = [
      { node: node("nk-a"), fact: wellFormed("nk-a", reProvenWitness) },
      { node: node("nk-just"), fact: justified("nk-just", "greet() throws on empty input — no caller-side guard") },
    ]
    const report = reverifyStore(pairs, leg, docExists, scopeHasDocs)
    expect(report).toEqual({
      sealedProven: 1, // ONLY the proven fact — the justified one is not in the re-proof set
      reProven: 1,
      broken: 0,
      unverifiable: 0, // the justified fact must NOT land here (A5c teeth, at the store level)
      dangling: 0, // and no row was DROPPED for want of bytes — the fourth bucket stays empty here
      rows: [{ nodeKey: "nk-a", outcome: "re-proven", reason: expect.stringContaining("PROVEN") }],
    })
  })
})
