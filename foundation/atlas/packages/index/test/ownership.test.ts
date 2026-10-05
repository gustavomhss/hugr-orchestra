// @atlas/index — test/ownership.test.ts  (WP-2.9-a.INDEX)
//
// RED→GREEN transcription of the VISIBLE ownership goldens SCN-INDEX-15a-1..15e-1 (REQ-INDEX-15a..15e) +
// the governing ∀-law PROP-INDEX-15 (generated + reconciled ownership). Owners are SYMBOLIC ⇒ assertions
// are RELATIONAL: an owner is GENERATED from git-blame majority (15a, the DEFINE-parametric ENABLED case),
// an explicit manifest override BEATS the generated owner (15b), reconciliation is byte-identical + $0-LLM
// (15c, via the kernel canonical seam), `tier` is passed through untouched (15d), and the manifest is NOT
// the sole source — an unlisted territory still gets a generated owner (15e). `git-blame` is a black-box
// fixture signal (BlameEntry), never modeled as ownership ground truth. Held-out `-2` fixtures: GATE only.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { canonicalForm } from "@atlas/kernel"
import type { Manifest, DepEdge } from "@atlas/index"
import type { Territory } from "@atlas/contracts"
import { reconcile, reconcileModelCalls } from "../src/ownership.js"
import type { BlameEntry, OwnerMap } from "../src/ownership.js"

const T = (name: string, owner: string, tier: Territory["tier"], globs: string[]): Territory => ({
  name,
  owner,
  tier,
  globs,
})
const NO_GRAPH: readonly DepEdge[] = []
// serialize the map to a sorted [name, owner] projection through the kernel canonical seam.
const canonMap = (m: OwnerMap): string =>
  new TextDecoder().decode(
    canonicalForm([...m.entries()].map(([t, o]) => [t.name, o]).sort((a, b) => (a[0]! < b[0]! ? -1 : 1))),
  )
const ownerOf = (m: OwnerMap, name: string): string | undefined => [...m.entries()].find(([t]) => t.name === name)?.[1]

describe("INDEX-15 — generated + reconciled ownership (visible goldens)", () => {
  // charlie authored 4/5 (80%) of region core/cas; dana the remaining fifth.
  const casBlame: BlameEntry[] = [
    { path: "core/cas/a.ts", authors: ["charlie"] },
    { path: "core/cas/b.ts", authors: ["charlie"] },
    { path: "core/cas/c.ts", authors: ["charlie"] },
    { path: "core/cas/d.ts", authors: ["charlie"] },
    { path: "core/cas/e.ts", authors: ["dana"] },
  ]

  it("SCN-INDEX-15a-1: [generation ENABLED] owner is generated from graph + blame ($0-LLM)", () => {
    const empty: Manifest = { territories: [] }
    const map = reconcile(NO_GRAPH, casBlame, empty)
    // territory:cas owner generated = charlie (blame majority), NOT left null/unassigned.
    expect(ownerOf(map, "core/cas")).toBe("charlie")
    expect(reconcileModelCalls()).toBe(0)
  })

  it("SCN-INDEX-15b-1: an explicit manifest override beats the generated owner", () => {
    const listed = T("cas", "dana", "T1", ["core/cas/**"]) // explicit override = dana
    const map = reconcile(NO_GRAPH, casBlame, { territories: [listed] })
    expect(map.get(listed)).toBe("dana")
    // proof the override actually overrode: with an EMPTY override the same inputs generate charlie.
    const gen = T("cas", "", "T1", ["core/cas/**"])
    expect(reconcile(NO_GRAPH, casBlame, { territories: [gen] }).get(gen)).toBe("charlie")
  })

  it("SCN-INDEX-15c-1: reconciliation is deterministic and zero-LLM", () => {
    const listed = T("cas", "dana", "T1", ["core/cas/**"])
    const m: Manifest = { territories: [listed] }
    expect(canonMap(reconcile(NO_GRAPH, casBlame, m))).toBe(canonMap(reconcile(NO_GRAPH, casBlame, m)))
    expect(reconcileModelCalls()).toBe(0)
  })

  it("SCN-INDEX-15d-1: tier stays human-ratified, never generated", () => {
    const listed = T("cas", "dana", "T0", ["core/cas/**"]) // T0 human-ratified
    const map = reconcile(NO_GRAPH, casBlame, { territories: [listed] })
    // the reconciled key carries the ratified tier untouched — no mechanical tier generated.
    const key = [...map.keys()].find((k) => k.name === "cas")
    expect(key?.tier).toBe("T0")
  })

  it("SCN-INDEX-15e-1: the manifest is not the sole hand-authored ownership source", () => {
    // manifest lists only `docs`; region core/cas is UNLISTED yet still resolves an owner from blame.
    const listed = T("docs", "erin", "T2", ["docs/**"])
    const map = reconcile(NO_GRAPH, casBlame, { territories: [listed] })
    expect(ownerOf(map, "core/cas")).toBe("charlie") // unlisted territory still owned (anti-CODEOWNERS-rot)
  })
})

describe("PROP-INDEX-15 — generated + reconciled ownership (∀-law)", () => {
  it("override ≻ generated · generated = blame majority · byte-identical · tier untouched · $0-LLM", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom("c1", "c2", "c3", "c4", "c5"), { minLength: 2, maxLength: 2 }),
        fc.constantFrom<Territory["tier"]>("T0", "T1", "T2"),
        ([dom, ovr], tier) => {
          // `!` justified by the arbitrary: `uniqueArray(..., { minLength: 2, maxLength: 2 })`, so both
          // slots always exist; `noUncheckedIndexedAccess` cannot see the length bound through destructuring.
          const blame: BlameEntry[] = ["z/a.ts", "z/b.ts", "z/c.ts"].map((p) => ({ path: p, authors: [dom!] }))
          const listed = T("z", ovr!, tier, ["z/**"])
          const r1 = reconcile(NO_GRAPH, blame, { territories: [listed] })
          expect(r1.get(listed)).toBe(ovr) // explicit override wins over the generated owner
          const gen = T("z", "", tier, ["z/**"])
          expect(reconcile(NO_GRAPH, blame, { territories: [gen] }).get(gen)).toBe(dom) // generated = majority
          expect([...r1.keys()].find((k) => k.name === "z")?.tier).toBe(tier) // tier passed through untouched
          expect(canonMap(reconcile(NO_GRAPH, blame, { territories: [listed] }))).toBe(canonMap(r1))
          expect(reconcileModelCalls()).toBe(0)
        },
      ),
      { numRuns: 200 },
    )
  })
})
