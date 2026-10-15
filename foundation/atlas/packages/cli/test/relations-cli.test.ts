// @atlas/cli — test/relations-cli.test.ts  (#99a — the `atlas relations <unit> [out|in|both]` read door)
//
// Two things are under test: the argv→dispatch wiring (does `atlas relations` reach the composition root's
// `relations` leg, or is `relationsOf` a reference model nothing calls — the exact state it shipped in, which
// `npm run reference-model-guard` flagged RED), and the edges a reader gets back. The store here is REAL: a
// `createDiskStore` rooted in a temp dir, and the relation under it is EMITTED THROUGH THE GOVERNED DOOR
// (`createGovernedEmit`) — not hand-written into the projection — so the `endpointA`/`endpointB`/`relationKind`
// carriers `relationsOf` reads are exactly the ones the write door stamps. The truth-gate is the one seam
// held open (every concern here is downstream of it), the same posture the door-regression suites take.

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { asHash, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import { createDiskStore, createGovernedEmit, createRelationLeg } from "@atlas/adapter-io"
import type { RelationLeg } from "@atlas/adapter-io"
import type { GroundedFact, RelationKind } from "@atlas/knowledge"
import type { TruthGate } from "@atlas/tools"
import { main } from "../src/cli.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"
import { parse } from "../src/parse.js"

// ── the real composed store + a relation through the governed door ────────────────────────────────────────
const A = "src/payments/charge.ts::charge" // the SUBJECT (endpointA) — `out` for A, `in` for B
const B = "src/orders/place.ts::place" //     the OBJECT  (endpointB)
const AT = asHash("deadbeef")
const HOLDS: TruthGate = { gateHolds: () => "HOLDS" }

/** A grounded RELATION fact — two endpoints in different files, TWO grounding entries (AND-folded). */
function relationFact(kind: RelationKind = "depends-on" as RelationKind): GroundedFact {
  const entry = (p: string) => ({
    anchor: { kind: "symbol" as const, qualifiedPath: p, subtreeHash: asSubtreeHash("sh-rel") },
    path: "x",
  })
  return {
    kind: "relation",
    id: asNodeKey("gen-1"),
    tier: "T2",
    relationKind: kind,
    endpointA: A,
    endpointB: B,
    grounding: { entries: [entry(A), entry(B)] },
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
    scope: "core",
  } as unknown as GroundedFact
}

/** A fresh on-disk store with ONE relation emitted through the whole governed door, plus its read leg. */
function composedWithRelation(): { relations: RelationLeg; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), "atlas-relations-cli-"))
  const store = createDiskStore(join(root, "cas"))
  const door = createGovernedEmit({
    store,
    gate: HOLDS,
    policy: { t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["bob"] } } },
    actor: "bob",
    ratifyToken: "billy",
  })
  const out = door.emit(relationFact(), AT)
  if (!out.emitted) throw new Error(`fixture relation did not emit: ${out.rejected}`)
  return { relations: createRelationLeg(store), dispose: () => rmSync(root, { recursive: true, force: true }) }
}

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

describe("#99a — `atlas relations` is a real command that reaches a real leg", () => {
  it("parses with ONE required positional + an optional direction, and routes to the READ oracle", () => {
    const p = parse(["relations", A, "out"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("relations")
    expect(p.ok && p.positionals).toEqual([A, "out"])
    expect(COMMANDS).toContain("relations")
    expect(COMMAND_LEG.relations).toBe("atlas-query")
    expect(authorityOf("relations")).toBe("read") // DERIVED from WRITE_PATHS — `relations` writes nothing
  })

  it("OUT — returns the relation where the unit is the SUBJECT, off a governed-door-emitted fact", async () => {
    const { relations, dispose } = composedWithRelation()
    try {
      const code = await main(["relations", A, "out"], { relations })
      expect(code).toBe(0)
      const out = writes.join("")
      expect(out).toContain("status: ok")
      expect(out).toContain(`relations: ${A} out — 1 edge(s)`)
      expect(out).toContain(`relation depends-on ${A} -> ${B} (`) // A→B, kind, and the minted nodeKey
    } finally {
      dispose()
    }
  })

  it("IN — the SAME relation is reached from the OBJECT endpoint; direction filters correctly", async () => {
    const { relations, dispose } = composedWithRelation()
    try {
      const inCode = await main(["relations", B, "in"], { relations })
      expect(inCode).toBe(0)
      expect(writes.join("")).toContain(`relation depends-on ${A} -> ${B} (`)

      // A is the subject, so it has NO `in` edge — an EMPTY result is a measured fact, exit 0, not a miss.
      writes.length = 0
      const emptyCode = await main(["relations", A, "in"], { relations })
      expect(emptyCode).toBe(0)
      expect(writes.join("")).toContain(`relations: ${A} in — 0 edge(s)`)
      expect(writes.join("")).not.toContain(" -> ")
    } finally {
      dispose()
    }
  })

  it("BOTH is the default — an omitted direction reaches the same union `both` selects", async () => {
    const { relations, dispose } = composedWithRelation()
    try {
      await main(["relations", A], { relations }) // no direction ⇒ both
      const defaulted = writes.join("")
      writes.length = 0
      await main(["relations", A, "both"], { relations })
      const explicit = writes.join("")
      expect(defaulted).toBe(explicit) // the default is `both`, byte-for-byte
      expect(defaulted).toContain(`relations: ${A} both — 1 edge(s)`)
    } finally {
      dispose()
    }
  })

  it("FAILS CLOSED when the runtime is not composed — never a silent empty result over nothing", async () => {
    const code = await main(["relations", A], {})
    expect(code).toBe(1) // a wiring error, not a governance refusal
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
    expect(writes.join("")).not.toContain("relations: ")
  })

  it("an out-of-vocabulary direction fails CLOSED with a structured error, never a throw", async () => {
    const { relations, dispose } = composedWithRelation()
    try {
      const code = await main(["relations", A, "sideways"], { relations })
      expect(code).toBe(1)
      expect(writes.join("")).toContain("unknown direction 'sideways'")
    } finally {
      dispose()
    }
  })

  it("a missing unit fails at the parser arity floor, before any leg is reached", async () => {
    let called = 0
    const leg: RelationLeg = () => {
      called++
      return []
    }
    const code = await main(["relations"], { relations: leg })
    expect(code).toBe(1)
    expect(called).toBe(0)
    expect(writes.join("")).toContain("command 'relations' requires 1 positional argument(s), got 0")
  })
})
