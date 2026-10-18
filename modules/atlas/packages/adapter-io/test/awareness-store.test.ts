// @atlas/adapter-io — test/awareness-store.test.ts  (CAMPAIGN-11 W7a — the durable Awareness slab)
//
// The acceptance items this file owns: A13 (assembled from the REAL root: seeded facets carry grounding +
// are drift-checked, absent facets render a labeled UN-SEEDED, the slab holds under its `~400 tok` cap),
// A13b (byte-identical for two INDEPENDENT callers), A27 (a root bump that moved no facet costs 0 re-rolls
// / 0 drift-checks, via the instrumented `AssemblyReceipt`, never timing).
//
// Every fixture here is REAL bytes on a REAL filesystem: `CONVENTIONS.md` is an actual file write, and the
// T0 rows come from the REAL `@atlas/knowledge` `upsert` persisted through the REAL `createDiskStore` — the
// same durable sidecar every governed door writes. A13's weak form ("an absent facet renders UN-SEEDED")
// passes with zero work because `unseeded()` already does that inside `@atlas/memory`; every test below
// therefore asserts over the COMPOSED slab with at least one SEEDED facet present, never that alone.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { WriteRequest } from "@atlas/knowledge"
import { awarenessTokens, AWARENESS_TOK_CAP, makeAwarenessMemo, pullTail } from "@atlas/memory"
import { createDiskStore } from "../src/store.js"
import { createAwarenessStore, realAtlasRoot } from "../src/awareness-store.js"

let repo: string

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-awarestore-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

/** Write one T0 row through the REAL knowledge `upsert`, persisted through the REAL durable sidecar —
 *  never a hand-built `CurrentNode`. */
function ratifyT0(nodeKey: string, claimNorm: string): void {
  const req: WriteRequest = {
    nodeKey,
    contentHash: id({ nodeKey, claimNorm }),
    family: "advisory",
    claimNorm,
    tier: "T0",
  }
  const dir = join(repo, ".atlas", "cas")
  const store = createDiskStore(dir)
  const before = store.loadProjection() ?? emptyStore()
  const { store: next } = upsert(before, req)
  store.persistProjection(next)
}

function writeConventions(text: string): void {
  writeFileSync(join(repo, "CONVENTIONS.md"), text, "utf8")
}

describe("A13 — the slab is assembled from the REAL root", () => {
  it("a seeded taste facet carries real grounding and the seeded state", () => {
    writeConventions("# Conventions\nno emojis.\n")
    const a = createAwarenessStore(repo).read()
    expect(a.taste.state).toBe("seeded")
    expect(a.taste.grounding.length).toBeGreaterThan(0)
    expect(a.taste.grounding[0]!.qualifiedPath).toBe("CONVENTIONS.md")
    expect(a.taste.content).toContain("CONVENTIONS.md")
  })

  it("a seeded constitution facet carries the REAL ratified T0 claims, in a stable order", () => {
    writeConventions("# Conventions\n")
    // inserted z-before-a so a passing order assertion proves the store SORTS, not "happens to match".
    ratifyT0("claim:zzz", "zzz must never regress")
    ratifyT0("claim:aaa", "aaa is the anchor invariant")
    const a = createAwarenessStore(repo).read()
    expect(a.constitution.state).toBe("seeded")
    expect(a.constitution.grounding.length).toBe(2)
    // tiers[0] (the INJECTED top tier) is the count line; the two real claim texts stay PULL-REACHABLE
    // (MEM-11h) in the tail, nodeKey-sorted (aaa before zzz) — proving the store sorts, not that it
    // "happens to match" insertion order (rows were ratified zzz-then-aaa above).
    expect(a.constitution.content).toBe("constitution: 2 ratified T0 invariant(s)")
    const tail = pullTail(realAtlasRoot(repo), "constitution")
    expect(tail).toEqual(["aaa is the anchor invariant", "zzz must never regress"])
  })

  it("an absent source renders the labeled UN-SEEDED sentinel — asserted ALONGSIDE a real seeded facet", () => {
    writeConventions("# Conventions\n") // taste IS seeded — this is the composed slab, not the bare package
    const a = createAwarenessStore(repo).read()
    for (const facet of [a.mission, a.terrain, a.ontology]) {
      expect(facet.state).toBe("UN-SEEDED")
      expect(facet.content).toContain("UN-SEEDED")
      expect(facet.grounding).toEqual([])
    }
    expect(a.taste.state).toBe("seeded") // the contrast that makes the sentinel assertion mean something
  })

  it('a T0 row with NO tier ("T1"/absent) is excluded — constitution stays UN-SEEDED', () => {
    writeConventions("# Conventions\n")
    const req: WriteRequest = {
      nodeKey: "claim:not-t0",
      contentHash: id({ nodeKey: "claim:not-t0" }),
      family: "advisory",
      claimNorm: "not ratified",
      tier: "T2",
    }
    const dir = join(repo, ".atlas", "cas")
    const store = createDiskStore(dir)
    store.persistProjection(upsert(emptyStore(), req).store)
    const a = createAwarenessStore(repo).read()
    expect(a.constitution.state).toBe("UN-SEEDED")
  })

  it("holds under the ~400 tok cap even with several ratified T0 claims present", () => {
    writeConventions("# Conventions\nshort.\n")
    ratifyT0("claim:one", "one")
    ratifyT0("claim:two", "two")
    ratifyT0("claim:three", "three")
    const a = createAwarenessStore(repo).read()
    expect(awarenessTokens(a)).toBeLessThanOrEqual(AWARENESS_TOK_CAP)
  })
})

describe("A13b — the slab is byte-identical for two INDEPENDENT callers (MEM-11)", () => {
  it("two separate store instances over the same repo state produce byte-identical bytes", () => {
    writeConventions("# Conventions\nno purple.\n")
    ratifyT0("claim:one", "invariant one")
    ratifyT0("claim:two", "invariant two")
    // TWO independent callers: two separate `createAwarenessStore` instances, no shared cache.
    const callerA = createAwarenessStore(repo).bytes()
    const callerB = createAwarenessStore(repo).bytes()
    expect(callerA.length).toBeGreaterThan(0)
    expect(Buffer.compare(Buffer.from(callerA), Buffer.from(callerB))).toBe(0)
  })
})

describe("A27 — a root bump that moved no facet costs 0 re-rolls / 0 drift-checks", () => {
  it("the SECOND assemble over a bumped-but-unmoved real root is a pure cache hit", () => {
    writeConventions("# Conventions\nfrugal.\n")
    ratifyT0("claim:one", "invariant one")
    const memo = makeAwarenessMemo()
    const first = memo.assemble(realAtlasRoot(repo))
    expect(first.receipt.reRolls).toBeGreaterThan(0) // the priming call is NOT the thing under test

    const second = memo.assemble(realAtlasRoot(repo, { bump: "unrelated-marker" }))
    // asserted via the INSTRUMENTED counter — never timing.
    expect(second.receipt.reRolls).toBe(0)
    expect(second.receipt.driftChecks).toBe(0)
    expect(second.value).toEqual(first.value) // and the served Awareness did not change either
  })

  it("a root bump that DID move a real facet (CONVENTIONS.md edited) costs a re-roll, served drifted", () => {
    writeConventions("# Conventions\nv1.\n")
    const memo = makeAwarenessMemo()
    const first = memo.assemble(realAtlasRoot(repo))
    expect(first.value.taste.state).toBe("seeded")
    const beforeHash = first.value.taste.grounding[0]!.subtreeHash
    writeConventions("# Conventions\nv2 — a real edit.\n") // the taste SOURCE actually moved
    const second = memo.assemble(realAtlasRoot(repo))
    expect(second.receipt.reRolls).toBeGreaterThan(0)
    expect(second.receipt.driftChecks).toBeGreaterThan(0)
    // moved+flagged, never silently stale (MEM-11) — content string is fixed, the ANCHOR is what moved.
    expect(second.value.taste.state).toBe("drifted")
    expect(second.value.taste.grounding[0]!.subtreeHash).not.toEqual(beforeHash)
  })
})
