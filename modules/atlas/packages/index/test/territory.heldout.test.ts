// @atlas/index — test/territory.heldout.test.ts  (WP-2.9-a.INDEX — COLD-REVIEW HELD-OUT GATE)
//
// FRESH held-out anti-overfit gate authored by cold review (NOT by the builder). Compiles the EXISTING
// held-out `-2` goldens into assertions against the UNMODIFIED src (territory.ts / ownership.ts).
// Scope: req-15 has held-out `-2` fixtures for 15b/15c/15d/15e (net/http universe); 15a is held-out-EXEMPT
// (DEFINE-parametric) and req-14 (14a-f) are PBT with NO `-2` fixtures — so nothing to gate there.
import { describe, it, expect } from "vitest"
import { canonicalForm } from "@atlas/kernel"
import type { Manifest, DepEdge } from "@atlas/index"
import type { Territory } from "@atlas/contracts"
import { reconcile } from "../src/ownership.js"
import type { BlameEntry, OwnerMap } from "../src/ownership.js"

const T = (name: string, owner: string, tier: Territory["tier"], globs: string[]): Territory => ({
  name,
  owner,
  tier,
  globs,
})
const NO_GRAPH: readonly DepEdge[] = []
const ownerOf = (m: OwnerMap, name: string): string | undefined => [...m.entries()].find(([t]) => t.name === name)?.[1]
const canonMap = (m: OwnerMap): string =>
  new TextDecoder().decode(
    canonicalForm([...m.entries()].map(([t, o]) => [t.name, o]).sort((a, b) => (a[0]! < b[0]! ? -1 : 1))),
  )

// held-out net/http fixture universe (independent of the visible core/cas fixture).
// frank authored 3/4 of http; grace the fourth.
const httpBlame: BlameEntry[] = [
  { path: "http/a.ts", authors: ["frank"] },
  { path: "http/b.ts", authors: ["frank"] },
  { path: "http/c.ts", authors: ["frank"] },
  { path: "http/d.ts", authors: ["grace"] },
]
// net fixture — henry authored the majority.
const netBlame: BlameEntry[] = [
  { path: "net/a.ts", authors: ["henry"] },
  { path: "net/b.ts", authors: ["henry"] },
  { path: "net/c.ts", authors: ["ivan"] },
]

describe("HELD-OUT GATE — INDEX-15 (-2 goldens, net/http)", () => {
  it("SCN-INDEX-15b-2: explicit override (grace) beats generated (frank) for territory:http", () => {
    const listed = T("http", "grace", "T1", ["http/**"]) // explicit override = grace
    const map = reconcile(NO_GRAPH, httpBlame, { territories: [listed] })
    expect(map.get(listed)).toBe("grace")
    // proof override overrode: empty override generates frank (majority)
    const gen = T("http", "", "T1", ["http/**"])
    expect(reconcile(NO_GRAPH, httpBlame, { territories: [gen] }).get(gen)).toBe("frank")
  })

  it("SCN-INDEX-15c-2: reconciliation byte-identical + $0-LLM over the net fixture", () => {
    const listed = T("net", "henry", "T1", ["net/**"])
    const m: Manifest = { territories: [listed] }
    expect(canonMap(reconcile(NO_GRAPH, netBlame, m))).toBe(canonMap(reconcile(NO_GRAPH, netBlame, m)))
  })

  it("SCN-INDEX-15d-2: tier stays human-ratified (T0) for territory:net, never generated", () => {
    const listed = T("net", "henry", "T0", ["net/**"]) // T0 human-ratified
    const map = reconcile(NO_GRAPH, netBlame, { territories: [listed] })
    const key = [...map.keys()].find((k) => k.name === "net")
    expect(key?.tier).toBe("T0")
  })

  it("SCN-INDEX-15e-2: unlisted territory:http still resolves an owner from blame", () => {
    const listed = T("docs", "erin", "T2", ["docs/**"]) // manifest lists only docs
    const map = reconcile(NO_GRAPH, httpBlame, { territories: [listed] })
    expect(ownerOf(map, "http")).toBe("frank") // unlisted http still owned (anti-CODEOWNERS-rot)
  })
})
