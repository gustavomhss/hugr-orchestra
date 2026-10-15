// WP-4.11-a.KNOW · HELD-OUT gate — the `-2` fixtures NOT referenced by the RED/GREEN transcription.
// Authored by the COLD REVIEWER against the EXISTING src (`bindEmit`/`bindStatus`) — never shown to the
// builder. Transcribes ONLY the held-out goldens SCN-KNOW-1-2 (declared-BROKEN → recomputes HOLDS) and
// SCN-KNOW-2-2 (partially-grounded: one empty subtreeHash among three → fails closed). Same GROUND
// fixtures as the `-1` suite (the frozen seam, simulated) — the check is on the KNOWLEDGE bindings.

import { describe, it, expect } from "vitest"
import { asHash, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Status, StructRef } from "@atlas/contracts"
import type { Axes, IndexNode } from "@atlas/index"
import type { GateApi, GroundApi, Grounding } from "@atlas/grounding"
import type { GroundedFact, PredicateNode } from "@atlas/knowledge"
import { bindEmit } from "../src/lifecycle/emit.js"
import { bindStatus } from "../src/lifecycle/status.js"

// ── GROUND fixtures (frozen seam, simulated) ─────────────────────────────────
const isGrounded: GroundApi["isGrounded"] = (g) =>
  g.entries.length > 0 && g.entries.every((e) => String(e.anchor.subtreeHash).length > 0)

const mkGate = (fresh: boolean): GateApi => ({
  gateHolds: (candidate, grounding, _src): Status => {
    const incoming = candidate as Status
    if (incoming !== "HOLDS") return incoming
    return isGrounded(grounding) && fresh ? "HOLDS" : "NA"
  },
})

const emptyRoot = (axis: IndexNode["axis"]): IndexNode => ({
  axis,
  level: "repo",
  key: `${axis}:root`,
  subtreeHash: asSubtreeHash(`root-${axis}`),
  children: [],
  objects: [],
})

const src: Axes = {
  spatial: emptyRoot("spatial"),
  territory: emptyRoot("territory"),
  dependency: emptyRoot("dependency"),
  edges: [],
}

const anchor = (qualifiedPath: string, subtreeHash: string): StructRef => ({
  kind: "symbol",
  qualifiedPath,
  subtreeHash: asSubtreeHash(subtreeHash),
})

const predicateDeclaring = (declared: Status, g: Grounding): PredicateNode => ({
  kind: "predicate",
  id: asNodeKey("nk-pred"),
  tier: "T1",
  check: { kind: "assertion", expr: "x > 0" },
  grounding: g,
  status: declared,
  freshness: "FRESH",
  claims: [],
  authoring: "PREDICATED",
})

// ── SCN-KNOW-1-2 (held-out) — declared BROKEN dropped; side-index recomputes HOLDS ──
describe("WP-4.11-a.KNOW · KNOW-1 · SCN-KNOW-1-2 (held-out)", () => {
  it("a candidate-declared BROKEN is dropped; the recomputed side-index (FRESH ∧ grounded) serves HOLDS", () => {
    // grounded ∧ FRESH gate, evaluator recomputes HOLDS; the node DECLARES status:'BROKEN' on its body.
    const grounded: Grounding = { entries: [{ anchor: anchor("fn f", "st-42"), path: "src/f.ts" }] }
    const node = predicateDeclaring("BROKEN", grounded)
    const recompute = bindStatus({ gate: mkGate(true), evaluate: () => "HOLDS", src }).recompute

    expect(node.status).toBe("BROKEN") // the fact's self-declaration…
    expect(recompute(node)).toBe("HOLDS") // …dropped; served = recomputed side-index
  })
})

// ── SCN-KNOW-2-2 (held-out) — partially-grounded fails closed ────────────────
describe("WP-4.11-a.KNOW · KNOW-2 · SCN-KNOW-2-2 (held-out)", () => {
  it("three entries, one empty subtreeHash among two well-formed ⇒ emitted:false, 0 persisted", () => {
    const partiallyGrounded: Grounding = {
      entries: [
        { anchor: anchor("fn a", "st-1"), path: "src/a.ts" },
        { anchor: anchor("fn b", ""), path: "src/b.ts" }, // the single empty subtreeHash
        { anchor: anchor("fn c", "st-3"), path: "src/c.ts" },
      ],
    }
    const node: PredicateNode = predicateDeclaring("NA", partiallyGrounded)

    const persisted: GroundedFact[] = []
    const admit = bindEmit({ isGrounded, persist: (n) => (persisted.push(n), asHash("cas-1")) }).admit

    const receipt = admit(node)

    expect(receipt.emitted).toBe(false) // any empty entry ⇒ ungrounded, fails closed
    expect(receipt.id).toBeUndefined()
    expect(persisted).toHaveLength(0) // count>0 alone must NOT admit it
  })

  it("admission is total — the partially-grounded node is a structured rejection, never a throw", () => {
    const partiallyGrounded: Grounding = {
      entries: [
        { anchor: anchor("fn a", "st-1"), path: "src/a.ts" },
        { anchor: anchor("fn b", ""), path: "src/b.ts" },
      ],
    }
    const admit = bindEmit({ isGrounded, persist: () => asHash("cas-1") }).admit
    expect(() => admit(predicateDeclaring("NA", partiallyGrounded))).not.toThrow()
  })
})
