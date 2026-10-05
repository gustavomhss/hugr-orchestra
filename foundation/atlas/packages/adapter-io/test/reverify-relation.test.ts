// @atlas/adapter-io — test/reverify-relation.test.ts  (REVERIFY-GATE, RELATION family — #99 sound relation, WP-R5)
//
// The read-side half of the D-d two-layer forgery defense. `reverifyFact`/`reverifyRelation` re-prove a
// `seal:'proven'` RELATION's OWN `RelationWitness` against the REAL oracle (`createVerifyFactLeg` — the SAME
// production feed `atlas verify-fact` drives, routed through the `kind:'relation'` arm → `verifyRelation`, NOT
// `verifyDependency`). This CLOSES the #240 trap for the relation family: before WP-R5 a proven relation had no
// witnessed slot and was dumped to `unverifiable`; now it is REPLAYED.
//
// FIXTURE DISCIPLINE (mirrors reverify-store.test.ts): the scip fixture is the same shape verify-fact-source
// uses — GREET is DEFINED in `src/def.ts` and REFERENCED from `src/a.ts`, a witnessed cross-unit edge under
// `src`. A proven `depends-on` relation A(`src/a.ts`) → B(`src/def.ts`) over that edge re-derives; NEVER
// (defined, referenced nowhere) is the drift case; a dangling endpoint file is the AR-25 case.

import { describe, it, expect } from "vitest"
import type { ScipOutput } from "@atlas/index"
import type { CurrentNode, GroundedFact, RelationNode } from "@atlas/knowledge"
import { asNodeKey } from "@atlas/kernel"
import { createVerifyFactLeg } from "../src/verify-fact-source.js"
import { reverifyFact, reverifyStore } from "../src/reverify-store.js"
import type { NodeFactPair } from "../src/reverify-store.js"

const GREET = "scip-ts npm fixture 1.0.0 `greet`()." // defined in src/def.ts, referenced from src/a.ts
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
const docExists = (p: string): boolean => scip.documents.some((d) => d.relativePath === p)
const scopeHasDocs = (): boolean => true // #240 follow-up: relation/predicate tests never exercise negation scope

/** A `CurrentNode` fixture — the relation reverify path does NOT read `primaryAnchor` (it binds on the fact's
 *  own `endpointA`/`endpointB`), so `node` is carried only to satisfy `reverifyFact`'s signature. */
function node(id: string): CurrentNode {
  return {
    nodeKey: `hash-${id}`,
    family: "relation",
    contentHash: `content-${id}`,
    claims: [],
    primaryAnchor: "src/a.ts",
  }
}

/** A minimal `RelationNode`. Only the fields `reverifyRelation` reads are load-bearing; endpointA (`src/a.ts`)
 *  sits directly under sourceScope `src` and endpointB (`src/def.ts`) is the defining unit — both REAL docs. */
function relation(id: string, extra: Partial<RelationNode>): GroundedFact {
  return {
    kind: "relation",
    id: asNodeKey(id),
    tier: "T2",
    relationKind: "depends-on",
    endpointA: "src/a.ts",
    endpointB: "src/def.ts",
    grounding: { entries: [] },
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
    ...extra,
  } as unknown as GroundedFact
}

/** A well-formed proven `depends-on` relation over the given witness — the baseline each TAMPER test mutates
 *  exactly ONE field away from. */
function wellFormed(
  id: string,
  witness: { relationKind: "depends-on" | "calls"; target: string; sourceScope: string },
): GroundedFact {
  return relation(id, { seal: "proven", tier: "T2", witness })
}

const OK_WITNESS = { relationKind: "depends-on" as const, target: GREET, sourceScope: "src" }

describe("reverifyRelation — one proven depends-on relation against the real oracle (#99 WP-R5)", () => {
  // ── AR-8 — a stored proven `depends-on` relation re-derives from the CURRENT index → `re-proven`. ──────────
  it("AR-8 — a proven depends-on relation whose edge still exists replays PROVEN → re-proven", () => {
    const fact = wellFormed("rel-ar8", OK_WITNESS)
    const row = reverifyFact(node("rel-ar8"), fact, leg, docExists, scopeHasDocs)
    // TEETH: before WP-R5 a proven relation had no witnessed slot and landed `unverifiable` (#240 trap).
    expect(row).toEqual({ nodeKey: "rel-ar8", outcome: "re-proven", reason: expect.stringContaining("PROVEN") })
  })

  // ── AR-9 — the witnessed edge disappears (symbol removed/renamed so verifyRelation no longer proves) →
  //    `broken`, NOT falsely re-proven. NEVER is defined but referenced nowhere ⇒ no caller in scope. ────────
  it("AR-9 — when the witnessed edge no longer proves (no caller under scope) → broken, never a false re-prove", () => {
    const fact = wellFormed("rel-ar9", { relationKind: "depends-on", target: NEVER, sourceScope: "src" })
    const row = reverifyFact(node("rel-ar9"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken") // reached the oracle (endpoints exist) and the oracle abstained
    expect(row?.reason).toContain("did NOT re-prove")
    expect(row?.outcome).not.toBe("re-proven")
  })

  // ── AR-25 — an endpoint's file/unit is removed (docExists false for endpointA OR endpointB) →
  //    broken/unverifiable, and NO crash on a dangling endpoint. ─────────────────────────────────────────────
  it("AR-25 — a dangling endpointB (its file removed from the index) → broken (TAMPERED), no crash", () => {
    const fact = relation("rel-ar25b", { seal: "proven", tier: "T2", witness: OK_WITNESS, endpointB: "src/GONE.ts" })
    let row: ReturnType<typeof reverifyFact>
    expect(() => {
      row = reverifyFact(node("rel-ar25b"), fact, leg, docExists, scopeHasDocs)
    }).not.toThrow()
    expect(row!.outcome).toBe("broken") // Finding 2 — a tamper is `broken` (predicate-path aligned), not `unverifiable`
    expect(row!.reason).toContain("TAMPERED")
    expect(row!.reason).toContain("does not name a document")
  })

  it("AR-25 — a dangling endpointA (unitScopeOf still matches, but its file is gone) → broken (TAMPERED), no crash", () => {
    // endpointA `src/gone/a.ts` → unitScopeOf = `src/gone`, so we align sourceScope to it to isolate the
    // docExists failure from the (b) scope binding — the ONLY reason it drops must be the missing file.
    const fact = relation("rel-ar25a", {
      seal: "proven",
      tier: "T2",
      endpointA: "src/gone/a.ts",
      witness: { relationKind: "depends-on", target: GREET, sourceScope: "src/gone" },
    })
    let row: ReturnType<typeof reverifyFact>
    expect(() => {
      row = reverifyFact(node("rel-ar25a"), fact, leg, docExists, scopeHasDocs)
    }).not.toThrow()
    expect(row!.outcome).toBe("broken")
    expect(row!.reason).toContain("TAMPERED")
    expect(row!.reason).toContain("does not name a document")
  })
})

// ── AR-10 — the content-forgery half of D-d: a `proven`-sealed relation with a missing/forged witness,
//    mismatched anchor/scope, or wrong tier → `unverifiable` (never silently passed). The write door only
//    stripped SHAPE forgeries; a shape-valid-but-false witness reaches here and is caught by re-running the
//    oracle + the endpoint tamper bindings. Each test mutates the well-formed baseline by ONE field only. ─────
describe("reverifyRelation — AR-10 TAMPER BINDINGS: forged witness / anchor / tier is unverifiable, never served", () => {
  it("the well-formed baseline really does re-prove (sanity — the mutations below are the ONLY change)", () => {
    expect(
      reverifyFact(node("rel-base"), wellFormed("rel-base", OK_WITNESS), leg, docExists, scopeHasDocs)?.outcome,
    ).toBe("re-proven")
  })

  it("MISSING WITNESS — seal:proven relation with NO witness recorded → unverifiable (the trust-me shape)", () => {
    const fact = relation("rel-nowit", { seal: "proven" })
    const row = reverifyFact(node("rel-nowit"), fact, leg, docExists, scopeHasDocs)
    expect(row).toEqual({
      nodeKey: "rel-nowit",
      outcome: "unverifiable",
      reason: expect.stringContaining("no witness was recorded"),
    })
  })

  it("INCOMPLETE WITNESS — an empty target is never replayed → unverifiable", () => {
    const fact = relation("rel-empty", {
      seal: "proven",
      witness: { relationKind: "depends-on", target: "", sourceScope: "src" },
    })
    expect(reverifyFact(node("rel-empty"), fact, leg, docExists, scopeHasDocs)?.outcome).toBe("unverifiable")
  })

  it("INCOMPLETE WITNESS — an empty sourceScope is never replayed → unverifiable", () => {
    const fact = relation("rel-empscope", {
      seal: "proven",
      witness: { relationKind: "depends-on", target: GREET, sourceScope: "" },
    })
    expect(reverifyFact(node("rel-empscope"), fact, leg, docExists, scopeHasDocs)?.outcome).toBe("unverifiable")
  })

  it("WRONG TIER — a committer-chosen tier (T0) over the same true witness is TAMPERED → broken", () => {
    const fact = relation("rel-tier", { seal: "proven", tier: "T0", witness: OK_WITNESS })
    const row = reverifyFact(node("rel-tier"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken") // Finding 2 — tamper aligned to the predicate path's `broken`
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("tier")
  })

  it("MISMATCHED ANCHOR SCOPE — endpointA does NOT sit directly under the witness sourceScope → broken (TAMPERED)", () => {
    // endpointA `src/deep/a.ts` → unitScopeOf = `src/deep`, but the witness ranges over `src` — the relation is
    // not about the edge its witness proves. (The widening attack: any real edge under `src` is trivially also
    // "under" a deeper anchor; the equality binding closes it.)
    const fact = relation("rel-anchor", { seal: "proven", endpointA: "src/deep/a.ts", witness: OK_WITNESS })
    const row = reverifyFact(node("rel-anchor"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("TAMPERED")
    expect(row?.reason).toContain("sourceScope")
  })

  // ── SOUNDNESS TEETH (cold-review Finding 1) — a forged endpoint PAIR that survives the SHAPE checks above must
  //    FAIL the oracle replay. Before the endpoint-binding fix these read `re-proven` (a wrong-but-existing
  //    definer / a same-directory non-referrer rode a DIFFERENT true edge under `src`). Now → `broken`. ─────────
  it("FORGED endpointB — a wrong-but-EXISTING file (not the definer of the target) → broken, never re-proven", () => {
    // endpointA `src/a.ts` IS a real referrer of GREET; endpointB `src/a.ts` EXISTS but is NOT `definesAt(GREET)`
    // (that is `src/def.ts`). The old directory-scoped oracle re-proved (some file under `src` references GREET);
    // the endpointB definer bind refuses it.
    const fact = relation("rel-forgeB", {
      seal: "proven",
      tier: "T2",
      endpointA: "src/a.ts",
      endpointB: "src/a.ts",
      witness: OK_WITNESS,
    })
    const row = reverifyFact(node("rel-forgeB"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.outcome).not.toBe("re-proven")
    expect(row?.reason).toContain("did NOT re-prove")
    expect(row?.reason).toContain("endpointB-not-the-definer")
  })

  it("FORGED endpointA — a same-directory file that references NOTHING → broken, never re-proven", () => {
    // endpointA `src/def.ts` sits under `src` (so the scope tamper binding passes) and EXISTS, but it references
    // NOTHING — only `src/a.ts` references GREET. The old oracle re-proved (SOME file under `src` references
    // GREET); the endpointA referrer bind refuses this forged pair. endpointB stays the true definer to isolate A.
    const fact = relation("rel-forgeA", {
      seal: "proven",
      tier: "T2",
      endpointA: "src/def.ts",
      endpointB: "src/def.ts",
      witness: OK_WITNESS,
    })
    const row = reverifyFact(node("rel-forgeA"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.outcome).not.toBe("re-proven")
    expect(row?.reason).toContain("did NOT re-prove")
    expect(row?.reason).toContain("endpointA-not-a-referrer")
  })

  it("FORGED calls WITNESS — a shape-valid depends-on triple relabeled calls does not re-prove (oracle abstains) → broken", () => {
    // A `calls` witness is not mechanically provable (verifyRelation abstains on any non-depends-on kind, AR-5).
    // Even riding a genuinely-referenced target, replaying the oracle refuses to re-prove it — so it is never
    // served as a proven relation.
    const fact = wellFormed("rel-calls", { relationKind: "calls", target: GREET, sourceScope: "src" })
    const row = reverifyFact(node("rel-calls"), fact, leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toContain("did NOT re-prove")
  })
})

describe("reverifyStore — relations fold into the same three buckets alongside predicates", () => {
  it("a mixed store of proven relations folds into re-proven/broken/unverifiable, summing to the denominator", () => {
    const pairs: NodeFactPair[] = [
      { node: node("r-ok"), fact: wellFormed("r-ok", OK_WITNESS) },
      {
        node: node("r-drift"),
        fact: wellFormed("r-drift", { relationKind: "depends-on", target: NEVER, sourceScope: "src" }),
      },
      { node: node("r-nowit"), fact: relation("r-nowit", { seal: "proven" }) },
      { node: node("r-unsealed"), fact: relation("r-unsealed", {}) }, // no seal ⇒ out of scope, never counted
    ]
    const report = reverifyStore(pairs, leg, docExists, scopeHasDocs)
    expect(report).toEqual({
      sealedProven: 3,
      reProven: 1,
      broken: 1,
      unverifiable: 1,
      dangling: 0, // every pair RESOLVED here — no row was dropped for want of bytes
      rows: [
        { nodeKey: "r-ok", outcome: "re-proven", reason: expect.stringContaining("PROVEN") },
        { nodeKey: "r-drift", outcome: "broken", reason: expect.stringContaining("did NOT re-prove") },
        { nodeKey: "r-nowit", outcome: "unverifiable", reason: expect.stringContaining("no witness was recorded") },
      ],
    })
  })
})
