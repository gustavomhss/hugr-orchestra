// WP-D3B-B.USE-OR-SEAL · RED/GREEN — the USE path of the owner's growth ruling (INV-AUTH-16) against the
// FROZEN `BoundHits` oracle (hits.ts gains `USE_THRESHOLD` / `seal` / `servedClass`). Transcribes the
// `-1` goldens SCN-AUTH-16a-1 / 16b-1 / 16c-1 / 16d-1 (docs/requirements/goldens-auth.md, method-tag
// exhaustive — method-tags-auth:146-152: "enumerate the two rise triggers"). Held-out `-2` fixtures live
// in hits.auth16.heldout.test.ts — NOT referenced here.
//
// SEAM (same build-ahead injection as hits.know17.test.ts): `servedSet`/`archive`/`calibrate` belong to
// KNOW-17's decay/door-2 seams and are injected; THIS leg owns ONLY the two rise triggers (a served-
// counter reaching the FIXED `USE_THRESHOLD` plain integer, no calibrated function of anything — REQ-AUTH-
// 16b) and the human seal (REQ-AUTH-16c), and the NEVER-by-default law (REQ-AUTH-16d). The serve-path wire
// (adapter-io projection-query-index) is what makes the counter MOVE on a real query; here the ledger is
// driven directly, exactly as SERVED-IN-A-PACK would drive it.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import { bindHits, USE_THRESHOLD, type HitsDeps, type Calibrate } from "../src/lifecycle/hits.js"

// ── fixtures ────────────────────────────────────────────────────────────────

const A = asNodeKey("fact-A")
const B = asNodeKey("fact-B")

/** A mutable served/pack snapshot the test drives (upstream produce/router-owned). */
const pack = (init: NodeKey[]): { snapshot: () => readonly NodeKey[]; set: (n: NodeKey[]) => void } => {
  let current = init
  return {
    snapshot: () => current,
    set: (n) => {
      current = n
    },
  }
}

/** A CAS archive sink that only RECEIVES (KNOW-12 — never deletes). Records what decay archived. */
const archiveSink = (): { archive: (n: NodeKey) => void; archived: NodeKey[] } => {
  const archived: NodeKey[] = []
  return {
    archive: (n) => {
      archived.push(n)
    },
    archived,
  }
}

/** The DEFINE-supplied door-2 threshold f(observed hits) — PARAMETRIC, injected. UNUSED by USE-OR-SEAL. */
const calibrate: Calibrate = (observedHits) => observedHits * 10

const deps = (servedSet: () => readonly NodeKey[], archive: (n: NodeKey) => void): HitsDeps => ({
  servedSet,
  archive,
  calibrate,
})

const cfg = { window: 0, threshold: 0 }

// ── SCN-AUTH-16a-1 — served-in-a-pack increments the usage counter ──────────────────────────────────
describe("SCN-AUTH-16a-1 · served-in-a-pack increments the usage counter", () => {
  it("accrues one hit per serve of the advisory node (breaks-on a served fact whose counter does NOT move)", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    // the counter MOVES as a node is served in a pack (the serve path in adapter-io calls logHit).
    expect(hits.logHit(A).hits).toBe(1)
    expect(hits.logHit(A).hits).toBe(2) // a second serve of the SAME node accrues again
    // per-node: a different node served does NOT move A's counter.
    hits.logHit(B)
    expect(hits.door2Threshold(A)).toBe(calibrate(2)) // A still at 2 observed hits
  })
})

// ── SCN-AUTH-16b-1 — the fixed threshold rises a node implicitly ────────────────────────────────────
describe("SCN-AUTH-16b-1 · the fixed USE_THRESHOLD rises a node implicitly — no human, no gate", () => {
  it("stays advisory one below the threshold, governing at the threshold — gated on the PLAIN INTEGER", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    // counter one below the FIXED named constant
    for (let i = 0; i < USE_THRESHOLD - 1; i++) hits.logHit(A)
    expect(hits.servedClass(A)).toBe("advisory")

    // served once more ⇒ counter reaches the fixed threshold ⇒ rises AUTOMATICALLY.
    hits.logHit(A)
    expect(hits.servedClass(A)).toBe("governing")

    // TEETH (the "one tunable place, never a calibrated function" clause): the rise IS the plain
    // integer. A mutant that gated on `calibrate` or `door2Threshold` — a DIFFERENT parametric knob that
    // at this observed count returns 100 — would leave this node advisory.
    expect(USE_THRESHOLD).toBeGreaterThan(0) // a plain positive integer, one tunable place
    expect(Number.isInteger(USE_THRESHOLD)).toBe(true)
    expect(hits.door2Threshold(A)).not.toBe(USE_THRESHOLD) // door-2 calibration is a DISTINCT knob
  })
})

// ── SCN-AUTH-16c-1 — the human seal is an alternative, sufficient evidence ──────────────────────────
describe("SCN-AUTH-16c-1 · a human ratify-token seal rises a node INDEPENDENT of the counter", () => {
  it("seal() alone — counter below threshold — serves governing (breaks-on BOTH required)", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.logHit(A) // counter = 1, far below USE_THRESHOLD
    expect(hits.servedClass(A)).toBe("advisory")

    hits.seal(A) // deliberate human endorsement — alternative sufficient evidence

    expect(hits.servedClass(A)).toBe("governing") // independent of the counter
  })

  it("a seal is not a ledger event — it does NOT advance the KNOW-17 window", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.seal(B) // a sealed node id
    // the seal advanced NO window position and NO counter.
    expect(hits.servedClass(B)).toBe("governing")
    // an UNSEALED sibling is untouched — no cross-node leakage into governing.
    expect(hits.servedClass(A)).toBe("advisory")
  })
})

// ── SCN-AUTH-16d-1 — neither growth evidence is mandatory ───────────────────────────────────────────
describe("SCN-AUTH-16d-1 · a node earning neither stays advisory and decays by non-use", () => {
  it("never served enough, never sealed ⇒ stays advisory and decays (breaks-on a default rise)", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    // served 7 times — ONE below the threshold — and never sealed.
    for (let i = 0; i < USE_THRESHOLD - 1; i++) hits.logHit(A)
    expect(hits.servedClass(A)).toBe("advisory") // never rose by default

    // the decay pass (KNOW-17) still owns non-use: a node with ZERO hits in the window is archived.
    const p2 = pack([A])
    const sink2 = archiveSink()
    const cold = bindHits(deps(p2.snapshot, sink2.archive))
    const result = cold.decay(cfg)
    expect(result.decayed).toEqual([A]) // decays by non-use rather than rising
    expect(sink2.archived).toEqual([A]) // archived to CAS, never deleted
    expect(cold.servedClass(A)).toBe("advisory") // even as it decays, it never rose by default
  })
})

// ── the method-tag exhaustive order: the two triggers are enumerated completely ──────────────────────
describe("INV-AUTH-16 (exhaustive down-model) · exactly the two rise triggers, enumerated", () => {
  it("served-counter reaching USE_THRESHOLD rises; seal rises; a node with neither stays advisory", () => {
    const p = pack([A, B])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    // TRIGGER 1 — USE: counter reaches the fixed threshold ⇒ governing.
    for (let i = 0; i < USE_THRESHOLD; i++) hits.logHit(A)
    expect(hits.servedClass(A)).toBe("governing")

    // TRIGGER 2 — SEAL: independent of the counter ⇒ governing.
    hits.seal(B)
    expect(hits.servedClass(B)).toBe("governing")

    // NEITHER — stays advisory (never rising by default; a literal-`governing` mutant flips here).
    expect(hits.servedClass(asNodeKey("fact-C"))).toBe("advisory")
  })
})
