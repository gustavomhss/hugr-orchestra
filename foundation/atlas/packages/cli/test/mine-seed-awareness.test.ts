// @atlas/cli — test/mine-seed-awareness.test.ts  (WP-8.29.GEN · GEN-9 — seed.ts is a SHIPPED production caller)
//
// `seed.ts` became SHIPPED the day `mine.ts` invoked `makeSeed(...).seed(...)` at the end of every pass
// (the reference-model-guard ledger row was DELETED — the module has a production caller). These the WIRE,
// the teeth, and the honest stopped-point:
//
//   • GEN-9c (teeth) — the seeded `Awareness` on a candidate-only mine pass renders `constitution`
//     UN-SEEDED (the run's ratified set is structurally `[]`), NEVER a fabricated line, while `taste`
//     (CONVENTIONS.md@sha) is SEEDED. Byte-identical across two runs (GEN-9b / MEM-11d).
//     THIS IS THE PERMANENT MUTATION PROBE: revert the wire to fabricate a seeded `constitution` from the
//     staged candidates (or to synthesize a facet off nothing) and the UN-SEEDED assertions below go RED.
//   • GEN-9a / MEM-11d — a repo that DOES hold a ratified/definite set seeds the Awareness facets SEEDED,
//     byte-identical across two reads, through the EXISTING awareness store `atlas memory-awareness` reads.
//   • GEN-5 / ADR-0008 (stopped-point) — the mine path's candidate hand-off is CANDIDATE-ONLY: nothing is
//     auto-promoted to the knowledge projection (the projection doors stay trapped), so `ratified` is 0 by
//     construction and constitution stays UN-SEEDED until a curator runs the governed promote door.
//
// ADR-0008 is the spine: this suite's fixtures trap the knowledge-projection doors EXACTLY like every mine
// fixture does — the seed step must never read the projection, or the trap fires and REDs the pass.

import { describe, it, expect, afterAll } from "vitest"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { awarenessBytes } from "@atlas/memory"
import { UN_SEEDED } from "@atlas/genesis"
import type { CurrentNode } from "@atlas/knowledge"
import { createDiskStore, createAwarenessStore } from "@atlas/adapter-io"
import { driveMinePass } from "../src/mine.js"
import type { MineDeps } from "../src/mine.js"
import {
  budget,
  depsOf,
  FRONTIER,
  gateEmitAll,
  makeIndexedRepo,
  cleanupIndexedRepos,
  stagingFake,
} from "./mine-fixtures.js"

// ── the harness: a REAL indexed repo (git-tracked + SCIP) with a CONVENTIONS.md ─────────────────────────
let dir: string | undefined
afterAll(cleanupIndexedRepos)

/** An indexed repo + `CONVENTIONS.md` — so `taste` has a real source and `createAwarenessStore` can derive. */
function repoWithConventions(): string {
  const d = makeIndexedRepo()
  writeFileSync(join(d, "CONVENTIONS.md"), "# Conventions\n\nPrefer small functions.\n")
  return d
}

function depsOver(d: string, over: Partial<MineDeps> = {}): MineDeps {
  return depsOf({
    store: over.store ?? createDiskStore(join(d, ".atlas", "cas")),
    gate: over.gate ?? gateEmitAll(),
    budget: budget(FRONTIER.length),
  })
}

// ── GEN-9c teeth: a candidate-only mine pass NEVER fabricates an Awareness facet ───────────────────────
describe("WP-8.29.GEN — the mine path seeds Awareness from the run's OWN ratified/definite set (never fabricated)", () => {
  // A mine pass is candidate-only (GEN-5): `report.ratified` is structurally `[]`, so a faithful wire MUST
  // render `constitution` UN-SEEDED — a repo that has ratified nothing gets no invented constitution line.
  it("GEN-9c — source-less facets on a candidate-only run render UN-SEEDED, never fabricated", () => {
    const d = repoWithConventions()
    const pass = driveMinePass(d, depsOver(d))
    expect(pass.report.ratified).toHaveLength(0) // premise: the run ratified nothing
    // constitution has no ratified T0 source ⇒ the labeled sentinel, with NOTHING invented:
    expect(pass.seed.constitution.state).toBe(UN_SEEDED)
    expect(pass.seed.constitution.content).toContain(UN_SEEDED)
    expect(pass.seed.constitution.grounding).toHaveLength(0)
    // taste HAS a source (CONVENTIONS.md@sha) ⇒ seeded; the mission stub stays unratified.
    expect(pass.seed.taste.state).toBe("seeded")
    expect(pass.seed.taste.content).toContain("CONVENTIONS.md@sha")
  })

  it("GEN-9b / MEM-11d — the seeded Awareness is byte-identical across two runs", () => {
    const d = repoWithConventions()
    const first = driveMinePass(d, depsOver(d)).seed
    const second = driveMinePass(d, depsOver(d)).seed // a rerun over the unchanged repo
    expect(Buffer.from(awarenessBytes(first))).toEqual(Buffer.from(awarenessBytes(second)))
  })
})

// ── GEN-9a / MEM-11d: a repo WITH a ratified/definite set seeds SEEDED through the store memory-awareness reads
describe("GEN-9a — a repo with a ratified/definite set reflects SEEDED Awareness through the existing store", () => {
  it("createAwarenessStore (the `atlas memory-awareness` read surface) renders SEEDED constitution, byte-identical twice", () => {
    const d = repoWithConventions()
    // a ratified T0 invariant already in the knowledge projection — the "repo with a definite set".
    const t0: CurrentNode = {
      nodeKey: "nk-ratified-t0",
      family: "advisory",
      tier: "T0",
      contentHash: "ch-t0",
      claims: ["the ratified invariant"],
    }
    createDiskStore(join(d, ".atlas", "cas")).persistProjection({
      current: new Map([[t0.nodeKey, t0]]),
      cas: new Set(["ch-t0"]),
    })
    const store = createAwarenessStore(d)
    const a1 = store.read()
    expect(a1.constitution.state).toBe("seeded")
    expect(a1.constitution.content).toContain("1 ratified T0 invariant")
    expect(a1.taste.state).toBe("seeded") // CONVENTIONS.md present
    expect(Buffer.from(store.bytes())).toEqual(Buffer.from(awarenessBytes(store.read()))) // MEM-11d: byte-identical twice
  })

  it("GEN-9c teeth — the SAME store over a repo with NO ratified set renders constitution UN-SEEDED (a repo whose projection is empty)", () => {
    const d = repoWithConventions() // no ratified T0 written
    const a = createAwarenessStore(d).read()
    expect(a.constitution.state).toBe(UN_SEEDED)
    expect(a.constitution.grounding).toHaveLength(0)
  })
})

// ── GEN-5 / ADR-0008: the candidate hand-off is CANDIDATE-ONLY — nothing auto-promotes (the stopped-point)
describe("GEN-5 — the mine path's candidate hand-off NEVER auto-promotes into the knowledge projection", () => {
  it("the pass stages candidates and ratifies nothing; the projection doors stay trapped (ADR-0008)", () => {
    const fx = stagingFake()
    const pass = driveMinePass("fix-repo", depsOf({ store: fx.store, budget: budget(FRONTIER.length) }))
    // every write is a CANDIDATE (never a ratified T0), and none reaches the governed projection.
    expect(pass.report.seeded.length).toBe(FRONTIER.length) // the pass DID produce candidates…
    expect(pass.report.ratified).toHaveLength(0) // …and ratified none of them (GEN-5a)
    expect(pass.seed.constitution.state).toBe(UN_SEEDED) // no ratified set ⇒ constitution UN-SEEDED, never promoted
    expect(fx.staged.length).toBeGreaterThan(0) // candidates durable in the staging sidecar
  })
})
