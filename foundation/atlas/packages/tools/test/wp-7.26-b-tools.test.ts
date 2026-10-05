// @atlas/tools — test/wp-7.26-b-tools.test.ts   (WP-7.26-b.TOOLS — EPIC-26-b)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the parity/ops facet (EPIC-26-b): CLI≡MCP on ONE
// schema, guidance totality, and the read/advisory-only doctor. Three facets under test, imported DIRECTLY
// from source (the barrel is wired by the lead at SEAL):
//   • ../src/handler.js — the one handler behind every transport + the ONE published schema (SCN-TOOLS-3a-1
//                         / 3b-1 / 4-1)
//   • ../src/query.js   — `atlas-query`, the bounded read surface used as the resolving (ok) leg
//   • ../src/doctor.js  — `atlas doctor`, the read/advisory-only diagnosis (SCN-TOOLS-12a-1 / 12b-1 / 12c-1)
//
// Content-addressing uses the SEALED @atlas/kernel `id` seam (never a hand-rolled digest). Held-out `-2`
// fixtures are NOT transcribed — the GATE runs those. The tri-transport `resolveNode` + the concrete
// cli/mcp transport adapters are EPIC-26-c: TOOLS-3's parity is witnessed here at its mechanism — the ONE
// handler + the ONE schema behind both surfaces (method-tags-tls §INV-TOOLS-3: `both adapters call it`).

import { describe, it, expect } from "vitest"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Hash, NodeKey, StructRef, SubtreeHash } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import { createGovernedStore } from "../src/guard.js"
import { createHandler, GOVERNANCE_SURFACE } from "../src/handler.js"
import type { ToolLeg } from "../src/handler.js"
import type { DriftItem, ToolData } from "../src/types.js"
import { createQuery } from "../src/query.js"
import type { QueryIndex } from "../src/query.js"
import { createDoctor, DOCTOR_GUIDANCE } from "../src/doctor.js"
import type { DoctorSource } from "../src/doctor.js"

// ── shared fixtures ──────────────────────────────────────────────────────────────────────────────

/** A GROUNDED store row — exactly what `atlas-emit`'s content-addressed path produces: key == id(value). */
const grounded = (value: unknown): { key: string; value: unknown } => ({
  key: id(value as CasObject),
  value,
})

/** The `finance/` index double: resolves a scope through a STRING op (so a non-string scope throws — the
 *  totality boundary the handler catches), returns the covering territory's `tier≥T1` invariant set. */
const financeIndex: QueryIndex = {
  cover(scope) {
    const territory = scope.split("/").includes("finance") ? "finance/" : "root/"
    return {
      territory,
      axisHash: "axis-finance-01" as Hash,
      invariants: [
        { nodeId: "claim:acme-arr" as NodeKey, tier: "T1", claim: "ACME ARR 2024 = $4.2M", freshness: "FRESH" },
        { nodeId: "claim:acme-ceo" as NodeKey, tier: "T0", claim: "ACME CEO = Jane Roe", freshness: "FRESH" },
        // a T2 (below-T1) node the read surface MUST bound out of the pack:
        { nodeId: "note:desk-layout" as NodeKey, tier: "T2", claim: "finance desk is on floor 3", freshness: "FRESH" },
      ],
      stale: false,
    }
  },
}

const q = createQuery(financeIndex)
const queryLeg: ToolLeg = (args) => q.query((args as { scope: string }).scope) as unknown as ToolData

// ── REQ-TOOLS-3 — CLI ≡ MCP on one schema ──────────────────────────────────────────────────────────

describe("WP-7.26-b.TOOLS — CLI ≡ MCP against the one published schema", () => {
  it("SCN-TOOLS-3a-1: one input, two transports → byte-identical result over the one handler", () => {
    const handler = createHandler({ "atlas-query": queryLeg })
    const x = { scope: "src/finance/arr.rs" } // valid under the one published schema

    // both transport surfaces are backed by the ONE handler (method-tags-tls §INV-TOOLS-3).
    const cli = (input: unknown) => handler.handle("atlas-query", input)
    const mcp = (input: unknown) => handler.handle("atlas-query", input)

    // the ONE published schema is byte-identical across surfaces (it carries no transport parameter).
    const schema = handler.schema("atlas-query")
    expect(schema.name).toBe("atlas-query")
    expect((schema.inputSchema as { required?: string[] }).required).toContain("scope") // a REAL schema, not {type:'object'}
    expect(JSON.stringify(handler.schema("atlas-query"))).toBe(JSON.stringify(schema)) // stable = one schema

    // teeth (breaks-on "the MCP adapter wraps the result in `{mcp:{…}}` / re-serializes"): cli(x) ≡ mcp(x).
    expect(cli(x).ok).toBe(true)
    expect(JSON.stringify(mcp(x))).toBe(JSON.stringify(cli(x)))
  })

  it("SCN-TOOLS-3b-1: a malformed input rejects identically on both transports — no divergence", () => {
    const handler = createHandler({ "atlas-query": queryLeg })
    const x = { scope: 42 } // a number where a path string is required

    const cli = handler.handle("atlas-query", x)
    const mcp = handler.handle("atlas-query", x)

    // teeth (breaks-on "the MCP adapter coerces 42→\"42\" and accepts while the CLI rejects"): same reject.
    expect(cli.ok).toBe(false)
    expect(cli.rejected).toBeTruthy()
    expect(JSON.stringify(mcp)).toBe(JSON.stringify(cli)) // the two transports do not diverge
  })
})

// ── REQ-TOOLS-4 — every result carries guidance ─────────────────────────────────────────────────────

describe("WP-7.26-b.TOOLS — guidance rides every result", () => {
  it("SCN-TOOLS-4-1: both the ok (query) and the rejected (emit) path carry non-empty guidance", () => {
    // an atlas-emit that REJECTS N1′ — the node does not re-derive at source@sha (fail-closed).
    const emitRejectLeg: ToolLeg = () => {
      throw new Error('N1′ ("$9.9M") does not re-derive at reference/finance.md@a1b2c3')
    }
    const handler = createHandler({ "atlas-query": queryLeg, "atlas-emit": emitRejectLeg })

    const okResult = handler.handle("atlas-query", { scope: "src/finance/arr.rs" }) // resolves (ok)
    const rejResult = handler.handle("atlas-emit", { node: {}, at: "a1b2c3" }) // rejects (rejected)

    // teeth (breaks-on "the rejected path ships `guidance:{}`"): guidance non-empty on BOTH paths.
    // `okResult.guidance` IS the SHIPPED atlas-query envelope — handler.handle() -> guidanceFor('atlas-query')
    // -> the GUIDANCE['atlas-query'] row in handler.ts. This doubles as the INV-TOOLS-4 witness for the
    // query surface: it goes RED if that row's `next`/`invariant` is ever blanked (proven at the gate; see
    // wp-fix-query-guidance.md). Previously this scenario ALSO asserted the same shape against a second,
    // hand-maintained `QUERY_GUIDANCE` constant in query.ts that no production path read — a duplicate
    // witness that could drift from the shipped row and never notice. Deleted with the constant (#180).
    expect(okResult.ok).toBe(true)
    expect(okResult.guidance.next).not.toBe("")
    expect(okResult.guidance.invariant).not.toBe("")

    expect(rejResult.ok).toBe(false)
    expect(rejResult.rejected).toBeTruthy()
    expect(rejResult.guidance.next).not.toBe("") // emptyGuidance == 0
    expect(rejResult.guidance.invariant).not.toBe("")

    // `atlas-doctor`'s own guidance envelope is likewise non-empty. `DOCTOR_GUIDANCE` stays: unlike
    // `QUERY_GUIDANCE`, it has a REAL production caller (cli/src/doctor.ts renders it on the CLI door), so
    // this is not the same shape and is not touched by #180's rule.
    expect(DOCTOR_GUIDANCE.next).not.toBe("")
    expect(DOCTOR_GUIDANCE.invariant).not.toBe("")
  })
})

// ── REQ-TOOLS-12 — read/advisory-only doctor ────────────────────────────────────────────────────────

/** A read-only diagnostic source over a governed store: every leg READS, none writes. `plan` templates a
 *  candidate the governed atlas-emit write door later consumes — doctor never persists it. */
const anchor = (h: string): StructRef => ({
  kind: "block",
  qualifiedPath: "src/finance/arr.rs#claim",
  subtreeHash: h as SubtreeHash,
})

const drift = (fact: string): DriftItem => ({
  fact,
  class: "mechanical",
  anchorWas: anchor("a1b2c3"),
  anchorNow: anchor("d4e5f6"),
})

// a templated candidate fact the plan funnels through atlas-emit — doctor only PROPOSES it.
const planFact = {
  kind: "advisory",
  id: "claim:acme-arr" as NodeKey,
  tier: "T1",
  claimNorm: "ACME ARR 2024 = $4.2M",
  authoring: "ADVISORY",
} as unknown as GroundedFact

const readOnlySource = (store: ReturnType<typeof createGovernedStore>, key: string): DoctorSource => ({
  lineage: () => (store.read(key) ? [key as Hash] : []), // read-only browse of the CAS supersede chain
  drift: (fact) => drift(fact),
  hotSetSize: () => (store.read(key) ? 1 : 0),
  casAudit: () => ({ objects: 0, corrupt: [], unreadable: [], missing: [], orphan: 0, referenced: 0, sound: true }),
  plan: (fact) => ({ action: "reground", emit: planFact }),
})

describe("WP-7.26-b.TOOLS — atlas doctor is read/advisory only", () => {
  it("SCN-TOOLS-12a-1: every doctor sub-command leaves the store byte-identical (directStoreMutations==0)", () => {
    const medium = new Map<string, { key: string; value: unknown }>()
    const store = createGovernedStore(medium)
    const g1 = grounded({ kind: "claim", claim: "ACME ARR 2024 = $4.2M" })
    store.write(g1)
    const doctor = createDoctor(readOnlySource(store, g1.key))

    const before = JSON.stringify([...medium.entries()])
    doctor.archive("finance/")
    expect(JSON.stringify([...medium.entries()])).toBe(before) // archive: read-only
    doctor.whyBroken("dm")
    expect(JSON.stringify([...medium.entries()])).toBe(before) // why-broken: read-only
    doctor.hotSet(10)
    // teeth (breaks-on "a doctor sub-command mutates the store directly"): store bytes never change.
    expect(JSON.stringify([...medium.entries()])).toBe(before) // hot-set: read-only
  })

  it("SCN-TOOLS-12b-1: a doctor-proposed write funnels through atlas-emit — doctor persists nothing", () => {
    const medium = new Map<string, { key: string; value: unknown }>()
    const store = createGovernedStore(medium)
    const g1 = grounded({ kind: "claim", claim: "ACME ARR 2024 = $4.2M" })
    store.write(g1)
    const doctor = createDoctor(readOnlySource(store, g1.key))

    const before = JSON.stringify([...medium.entries()])
    const out = doctor.reground("dm") // proposes a write for the mechanical anchor-move dm

    // it returns a RegroundPlan (the store mutates ONLY when that plan runs through atlas-emit)…
    expect(out.plan).toBeDefined()
    expect(out.plan?.fact).toBe("dm")
    expect(out.plan?.action).toBe("reground")
    expect(out.plan?.emit).toBeDefined() // the templated candidate the governed atlas-emit write door consumes
    // teeth (breaks-on "doctor persists its proposed write directly"): the store is byte-identical.
    expect(JSON.stringify([...medium.entries()])).toBe(before)
  })

  it("SCN-TOOLS-12c-1: doctor is a diagnostic view, not a governance tool — no write authority", () => {
    const medium = new Map<string, { key: string; value: unknown }>()
    const store = createGovernedStore(medium)
    const g1 = grounded({ kind: "claim", claim: "ACME ARR 2024 = $4.2M" })
    store.write(g1)
    const doctor = createDoctor(readOnlySource(store, g1.key))

    // the governance surface is the six governed tools (WP-SAMEAS + WP-11.W8) with `atlas doctor`
    // co-present as a READ-ONLY projection — doctor is NEVER a registered governance tool.
    expect(GOVERNANCE_SURFACE.length).toBe(6)
    expect(GOVERNANCE_SURFACE).not.toContain("atlas-doctor")

    // teeth (breaks-on "doctor is registered as a governance tool with a write method"): NO store-mutating method.
    const handle = doctor as unknown as Record<string, unknown>
    expect(handle.write).toBeUndefined()
    expect(handle.set).toBeUndefined()
    expect(handle.put).toBeUndefined()
    expect(handle.persist).toBeUndefined()
    expect(handle.emit).toBeUndefined()
  })
})
