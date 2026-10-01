// @atlas/cli — test/wp-96-identity-scrub.test.ts  (T0 · billy #96-wave Finding 2 — scrub the relation/negation IDENTITY legs)
//
// MEASURE-FIRST FINDING this suite pins: `decideStaging` scrubbed ONLY the advisory `claimNorm` (#207) and the
// predicate `check` (#219) before `id(f)`. The two NEW families the #96 wave lit up fell through UNSCRUBBED —
// a RELATION's `endpointA`/`endpointB` and a NEGATION's `target`/`scope` reached the durable staging CAS raw
// (`puts.push(f)` → `store.get(contentHash)`), the exact #207/#219 leak class on two more legs.
//
// UNLIKE the advisory `claimNorm` (body-wording only), these fields feed the IDENTITY KEY — `endpointA`/
// `endpointB` fold into `relationKey`, `target`/`scope` into `negationKey` — AND the `primaryAnchor`
// (`endpointA`/`scope`) AND the `claimNorm` set-union element. So this cannot be a CAS-only redaction: a
// scrub-for-storage / raw-for-identity split would re-open the leak on the key leg and relocate two scrub-equal
// facts to different addresses. The fix scrubs each leg ONCE, before `f` is built (`scrubUnit`), so the SAME
// scrubbed bytes feed `id(f)` AND the identity key AND the anchor AND `claimNorm`. This suite pins BOTH
// directions: a secret never reaches CAS raw, and the router-recomputed identity key over the SCRUBBED-twin
// endpoint/target is byte-identical to the row's key (no CAS/identity split).

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { emptyStore, relationKey, negationKey } from "@atlas/knowledge"
import type { RelationNode, NegationNode } from "@atlas/knowledge"
import { createDiskStore } from "@atlas/adapter-io"
import type { CasPath } from "@atlas/adapter-io"
import { asHash, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import { scrub } from "@atlas/persist"
import type { StructRef } from "@atlas/contracts"
import { decideStaging } from "../src/mine-decide.js"
import type { Fact } from "@atlas/genesis"

const dirs: string[] = []
const freshStore = () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-mine-id-scrub-"))
  dirs.push(dir)
  return createDiskStore(dir as unknown as CasPath)
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const SECRET = "ghp_SYNTHETICNOTAREALTOKEN01" // a synthetic GitHub-token SHAPE (redacted by @atlas/persist scrub)
/** The independent oracle — scrub applied the SAME way `scrubUnit` applies it (whole-buffer, UTF-8 round-trip). */
const scrubUnit = (s: string): string => Buffer.from(scrub(Buffer.from(s, "utf8"))).toString("utf8")

// The grounding anchors are CLEAN, DECOUPLED constants — never derived from the (possibly secret-bearing)
// identity fields. THIS FIX scrubs the identity LEGS (`endpointA`/`endpointB`/`target`/`scope`); the grounding
// anchor `qualifiedPath` is a SEPARATE, pre-existing CAS surface (shared with advisory/predicate grounding) that
// billy #96 Finding 2 does NOT scope. Isolating the fixture grounding lets these tests measure exactly the
// identity-leg fix and nothing else. See the framing note in the return card.
const CLEAN_GROUND_A: StructRef = {
  kind: "symbol",
  qualifiedPath: "pkg/a.ts::anchorA",
  subtreeHash: asSubtreeHash("gA"),
}
const CLEAN_GROUND_B: StructRef = {
  kind: "symbol",
  qualifiedPath: "pkg/b.ts::anchorB",
  subtreeHash: asSubtreeHash("gB"),
}
const CLEAN_GROUND_DIR: StructRef = {
  kind: "file",
  qualifiedPath: "pkg/ground",
  subtreeHash: asSubtreeHash("gDir"),
} as unknown as StructRef

const CLEAN_A = "pkg/a.ts::caller"
const relationFact = (endpointA: string, endpointB: string): Fact =>
  ({
    kind: "relation",
    id: asNodeKey("SHOULD-BE-REMINTED"),
    tier: "T2",
    relationKind: "depends-on",
    endpointA,
    endpointB,
    grounding: {
      entries: [
        { anchor: CLEAN_GROUND_A, path: "pkg/a.ts" },
        { anchor: CLEAN_GROUND_B, path: "pkg/b.ts" },
      ],
    },
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
  }) satisfies RelationNode as unknown as Fact

const negationFact = (target: string, scope: string): Fact =>
  ({
    kind: "negation",
    id: asNodeKey("SHOULD-BE-REMINTED"),
    tier: "T2",
    relationKind: "calls",
    target,
    scope,
    grounding: { entries: [{ anchor: CLEAN_GROUND_DIR, path: "pkg/ground" }] },
    edgeModel: "v1",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  }) satisfies NegationNode as unknown as Fact

describe("decideStaging — the mined RELATION endpoints are scrubbed before CAS *and* the relationKey identity (T0, billy #96 F2)", () => {
  it("independent oracle — the fixture really is a credential shape scrub redacts", () => {
    expect(scrubUnit(SECRET)).not.toContain(SECRET)
    expect(scrubUnit(SECRET)).toContain("[REDACTED]")
  })

  it("MEASURE-FIRST: a secret in endpointB does NOT reach CAS — not in `puts`, not in the raw stored bytes", () => {
    const store = freshStore()
    const endpointB = `pkg/b.ts::${SECRET}`
    const dec = decideStaging(emptyStore(), [relationFact(CLEAN_A, endpointB)], new Map())

    expect(JSON.stringify(dec.put)).not.toContain(SECRET) // the CAS batch BEFORE store.put
    for (const o of dec.put!) store.put(o)
    const row = [...dec.next!.current.values()][0]!
    const stored = store.get(asHash(row.contentHash)) as unknown as { endpointA: string; endpointB: string }
    expect(JSON.stringify(stored)).not.toContain(SECRET) // the RAW CAS bytes, read back through the disk store
    expect(stored.endpointB).not.toContain(SECRET)
    expect(stored.endpointB).toContain("[REDACTED]") // redacted at source, record preserved
    expect(stored.endpointA).toBe(CLEAN_A) // the clean leg is UNTOUCHED
  })

  it("IDENTITY-CONSISTENCY: the relationKey/anchor/claimNorm over the SCRUBBED endpoint match the row (no CAS/key split)", () => {
    const endpointB = `pkg/b.ts::${SECRET}`
    const scrubbedB = scrubUnit(endpointB)
    const dec = decideStaging(emptyStore(), [relationFact(CLEAN_A, endpointB)], new Map())
    const row = [...dec.next!.current.values()][0]!
    // the identity key the router mints over the SCRUBBED-twin endpoints is byte-identical to the row's nodeKey…
    expect(row.nodeKey).toBe(relationKey(CLEAN_A, "depends-on", scrubbedB) as unknown as string)
    // …the anchor and the claimNorm set-union element are the SAME scrubbed bytes, and carry no secret.
    expect(row.primaryAnchor).toBe(CLEAN_A)
    expect(row.claims).toEqual([`${CLEAN_A} depends-on ${scrubbedB}`])
    expect(row.claims.join("")).not.toContain(SECRET)
    expect(row.endpointB).toBe(scrubbedB) // the row's endpoint carrier is scrubbed too
  })

  it("a secret in endpointA (the SUBJECT/anchor leg) is scrubbed on the key AND the primaryAnchor", () => {
    const endpointA = `pkg/a.ts::${SECRET}`
    const scrubbedA = scrubUnit(endpointA)
    const dec = decideStaging(emptyStore(), [relationFact(endpointA, "pkg/b.ts::callee")], new Map())
    const row = [...dec.next!.current.values()][0]!
    expect(row.primaryAnchor).toBe(scrubbedA) // the anchor is bound on the SCRUBBED subject
    expect(row.primaryAnchor).not.toContain(SECRET)
    expect(row.nodeKey).toBe(relationKey(scrubbedA, "depends-on", "pkg/b.ts::callee") as unknown as string)
  })
})

describe("decideStaging — the mined NEGATION target/scope are scrubbed before CAS *and* the negationKey identity (T0, billy #96 F2)", () => {
  it("MEASURE-FIRST: a secret in the negation target does NOT reach CAS and IS the same on the negationKey identity", () => {
    const store = freshStore()
    const target = `pkg/x.ts::${SECRET}`
    const scrubbedTarget = scrubUnit(target)
    const dec = decideStaging(emptyStore(), [negationFact(target, "pkg/payments")], new Map())

    expect(JSON.stringify(dec.put)).not.toContain(SECRET)
    for (const o of dec.put!) store.put(o)
    const row = [...dec.next!.current.values()][0]!
    const stored = store.get(asHash(row.contentHash)) as unknown as { target: string; scope: string }
    expect(stored.target).not.toContain(SECRET)
    expect(stored.target).toContain("[REDACTED]")
    // identity leg: the negationKey over the SCRUBBED target is byte-identical to the row's key…
    expect(row.nodeKey).toBe(negationKey("calls", scrubbedTarget, "pkg/payments") as unknown as string)
    // …and the claimNorm set-union element carries the scrubbed target, no secret.
    expect(row.claims).toEqual([`NOT(${scrubbedTarget} calls)@pkg/payments`])
    expect(row.claims.join("")).not.toContain(SECRET)
  })

  it("a secret in the negation SCOPE (identity + anchor leg) is scrubbed on the key, the anchor AND the row scope", () => {
    const scope = `pkg/${SECRET}`
    const scrubbedScope = scrubUnit(scope)
    const dec = decideStaging(emptyStore(), [negationFact("pkg/x.ts::orphan", scope)], new Map())
    const row = [...dec.next!.current.values()][0]!
    expect(row.scope).toBe(scrubbedScope) // the witness/identity scope is scrubbed…
    expect(row.scope).not.toContain(SECRET)
    expect(row.primaryAnchor).toBe(scrubbedScope) // …the anchor binds the scrubbed scope…
    expect(row.nodeKey).toBe(negationKey("calls", "pkg/x.ts::orphan", scrubbedScope) as unknown as string) // …and the key too
  })
})
