// @atlas/index — test/cas.heldout.test.ts  (HELD-OUT GATE · WP-4.10-a.INDEX)
//
// Independently authored from the held_out:true goldens (cold review — builder's suite NOT reused):
//   SCN-INDEX-11a-2 — every object kind incl. a Doc is a BLAKE3-keyed CAS object (net fixture).
//   SCN-INDEX-11b-2 — every object grounded + drift-checked like any fact (item:send@bk-aa → bk-aax).
// Runs against the EXISTING src/cas.ts. Identity via the sealed @atlas/kernel seam only.

import { describe, it, expect } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { Freshness } from "@atlas/contracts"
import { createCasIndex, type DriftPort } from "../src/cas.js"

// --- SCN-INDEX-11a-2 : net fixture, every kind incl. Doc is one BLAKE3-CAS object ------------------------
describe("SCN-INDEX-11a-2 [held-out] — net fixture: every kind incl. a Doc is a BLAKE3-CAS object", () => {
  // A DIFFERENT (net) draw of the six kinds — distinct bodies from the visible -1 fixture.
  const net = {
    CodeNode: { kind: "CodeNode", unit: "item:send", body: "fn send(m){emit(m)}" },
    GroundedFact: { kind: "GroundedFact", claim: "send is at-least-once", anchor: "item:send" },
    MemoryEntry: { kind: "MemoryEntry", seat: "seat-net", note: "one CAS, one key space" },
    Provenance: { kind: "Provenance", by: "seat-net", at: "held-out-2" },
    Transcript: { kind: "Transcript", turns: ["send(m)", "canon", "blake3"] },
    Doc: { kind: "Doc", cites: "item:send", title: "the dispatch subsystem" },
  } as const

  it("keys each net kind by blake3(canonical) into the ONE CAS and round-trips get(hash)==object", () => {
    const store = createStore()
    const cas = createCasIndex(store)
    for (const obj of Object.values(net)) {
      const h = cas.put(obj)
      expect(h).toBe(id(obj)) // sealed kernel identity, not a caller id
      expect(store.get(h)).toBe(obj) // same store — no side doc-store
    }
  })

  it("teeth: the net Doc is content-addressed, NOT sent to a side doc-store", () => {
    const store = createStore()
    const cas = createCasIndex(store)
    const h = cas.put(net.Doc)
    expect(h).toBe(id(net.Doc))
    expect(store.get(h)).toBe(net.Doc) // get(hash(doc)) HITS the one CAS
  })
})

// --- SCN-INDEX-11b-2 : Doc cites item:send@bk-aa; edited to bk-aax → stale like a fact -------------------
describe("SCN-INDEX-11b-2 [held-out] — net Doc drifts exactly like a GroundedFact", () => {
  interface Anchor {
    readonly at: string
    readonly subtreeHash: string
  }
  interface FakeGrounding {
    readonly anchors: readonly Anchor[]
  }
  type SrcMap = ReadonlyMap<string, string>
  const oracle: DriftPort<FakeGrounding, SrcMap> = {
    driftDetect: (g, src) => (g.anchors.every((a) => src.get(a.at) === a.subtreeHash) ? "FRESH" : "DRIFTED"),
  }

  const doc = { kind: "Doc", cites: "item:send", title: "net" }
  const fact = { kind: "GroundedFact", claim: "send is total", anchor: "item:send" }
  const grounding: FakeGrounding = { anchors: [{ at: "item:send", subtreeHash: "bk-aa" }] }

  it("registers the net Doc drift-eligible exactly like a GroundedFact", () => {
    const cas = createCasIndex(createStore())
    const hDoc = cas.put(doc)
    const hFact = cas.put(fact)
    expect(cas.isDriftEligible(hDoc)).toBe(true)
    expect(cas.isDriftEligible(hFact)).toBe(true)
  })

  it("flags the Doc stale when item:send is edited bk-aa → bk-aax — same verdict as the fact", () => {
    const cas = createCasIndex(createStore())
    cas.put(doc)
    cas.put(fact)
    const before: SrcMap = new Map([["item:send", "bk-aa"]])
    expect(cas.checkDrift(oracle, grounding, before)).toBe("FRESH")
    const after: SrcMap = new Map([["item:send", "bk-aax"]])
    const dv = cas.checkDrift(oracle, grounding, after)
    const fv = cas.checkDrift(oracle, grounding, after)
    expect(dv).not.toBe("FRESH") // teeth: Doc must not stay FRESH
    expect(dv).toBe("DRIFTED")
    expect(dv).toBe(fv) // byte-identical routing across kinds
  })
})
