// @atlas/knowledge — test/wp-9.x-adjacency-b.near-dup.test.ts  (ADJACENCY-B · WP-9.x · WP-DEDUP-1)
//
// The WP-DEDUP-1 un-merge behavior on `upsert`. After the always-merge was REMOVED (docs/design/
// dedup-identity.md DP-1), a CREATE at an adjacent anchor MINTS ITS OWN NODE — each grounding stays
// distinct (A2). The old write-time adjacency matcher is GONE; the structural relation is now DERIVED
// ON READ (`deriveSubsumes`, DP-2), never a merge. Every golden NAMES the mutant that flips it.

import { describe, it, expect } from "vitest"
import { upsert, emptyStore, currentNodes } from "../src/write/router.js"
import type { StoreProjection, WriteRequest } from "../src/write/router.js"

describe("ADJACENCY-B — upsert (WP-DEDUP-1 un-merge): a CREATE at an adjacent anchor mints its OWN node", () => {
  it("a CREATE adjacent (descendant) to an existing node + duplicate claim mints a distinct node (no merge)", () => {
    let s: StoreProjection = emptyStore()
    // seed a parent-unit node at a::b carrying cn-dup.
    s = upsert(s, {
      nodeKey: "nk-parent",
      contentHash: "ch-p",
      family: "advisory",
      claimNorm: "cn-dup",
      primaryAnchor: "a::b",
      slot: "invariant",
    }).store
    const before = currentNodes(s).length
    // a child-unit write at a::b::c with the SAME claim — nodeKey MISS ⇒ CREATE. The always-merge is GONE
    // (WP-DEDUP-1): each grounding stays distinct (A2), so the child mints its OWN node, never folding in.
    const child: WriteRequest = {
      nodeKey: "nk-child",
      contentHash: "ch-c",
      family: "advisory",
      claimNorm: "cn-dup",
      primaryAnchor: "a::b::c",
      slot: "gotcha",
    }
    const r = upsert(s, child)
    expect(r.decision).toBe("CREATE") // no more re-route: a routed CREATE stays a CREATE
    expect(currentNodes(r.store).length).toBe(before + 1) // a genuine new node is minted
    expect(r.store.current.has("nk-parent")).toBe(true) // BOTH nodes present — parent kept
    expect(r.store.current.has("nk-child")).toBe(true) //  ... AND the child lands as its own node
    const neighbor = r.store.current.get("nk-parent")!
    expect(neighbor.claims).toEqual(["cn-dup"]) // the neighbor's claims are UNCHANGED — no union into it
    expect(neighbor.primaryAnchor).toBe("a::b") // the neighbor is untouched by the child write
  })

  it("a CREATE adjacent with a NOVEL claim mints its own node (no collision ⇒ plain CREATE)", () => {
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-parent",
      contentHash: "ch-p",
      family: "advisory",
      claimNorm: "cn-a",
      primaryAnchor: "a::b",
      slot: "invariant",
    }).store
    // NOTE: a NOVEL claim at a child unit does NOT collide (exact leg) ⇒ it CREATEs its own node.
    const child: WriteRequest = {
      nodeKey: "nk-child",
      contentHash: "ch-c",
      family: "advisory",
      claimNorm: "cn-novel",
      primaryAnchor: "a::b::c",
      slot: "gotcha",
    }
    const r = upsert(s, child)
    expect(r.decision).toBe("CREATE") // no claim collision ⇒ a real new node
    expect(r.store.current.has("nk-child")).toBe(true)
  })

  it("a CREATE at a NON-adjacent anchor + duplicate claim still CREATEs (no false merge)", () => {
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-far",
      contentHash: "ch-f",
      family: "advisory",
      claimNorm: "cn-dup",
      primaryAnchor: "x::y",
      slot: "invariant",
    }).store
    const before = currentNodes(s).length
    const other: WriteRequest = {
      nodeKey: "nk-a",
      contentHash: "ch-a",
      family: "advisory",
      claimNorm: "cn-dup",
      primaryAnchor: "a::b::c",
      slot: "gotcha",
    }
    const r = upsert(s, other)
    expect(r.decision).toBe("CREATE") // unrelated anchors ⇒ adjacency never fires
    expect(currentNodes(r.store).length).toBe(before + 1) // a genuine new node
    expect(r.store.current.has("nk-a")).toBe(true)
    // teeth (MUTANT: reintroduce a write-time adjacency merge — the REMOVED always-merge, WP-DEDUP-1) → this would falsely fold the unrelated-anchor node in, dropping it.
  })

  it("a CREATE with NO primaryAnchor leaves adjacency DORMANT (even against an adjacent-claimed neighbor)", () => {
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-parent",
      contentHash: "ch-p",
      family: "advisory",
      claimNorm: "cn-dup",
      primaryAnchor: "a::b",
      slot: "invariant",
    }).store
    const before = currentNodes(s).length
    // an anchor-LESS flat request — adjacency never fires ⇒ ordinary CREATE (this is what keeps s05 §6a intact).
    const r = upsert(s, { nodeKey: "nk-flat", contentHash: "ch-flat", family: "advisory", claimNorm: "cn-dup" })
    expect(r.decision).toBe("CREATE")
    expect(currentNodes(r.store).length).toBe(before + 1)
  })

  it("the 2-arg upsert (default cfg) also mints a distinct node — no adjacency merge remains (WP-DEDUP-1)", () => {
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-parent",
      contentHash: "ch-p",
      family: "advisory",
      claimNorm: "cn-dup",
      primaryAnchor: "a::b",
      slot: "invariant",
    }).store
    const before = currentNodes(s).length
    // 2-arg call (no cfg) — with the always-merge removed, an adjacent dup CREATEs its own node.
    const r = upsert(s, {
      nodeKey: "nk-child",
      contentHash: "ch-c",
      family: "advisory",
      claimNorm: "cn-dup",
      primaryAnchor: "a::b::c",
    })
    expect(r.decision).toBe("CREATE")
    expect(currentNodes(r.store).length).toBe(before + 1) // a distinct node
    expect(r.store.current.has("nk-parent")).toBe(true) // both nodes present
    expect(r.store.current.has("nk-child")).toBe(true)
    expect(r.store.current.get("nk-parent")!.claims).toEqual(["cn-dup"]) // neighbor's claims unchanged
  })
})
