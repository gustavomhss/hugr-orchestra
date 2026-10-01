// @atlas/tools — test/wp-7.26-a-tools.test.ts   (WP-7.26-a.TOOLS)
//
// RED→GREEN transcription of the VISIBLE goldens for the single governed write-door + append-only /
// permissioned store integrity (EPIC-26-a). Two facets under test, imported DIRECTLY from source
// (the barrel is wired by the lead at SEAL):
//   • ../src/guard.js     — the store-level single-write-door + read-time content-address integrity
//                           (SCN-TOOLS-1c-1 / 1d-1 / 15a-1 / 15b-1 / 15c-1)
//   • ../src/handler.js    — the pure + total handler wrapper + the five-tool governance surface
//                           (SCN-TOOLS-1a-1 / 1b-1 / 2a-1 / 2b-1)
//
// Content-addressing uses the SEALED @atlas/kernel `id` seam (never a hand-rolled digest): a GROUNDED row
// is one whose key IS `id(value)` — exactly what `atlas-emit` produces. A back-channel / direct / tampered
// row has a key that is NOT `id(value)`, so it is refused at write (append-only/permission) or rejected at
// read (integrity), never served. Held-out `-2` fixtures are NOT transcribed — the GATE runs those.
// FUNCTIONAL refusal only; adversarial exploitability of the door is billy / FR-12 (per card §exclusions).

import { describe, it, expect } from "vitest"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { createGuard, createGovernedStore } from "../src/guard.js"
import { createHandler, GOVERNANCE_SURFACE, WRITE_PATHS } from "../src/handler.js"
import type { ToolLeg } from "../src/handler.js"
import type { ToolData } from "../src/types.js"

/** A GROUNDED store row — exactly what `atlas-emit`'s content-addressed path produces: key == id(value). */
const grounded = (value: unknown): { key: string; value: unknown } => ({
  key: id(value as CasObject),
  value,
})

/** Count of rows in a medium whose bytes were NOT produced by the grounded path (key != id(value)). */
const ungroundedRows = (medium: Map<string, { key: string; value: unknown }>): number =>
  [...medium.values()].filter((r) => {
    try {
      return id(r.value as CasObject) !== r.key
    } catch {
      return true
    }
  }).length

// ── EPIC-26-a §1 — single governed write-door ─────────────────────────────────────────────────────

describe("WP-7.26-a.TOOLS — the governance surface & the single write path", () => {
  it("SCN-TOOLS-1a-1: the surface enumerates to exactly six (WP-SAMEAS + WP-11.W8 added atlas-link/atlas-memory-emit)", () => {
    expect(GOVERNANCE_SURFACE.length).toBe(6) // surface count == 6 (WP-11.W8: atlas-memory-emit is a governed tool)
    expect([...GOVERNANCE_SURFACE].sort()).toEqual([
      "atlas-emit",
      "atlas-init",
      "atlas-link",
      "atlas-memory-emit",
      "atlas-query",
      "atlas-reconcile",
    ])
    // teeth (breaks-on "a seventh governance tool is registered — count == 7"): no unauthorized member exists.
    expect(GOVERNANCE_SURFACE).not.toContain("atlas-delete")
  })

  it("SCN-TOOLS-1b-1: exactly three write entries across the whole layer — writePaths == 3 (WP-SAMEAS + WP-11.W8)", () => {
    expect(WRITE_PATHS.length).toBe(3) // writePaths == 3 (WP-11.W8 added the governed atlas-memory-emit door)
    expect([...WRITE_PATHS].sort()).toEqual(["atlas-emit", "atlas-link", "atlas-memory-emit"]) // the three governed write doors
    // the governed store surfaces exactly one store-mutating door (the write-door atlas-emit routes to).
    const store = createGovernedStore()
    expect(typeof store.write).toBe("function")
  })
})

describe("WP-7.26-a.TOOLS — back-channel / read-projection writes are refused", () => {
  it("SCN-TOOLS-1c-1: a write bypassing atlas-emit cannot land — ungroundedRows == 0", () => {
    const medium = new Map<string, { key: string; value: unknown }>()
    const store = createGovernedStore(medium)
    const rowForN1 = { key: "N1", value: { kind: "claim", claim: "ACME ARR 2024 = $4.2M" } }

    // key 'N1' is NOT id(value) ⇒ a back-channel row that skips atlas-emit's grounded path.
    const verdict = store.write(rowForN1)

    expect(verdict.admitted).toBe(false) // refused at the write-door
    expect(verdict.rejected).toBeTruthy()
    // teeth (breaks-on "the back-channel write lands"): nothing entered the store.
    expect(medium.size).toBe(0)
    expect(ungroundedRows(medium)).toBe(0)
    expect(store.read("N1")).toBeUndefined()
  })

  it("SCN-TOOLS-1d-1: a write via a read projection is refused — the handle opens no write door", () => {
    const store = createGovernedStore()
    const g = grounded({ kind: "claim", claim: "own_finance resolves N1" })
    store.write(g)

    const projection = store.project(g.key) // the RETR-5 / TOOLS-10 node-tool read handle
    expect(projection.read()).toEqual(g) // it resolves the node (read-only)

    // teeth (breaks-on "the handle grows a .write()/.set() method"): it exposes NO store-mutating method.
    const handle = projection as unknown as Record<string, unknown>
    expect(handle.write).toBeUndefined()
    expect(handle.set).toBeUndefined()
    expect(handle.put).toBeUndefined()
  })
})

// ── EPIC-26-a §2 — tools pure and total ───────────────────────────────────────────────────────────

describe("WP-7.26-a.TOOLS — the handler is pure and total", () => {
  it("SCN-TOOLS-2a-1: identical args → identical result, no side effect", () => {
    const scope = "src/finance/arr.rs"
    // a deterministic read leg — no wall-clock, no mutable cache (purity).
    const queryLeg: ToolLeg = (args) => {
      const s = (args as { scope: string }).scope
      return { covered: s, size: s.length } as unknown as ToolData
    }
    const handler = createHandler({ "atlas-query": queryLeg })

    const r1 = handler.handle("atlas-query", { scope })
    const r2 = handler.handle("atlas-query", { scope })

    // teeth (breaks-on "reads wall-clock / a mutable cache ⇒ different second result"): byte-identical.
    expect(r1.ok).toBe(true)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it("SCN-TOOLS-2b-1: a malformed arg yields a structured rejection, never a throw", () => {
    // a realistic leg that does a path op — it THROWS a TypeError on `scope: 42` (number, not a string).
    const queryLeg: ToolLeg = (args) => {
      const s = (args as { scope: string }).scope
      return { covered: s.startsWith("src") } as unknown as ToolData
    }
    const handler = createHandler({ "atlas-query": queryLeg })

    let threw = false
    let verdict
    try {
      verdict = handler.handle("atlas-query", { scope: 42 })
    } catch {
      threw = true
    }

    // teeth (breaks-on "the malformed arg propagates an uncaught TypeError"): no throw, structured verdict.
    expect(threw).toBe(false) // exceptions == 0
    expect(verdict?.ok).toBe(false)
    expect(verdict?.rejected).toBeTruthy()
    expect(verdict?.guidance.next).not.toBe("") // TOOLS-4 — guidance shipped on the reject path too
    expect(verdict?.guidance.invariant).not.toBe("")
  })
})

// ── EPIC-26-a §15 — append-only / permissioned store integrity ─────────────────────────────────────

describe("WP-7.26-a.TOOLS — append-only / permissioned store integrity", () => {
  it("SCN-TOOLS-15a-1: no prior row bytes change on a new write — the medium is append-only", () => {
    const medium = new Map<string, { key: string; value: unknown }>()
    const store = createGovernedStore(medium)

    const g1 = grounded({ kind: "claim", claim: "ACME ARR 2024 = $4.2M" }) // N1
    store.write(g1)
    const n1BytesBefore = JSON.stringify(medium.get(g1.key))

    const g2 = grounded({ kind: "claim", claim: "ACME CEO 2024 = Jane Roe" }) // a DIFFERENT nodeKey
    const wrote = store.write(g2)
    expect(wrote.admitted).toBe(true)

    // no prior row's bytes changed — N1 survives the new write byte-identically.
    expect(JSON.stringify(medium.get(g1.key))).toBe(n1BytesBefore)

    // teeth (breaks-on "an in-place overwrite of an existing row"): a forged same-key/different-bytes
    // write is refused, and N1's bytes still do not change.
    const overwrite = { key: g1.key, value: { kind: "claim", claim: "ACME ARR 2024 = $9.9M" } }
    expect(store.write(overwrite).admitted).toBe(false)
    expect(JSON.stringify(medium.get(g1.key))).toBe(n1BytesBefore)
  })

  it("SCN-TOOLS-15b-1: a read rejects an un-emitted row via the content-address integrity check", () => {
    const medium = new Map<string, { key: string; value: unknown }>()
    const store = createGovernedStore(medium)

    // a row injected DIRECTLY into the medium — bypasses the write-door entirely (a back-channel).
    const injected = { key: "forged-address", value: { kind: "claim", claim: "ungrounded" } }
    medium.set(injected.key, injected)

    // teeth (breaks-on "read serves the directly-injected ungrounded row"): the integrity check rejects it.
    expect(store.read("forged-address")).toBeUndefined() // ungroundedRowsServed == 0
  })

  it("SCN-TOOLS-15c-1: a direct write is refused at write OR rejected at read — never served", () => {
    const medium = new Map<string, { key: string; value: unknown }>()
    const store = createGovernedStore(medium)

    // leg 1 — through the door with a forged key ⇒ cannot land (append-only / permission).
    const viaDoor = store.write({ key: "skip-emit", value: { kind: "claim", claim: "x" } })
    expect(viaDoor.admitted).toBe(false)
    expect(store.read("skip-emit")).toBeUndefined()

    // leg 2 — bypassing the door entirely ⇒ rejected at read (integrity check).
    medium.set("skip-emit-2", { key: "skip-emit-2", value: { kind: "claim", claim: "y" } })
    expect(store.read("skip-emit-2")).toBeUndefined()

    // never surfaces as a served fact either way.
    expect(ungroundedRows(medium)).toBe(1) // the injected leg-2 row sits in the medium…
    // …but the store never serves it — content-address integrity is the read gate.
    expect(store.read("skip-emit-2")).toBeUndefined()
  })
})

// ── the guard verdict itself (the reference-model core the store is built on) ───────────────────────

describe("WP-7.26-a.TOOLS — the guard verdict (single-write-door core)", () => {
  it("admits a grounded row and refuses an ungrounded one, at both write and read", () => {
    const guard = createGuard()
    const g = grounded({ kind: "claim", claim: "grounded fact" })
    const ungrounded = { key: "not-a-content-address", value: { kind: "claim", claim: "grounded fact" } }

    expect(guard.admitOnWrite(g).admitted).toBe(true)
    expect(guard.admitOnRead(g).admitted).toBe(true)
    expect(guard.admitOnWrite(ungrounded).admitted).toBe(false)
    expect(guard.admitOnRead(ungrounded).admitted).toBe(false)
  })
})
