// @atlas/adapter-io — test/reverify-negation.test.ts  (REVERIFY-GATE, NEGATION family — #240)
//
// Closes the #240 trap: a `seal:'proven'` NEGATION used to fall through to the predicate witness path,
// find no `AdvisoryNode.witness`, and be dumped to `unverifiable` — a proven negation was PERMANENTLY
// unverifiable by `atlas verify-store`. Now `reverifyFact` routes `kind:'negation'` to `reverifyNegation`,
// which re-runs the REAL `verifyNegation` oracle (`createVerifyFactLeg` → the `kind:'negation'` arm) over the
// LIVE index. The negation's identity legs `(target, scope)` ARE the whole `NegationClaim`, so there is no
// witness and no anchor binding — only a TIER tamper check + the closed-world replay.
//
// FIXTURE (mirrors reverify-relation.test.ts / verify-fact-source): GREET is DEFINED in src/def.ts and
// REFERENCED from src/a.ts (a witnessed caller under `src`); NEVER is DEFINED but referenced nowhere. So a
// negation "no caller of NEVER under src" re-proves (hole-free scope, no caller); "no caller of GREET under
// src" is REFUTED (src/a.ts is a counterexample) ⇒ broken; a PHANTOM target abstains ⇒ broken.

import { describe, it, expect } from "vitest"
import type { ScipOutput } from "@atlas/index"
import type { CurrentNode, GroundedFact, NegationNode } from "@atlas/knowledge"
import { asNodeKey } from "@atlas/kernel"
import { createVerifyFactLeg } from "../src/verify-fact-source.js"
import { reverifyFact } from "../src/reverify-store.js"

const GREET = "scip-ts npm fixture 1.0.0 `greet`()." // defined in src/def.ts, referenced from src/a.ts
const NEVER = "scip-ts npm fixture 1.0.0 `never`()." // defined in src/def.ts, referenced nowhere
const PHANTOM = "scip-ts npm fixture 1.0.0 `phantom`()." // never defined in the index

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
// #240 follow-up: does the live fixture index contain any document under directory `scope`? (segment-prefix)
const scopeHasDocs = (scope: string): boolean =>
  scip.documents.some((d) => {
    const a = d.relativePath.split("/")
    const s = scope.split("/")
    return s.every((seg, i) => a[i] === seg)
  })

/** A `CurrentNode` fixture — `reverifyNegation` never reads `primaryAnchor` (a negation routes by
 *  `negationKey`, and its claim IS its identity), so `node` only satisfies `reverifyFact`'s signature. */
function node(id: string): CurrentNode {
  return { nodeKey: `hash-${id}`, family: "negation", contentHash: `content-${id}`, claims: [], primaryAnchor: "src" }
}

function negation(id: string, extra: Partial<NegationNode>): GroundedFact {
  return {
    kind: "negation",
    id: asNodeKey(id),
    tier: "T2",
    relationKind: "depends-on",
    target: NEVER,
    scope: "src",
    grounding: { entries: [] },
    edgeModel: "scip-typescript@1",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
    seal: "proven",
    ...extra,
  } as unknown as GroundedFact
}

describe("#240 — reverify a seal:proven NEGATION (close the unverifiable trap)", () => {
  it("re-proves a still-true negation — no caller of NEVER under src, scope hole-free", () => {
    const row = reverifyFact(node("n1"), negation("n1", {}), leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("re-proven")
  })

  it("TEETH — the proven negation is NO LONGER dumped to `unverifiable` (the #240 trap)", () => {
    // Before the fix, ANY proven negation fell to the predicate path and returned `unverifiable` for want of
    // a witnessed slot. The re-proven verdict above (not `unverifiable`) is exactly what closes the trap.
    const row = reverifyFact(node("n1"), negation("n1", {}), leg, docExists, scopeHasDocs)
    expect(row?.outcome).not.toBe("unverifiable")
  })

  it("broken — a scope with NO documents in the live index (deleted/fabricated) is NOT re-proven vacuously (#240 follow-up)", () => {
    // `verifyNegation` over an empty scope proves vacuously (no callers, no holes ⇒ proven); the scope-exists
    // gate refuses it as `broken` instead — mirroring the write door's `scope-empty` and the relation `docExists`.
    const row = reverifyFact(node("ng"), negation("ng", { scope: "gone" }), leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toMatch(/no longer names a directory/)
  })

  it("broken — a counterexample caller APPEARED: GREET is referenced under src ⇒ refuted", () => {
    const row = reverifyFact(node("n2"), negation("n2", { target: GREET }), leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toMatch(/did NOT re-prove/)
  })

  it("broken — a PHANTOM target (never defined in the index) abstains ⇒ not re-provable", () => {
    const row = reverifyFact(node("n3"), negation("n3", { target: PHANTOM }), leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
  })

  it("unverifiable — an incomplete identity (empty target/scope) has nothing to replay", () => {
    expect(reverifyFact(node("n4"), negation("n4", { target: "" }), leg, docExists, scopeHasDocs)?.outcome).toBe(
      "unverifiable",
    )
    expect(reverifyFact(node("n5"), negation("n5", { scope: "" }), leg, docExists, scopeHasDocs)?.outcome).toBe(
      "unverifiable",
    )
  })

  it("broken TAMPERED — a proven seal on a non-mined tier was chosen by a committer, not proven", () => {
    const row = reverifyFact(node("n6"), negation("n6", { tier: "T0" }), leg, docExists, scopeHasDocs)
    expect(row?.outcome).toBe("broken")
    expect(row?.reason).toMatch(/TAMPERED/)
  })

  it("seal gate — an UNSEALED or justified negation is out of scope (undefined, never a bucket)", () => {
    const proven = negation("n7", {}) as unknown as Record<string, unknown>
    const { seal: _drop, ...unsealed } = proven // omit `seal` entirely (exactOptionalPropertyTypes)
    expect(reverifyFact(node("n7"), unsealed as unknown as GroundedFact, leg, docExists, scopeHasDocs)).toBeUndefined()
    expect(
      reverifyFact(node("n8"), negation("n8", { seal: "justified" }), leg, docExists, scopeHasDocs),
    ).toBeUndefined()
  })
})
