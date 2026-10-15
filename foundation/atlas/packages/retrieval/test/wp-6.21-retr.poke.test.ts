// @atlas/retrieval — test/wp-6.21-retr.poke.test.ts  (WP-6.21.RETR)
//
// RED→GREEN transcription of the 12 VISIBLE `-1` goldens for the poke facet:
//   • RETR-4a..4i — the debounced, once-per-scope poke automaton (the tool-call-hook classifier + the
//     N=2 settle window + the per-session `poked` guard + the no-transient-poke law).
//   • RETR-5a..5c — location-scoped tool projection (covering-set only, retract-on-leave, never whole-graph).
// Plus the X1 owner-decision reshape: the announce unit is the PACK (`own_<leaf>`), with covering nodes as
// an in-pack drill-down — never a top-level node swarm.
//
// The facet is a SEAM CONSUMER: the injected pack (RETR-2), the compact notice, and the covering NodeTools
// are all SUPPLIED as fixtures. `NodeKey`s are minted ONLY through the sealed @atlas/kernel `asNodeKey`
// constructor (no hand-rolled identity, no raw hashing). Held-out `-2` fixtures are NOT transcribed.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey, Pack, Hash, ToolSchema } from "@atlas/contracts"
import type { NodeTool, Path } from "../src/types.js"
import {
  createPoke,
  classify,
  packToolName,
  SETTLE_WINDOW,
  POKE_CAP,
  type ToolCall,
  type PokeSources,
} from "../src/poke.js"

// ── fixture builders ────────────────────────────────────────────────────────────────────────────────────
const nk = (s: string): NodeKey => asNodeKey(s)
const HASH = "deadbeef" as unknown as Hash

const Read = (p: Path): ToolCall => ({ tool: "Read", paths: [p] })

function pack(territory: string, ids: readonly string[]): Pack {
  return {
    territory,
    axisHash: HASH,
    invariants: ids.map((id) => ({ nodeId: nk(id), tier: "T1" as const, claim: id, freshness: "FRESH" as const })),
    advisory: [],
    advisoryDropped: 0,
    tokenEstimate: 100 * ids.length,
    stale: false,
  }
}

function nodeTool(id: string, scope: Path): NodeTool {
  const schema: ToolSchema = { name: id, description: `node ${id}`, inputSchema: {} }
  return { nodeId: nk(id), scope, schema }
}

// ── Fixture C — tool-call scopes (RETR-4) ───────────────────────────────────────────────────────────────
const A: Path = "file:billing/charge" // crates/billing/src/charge.rs
const B: Path = "file:billing/refund"
const C: Path = "file:billing/tax"

// ── Fixture A — covering-node sets (RETR-5) ─────────────────────────────────────────────────────────────
// scope A (billing crate roll-up) covered by {n1,n2,n3}; scope B (refund) covered by {n4,n5}; n6..n8 are the
// rest of the 8-node graph — never simultaneously projected.
const COVER: Record<Path, readonly NodeTool[]> = {
  [A]: [nodeTool("n1", A), nodeTool("n2", A), nodeTool("n3", A)],
  [B]: [nodeTool("n4", B), nodeTool("n5", B)],
  [C]: [nodeTool("n6", C)],
}

function sourcesOf(): PokeSources {
  return {
    pack: (scope) => pack(scope, [`${scope}#inv1`, `${scope}#inv2`]),
    notice: (scope) => `poke:${scope}`, // a compact pointer notice (well under POKE_CAP); rendering is a seam
    covering: (scope) => COVER[scope] ?? [],
  }
}

const ids = (tools: readonly NodeTool[]): string[] => tools.map((t) => String(t.nodeId))

// Drive the automaton until `scope` settles + pokes (feed it as current for N consecutive calls).
function settle(facet: ReturnType<typeof createPoke>, scope: Path) {
  let last = null as ReturnType<typeof facet.feed>["poke"]
  for (let i = 0; i < SETTLE_WINDOW; i++) last = facet.feed(Read(scope)).poke
  return last
}

// ══ REQ-RETR-4 — debounced once-per-scope poke ══════════════════════════════════════════════════════════

describe("RETR-4a — the poke event source is the tool-call hook", () => {
  it("infers scope from the tool-call path, not from an explicit query", () => {
    // Given the hook observing Read(charge.rs) — When classified — Then scope A is inferred FROM THE PATH.
    const sig = classify(Read(A))
    expect(sig).toEqual({ kind: "navigate", scope: A })
    // teeth: no atlas-query is ever involved — navigation that never issues a query still resolves a scope.
    const facet = createPoke(sourcesOf())
    const fired = settle(facet, A)
    expect(fired?.scope).toBe(A) // the poke was driven purely by the tool-call stream
  })
})

describe("RETR-4b — a single-file Read/Edit/Write is a navigation signal", () => {
  it("classifies a single-file call as navigate(that file node)", () => {
    expect(classify({ tool: "Read", paths: [A] })).toEqual({ kind: "navigate", scope: A })
    expect(classify({ tool: "Edit", paths: [B] })).toEqual({ kind: "navigate", scope: B })
    expect(classify({ tool: "Write", paths: [C] })).toEqual({ kind: "navigate", scope: C })
  })
})

describe("RETR-4c — a multi-file Grep/Glob is suppressed", () => {
  it("returns suppress — a multi-file span has no single scope", () => {
    const grep: ToolCall = { tool: "Grep", paths: ["file:billing/a", "file:payments/b"] }
    expect(classify(grep)).toEqual({ kind: "suppress" })
    // a Grep spanning 30 matches never infers a scope (teeth: it must not adopt the first match's file)
    expect(classify({ tool: "Glob", paths: Array.from({ length: 30 }, (_, i) => `f${i}`) })).toEqual({
      kind: "suppress",
    })
  })
})

describe("RETR-4d — a Bash path-shaped arg is not navigation", () => {
  it("returns suppress — a command arg is not a location", () => {
    // `cargo test -p billing`: `-p billing` is path-shaped but a command, not a location.
    expect(classify({ tool: "Bash", paths: ["billing"] })).toEqual({ kind: "suppress" })
    expect(classify({ tool: "Bash", paths: [] })).toEqual({ kind: "suppress" })
  })
})

describe("RETR-4e — only a resolved single-file navigation drives a scope-change", () => {
  it("moves the current scope only on the Read; the Grep and Bash move nothing", () => {
    const facet = createPoke(sourcesOf())
    facet.feed({ tool: "Grep", paths: ["x", "y", "z"] }) // moves nothing
    facet.feed({ tool: "Bash", paths: ["billing"] }) // moves nothing
    const step = facet.feed(Read(B)) // the single-file navigation — moves scope to B
    expect(step.signal).toEqual({ kind: "navigate", scope: B })
    expect(step.tools.every((t) => t.scope === B)).toBe(true) // current scope is now B
    expect(step.poke).toBeNull() // B has been current for only 1 call — not yet settled
  })
})

describe("RETR-4f — crossing into a new settled scope fires an unasked poke", () => {
  it("fires a poke carrying a compact notice + that scope pack, unasked", () => {
    const facet = createPoke(sourcesOf())
    const fired = settle(facet, B) // B settles (not previously poked)
    expect(fired).not.toBeNull()
    expect(fired?.scope).toBe(B)
    expect(fired?.pack.territory).toBe(B) // that scope's pack, delivered without an explicit request
    expect(fired?.notice.length).toBeGreaterThan(0)
    expect(fired?.notice.length).toBeLessThanOrEqual(POKE_CAP) // ≤ ~150 (compact)
  })
})

describe("RETR-4g — a poke fires only after the scope settles across N=2 calls", () => {
  it("fires B only at call 3 of [Read(A), Read(B), Read(B)] — never at the first crossing", () => {
    const facet = createPoke(sourcesOf())
    expect(facet.feed(Read(A)).poke?.scope).not.toBe(B) // call 1
    expect(facet.feed(Read(B)).poke).toBeNull() // call 2 — B just crossed, NOT settled (teeth: no N=1 poke)
    expect(facet.feed(Read(B)).poke?.scope).toBe(B) // call 3 — B settled across 2 consecutive calls
    expect(SETTLE_WINDOW).toBe(2) // the debounce is a COUNT of calls, pinned at N=2
  })
})

describe("RETR-4h — a transient in-and-out crossing does not poke", () => {
  it("fires no B poke for [Read(A), Read(B), Read(A)] — B never settles", () => {
    const facet = createPoke(sourcesOf())
    const pokes = [Read(A), Read(B), Read(A)].map((c) => facet.feed(c).poke)
    expect(pokes.some((p) => p?.scope === B)).toBe(false) // B was present for < N=2 consecutive calls
  })
})

describe("RETR-4i — an already-poked scope does not re-poke", () => {
  it("fires no second B poke on re-entry, and reasoning over an injected pack emits no path event", () => {
    const facet = createPoke(sourcesOf())
    expect(settle(facet, B)?.scope).toBe(B) // B's poke has already fired (B ∈ poked)
    // then the stream [Read(C), Read(B), Read(B)] re-enters B
    facet.feed(Read(C))
    facet.feed(Read(B))
    const reentry = facet.feed(Read(B)) // B settles again — but B ∈ poked
    expect(reentry.poke).toBeNull() // ≤1 poke / scope / session
    // a reasoning turn emits no path event → no feed call → no poke (nothing to re-trigger)
    expect(facet.live().every((t) => t.scope === B)).toBe(true)
  })
})

// ══ REQ-RETR-5 — location-scoped tool projection ════════════════════════════════════════════════════════

describe("RETR-5a — only the current scope covering nodes are exposed", () => {
  it("projectTools(A) is exactly coveringNodes(A) = {n1,n2,n3}", () => {
    const facet = createPoke(sourcesOf())
    expect(ids(facet.projectTools(A))).toEqual(["n1", "n2", "n3"])
    // teeth: an off-scope node (n4, refund-only) never leaks into A's tool surface
    expect(ids(facet.projectTools(A))).not.toContain("n4")
  })
})

describe("RETR-5b — leaving a scope retracts its node-tools", () => {
  it("the live set becomes coveringNodes(B), retracting A — never accumulating A ∪ B", () => {
    const facet = createPoke(sourcesOf())
    facet.feed(Read(A))
    expect(ids(facet.live())).toEqual(["n1", "n2", "n3"]) // A live
    facet.feed(Read(B)) // move to B
    expect(ids(facet.live())).toEqual(["n4", "n5"]) // A retracted, B projected
    expect(ids(facet.live())).not.toContain("n1") // no accumulation of A's tools
  })
})

describe("RETR-5c — the whole graph is never projected at once", () => {
  it("the live set is always the ≤3-node covering set through an enter/exit sequence, never all 8", () => {
    const facet = createPoke(sourcesOf())
    for (const c of [Read(A), Read(B), Read(A), Read(C)]) {
      const step = facet.feed(c)
      expect(step.tools.length).toBeLessThanOrEqual(3) // never the whole 8-node graph
    }
  })
})

// ══ X1 owner-decision — pack-grain announce (nodes are in-pack drill, never a top-level swarm) ═══════════

describe("X1 — the announce unit is the PACK (own_<leaf>), covering nodes are in-pack drill", () => {
  it("announces one own_<leaf> pack with the covering nodes reachable as drill-down", () => {
    const facet = createPoke(sourcesOf())
    const ann = facet.announce(A)
    expect(ann.pack).toBe("own_charge") // a single top-level pack unit, not N node-tools
    expect(packToolName(B)).toBe("own_refund")
    expect(ids(ann.drill)).toEqual(["n1", "n2", "n3"]) // nodes reached THROUGH the pack (in-pack drill)
  })
})
