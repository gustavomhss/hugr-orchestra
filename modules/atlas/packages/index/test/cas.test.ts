// @atlas/index — test/cas.test.ts  (WP-4.10-a.INDEX)
//
// RED→GREEN transcription of the VISIBLE campaign-4 CAS-identity goldens this WP owns:
//   SCN-INDEX-11a-1 — every object kind incl. a Doc is a BLAKE3-keyed CAS object (round-trips).
//   SCN-INDEX-11b-1 — every object is grounded + drift-checked like any fact (no kind is exempt).
// Held-out `-2` fixtures are NOT transcribed (the GATE runs those).
//
// Identity is minted ONLY through the sealed @atlas/kernel seam (BLAKE3 via `id`/`createStore`, never a
// raw digest). The facet delegates `put` to the ONE kernel CAS (`StoreApi`) — no second doc-store — and
// routes the drift verdict through an INJECTED oracle port (GROUND owns FRESH/DRIFTED; INDEX only routes).

import { describe, it, expect } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { Freshness } from "@atlas/contracts"
import { createCasIndex, type DriftPort } from "../src/cas.js"

// --- SCN-INDEX-11a-1 : every kind (incl. Doc) is one BLAKE3-CAS object -----------------------------------
describe("SCN-INDEX-11a-1 — every object kind incl. a Doc is a BLAKE3-keyed CAS object", () => {
  // One each of the six object kinds INDEX-11 enumerates. Bodies are opaque JSON (CasObject = unknown).
  const kinds = {
    CodeNode: { kind: "CodeNode", unit: "item:put", body: "fn put(x){store(x)}" },
    GroundedFact: { kind: "GroundedFact", claim: "put is idempotent", anchor: "item:put" },
    MemoryEntry: { kind: "MemoryEntry", seat: "seat-index", note: "CAS is one store" },
    Provenance: { kind: "Provenance", by: "seat-index", at: "wp-4.10-a.INDEX" },
    Transcript: { kind: "Transcript", turns: ["put(doc)", "hash", "store"] },
    Doc: { kind: "Doc", cites: "item:put", title: "the addressing subsystem" },
  } as const

  it("keys each kind by blake3(canonical) into the ONE CAS and round-trips get(hash)==object", () => {
    const store = createStore()
    const cas = createCasIndex(store)
    for (const obj of Object.values(kinds)) {
      const h = cas.put(obj)
      // keyed by blake3(canonical(object)) — the sealed kernel identity, not a caller id.
      expect(h).toBe(id(obj))
      // round-trips from the SAME store — no side doc-store, no second CAS.
      expect(store.get(h)).toBe(obj)
    }
  })

  it("the Doc specifically is content-addressed (teeth: a Doc must NOT bypass to a side doc-store)", () => {
    const store = createStore()
    const cas = createCasIndex(store)
    const h = cas.put(kinds.Doc)
    // get(hash(doc)) HITS the one CAS — the Doc is not un-addressed.
    expect(store.get(h)).toBe(kinds.Doc)
    expect(h).toBe(id(kinds.Doc))
  })
})

// --- SCN-INDEX-11b-1 : every object is grounded + drift-checked like any fact ----------------------------
describe("SCN-INDEX-11b-1 — every object is grounded + drift-checked like any fact", () => {
  // A test-local fake modelling GROUND's oracle semantics (INDEX excludes FRESH/DRIFTED — GROUND owns it).
  // FRESH iff every anchor's subtreeHash matches the current source-of-truth; else DRIFTED.
  interface Anchor {
    readonly at: string
    readonly subtreeHash: string
  }
  interface FakeGrounding {
    readonly anchors: readonly Anchor[]
  }
  type SrcMap = ReadonlyMap<string, string>
  const oracle: DriftPort<FakeGrounding, SrcMap> = {
    driftDetect(g: FakeGrounding, src: SrcMap): Freshness {
      return g.anchors.every((a) => src.get(a.at) === a.subtreeHash) ? "FRESH" : "DRIFTED"
    },
  }

  // A Doc that CITES code at item:put@`bk-11`, and a GroundedFact citing the SAME unit — same grounding.
  const doc = { kind: "Doc", cites: "item:put", title: "x" }
  const fact = { kind: "GroundedFact", claim: "put is total", anchor: "item:put" }
  const grounding: FakeGrounding = { anchors: [{ at: "item:put", subtreeHash: "bk-11" }] }

  it("registers the Doc as drift-eligible EXACTLY like a GroundedFact (no kind escapes grounding)", () => {
    const cas = createCasIndex(createStore())
    const hDoc = cas.put(doc)
    const hFact = cas.put(fact)
    // put made BOTH kinds drift-eligible — the Doc is not exempted / side-stored.
    expect(cas.isDriftEligible(hDoc)).toBe(true)
    expect(cas.isDriftEligible(hFact)).toBe(true)
  })

  it("flags the Doc stale when the cited code is edited — same verdict as a GroundedFact", () => {
    const cas = createCasIndex(createStore())
    cas.put(doc)
    cas.put(fact)

    // Before the edit: item:put still hashes to `bk-11` → both FRESH via the identical routing.
    const srcBefore: SrcMap = new Map([["item:put", "bk-11"]])
    expect(cas.checkDrift(oracle, grounding, srcBefore)).toBe("FRESH")

    // item:put is edited to `bk-11x` (a real change to the cited unit).
    const srcAfter: SrcMap = new Map([["item:put", "bk-11x"]])
    const docVerdict = cas.checkDrift(oracle, grounding, srcAfter)
    const factVerdict = cas.checkDrift(oracle, grounding, srcAfter)

    // teeth: the Doc must NOT stay FRESH — it drifts exactly like the fact (byte-identical routing).
    expect(docVerdict).not.toBe("FRESH")
    expect(docVerdict).toBe("DRIFTED")
    expect(docVerdict).toBe(factVerdict)
  })
})
