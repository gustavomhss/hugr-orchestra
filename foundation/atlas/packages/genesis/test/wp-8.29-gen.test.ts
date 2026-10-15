// @atlas/genesis — test/wp-8.29-gen.test.ts   (WP-8.29.GEN — EPIC-29)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the seed-and-hand-off facet:
//   candidate-only writes + one batched ranked ratification pass (GEN-5: SCN-GEN-5a..5d-1) and the
//   Awareness sources that are never fabricated (GEN-9: SCN-GEN-9a..9d-1).
//   - SCN-GEN-5a-1 (happy) — genesis output is candidate-only: every written seed is `candidate`, 0 `ratified`.
//   - SCN-GEN-5b-1 (happy) — T0/contested facts are presented as ONE batched, ranked interview (size > 1, cap 20).
//   - SCN-GEN-5c-1 (guard) — the ONLY candidate→ratified edge passes through `interview` — no auto-promote edge.
//   - SCN-GEN-5d-1 (guard) — the interview is fed as one batch (>1 ranked Q), never a one-question-at-a-time drip.
//   - SCN-GEN-9a-1 (happy) — genesis seeds every facet's source: constitution←ratified T0, taste←CONVENTIONS.md@sha, mission stub.
//   - SCN-GEN-9b-1 (guard) — a source-less facet (mission, no ratified DEFINE) renders the UN-SEEDED sentinel.
//   - SCN-GEN-9c-1 (guard) — a source-less facet is NEVER fabricated: it stays UN-SEEDED with no invented value.
//   - SCN-GEN-9d-1 (guard) — the mission stub carries `unratified:true`; it never presents as ratified.
//
// The two facets are imported DIRECTLY from ../src/align.js and ../src/seed.js (the barrel is wired by the
// lead at SEAL). The human ratifier (ratification routing/tiers — CAMPAIGN-5 EPIC-15) and the source
// locator / root anchor (the index) are consumed as INJECTED seams + fakes: this WP FEEDS the batch and
// CREATES the sources; it does not define routing nor assemble the index. Grounded identity rides the
// SEALED @atlas/kernel mint (`asSubtreeHash`/`asNodeKey`), never a hand-rolled digest. Held-out `-2`
// fixtures are NOT transcribed.
//
// FLAG: interface_contract digest is `<filled-at-freeze>` (simulated) — resolved by disciplined judgment,
// not a real freeze hash.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { StructRef, Tier } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { Skeleton } from "@atlas/genesis"
import type { OpenQ } from "@atlas/genesis"
import {
  writeCandidates,
  assembleInterview,
  edgesToRatified,
  canAutoPromote,
  makeAlign,
  ROUTER_EDGES,
  INTERVIEW_CAP,
  type Ratifier,
  type InterviewBatch,
} from "../src/align.js"
import { makeSeed, facetOf, UN_SEEDED, type ConventionsSource } from "../src/seed.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

const ref = (id: string, kind: StructRef["kind"] = "block"): StructRef => ({
  kind,
  qualifiedPath: `pkg/${id}`,
  subtreeHash: asSubtreeHash(`st-${id}`),
})

const advisory = (id: string, tier: Tier): GroundedFact => ({
  kind: "advisory",
  id: asNodeKey(`nk-${id}`),
  tier,
  claimNorm: `claim-${id}`,
  grounding: { entries: [{ anchor: ref(id), path: `pkg/${id}` }] },
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
})

const contestedQ = (i: number): OpenQ => ({
  kind: "contested",
  site: ref(`q${i}`),
  rankReason: `blast×tier rank ${8 - i}`,
})

const skeleton = {} as unknown as Skeleton // opaque — read only through the injected index seams
const conventions: ConventionsSource = { path: "CONVENTIONS.md", anchor: ref("conventions", "file") }
const seededDeps = { locateConventions: () => conventions, rootAnchor: () => ref("root", "repo") }

// ── GEN-5 — candidate-only writes + one batched ranked ratification pass ─────────────────────────────

describe("WP-8.29.GEN — GEN-5 candidate-only writes + batched ratification", () => {
  it("SCN-GEN-5a-1 — genesis output is candidate-only (12 seeds, 0 ratified)", () => {
    const seeds = Array.from({ length: 12 }, (_, i) => advisory(`s${i}`, "T2"))
    const written = writeCandidates(seeds)
    expect(written).toHaveLength(12)
    expect(written.every((w) => w.status === "candidate")).toBe(true)
    expect(written.filter((w) => w.status === "ratified")).toHaveLength(0)
  })

  it("SCN-GEN-5b-1 — T0/contested facts become one batched, ranked interview (size > 1, cap 20)", () => {
    const open = Array.from({ length: 8 }, (_, i) => contestedQ(i))
    const { batch, deferred } = assembleInterview(open)
    expect(batch.questions).toHaveLength(8)
    expect(batch.questions.length).toBeGreaterThan(1) // one BATCH, not a single-question drip
    expect(batch.cap).toBe(INTERVIEW_CAP)
    expect(INTERVIEW_CAP).toBe(20)
    expect(deferred).toHaveLength(0)
    // the cap defers the tail beyond 20 — never a bigger single session
    const many = Array.from({ length: 23 }, (_, i) => contestedQ(i))
    const big = assembleInterview(many)
    expect(big.batch.questions).toHaveLength(20)
    expect(big.deferred).toHaveLength(3)
  })

  it("SCN-GEN-5c-1 — the only candidate→ratified edge passes through interview (no auto-promote)", () => {
    const toRatified = edgesToRatified()
    expect(toRatified).toHaveLength(1)
    expect(toRatified.every((e) => e.via === "interview")).toBe(true)
    // no candidate→ratified edge bypasses the human
    const bypass = ROUTER_EDGES.filter((e) => e.to === "ratified" && e.via !== "interview")
    expect(bypass).toHaveLength(0)
    expect(canAutoPromote()).toBe(false)
  })

  it("SCN-GEN-5d-1 — the interview is fed once as a batch of >1, never one-at-a-time", () => {
    const open = Array.from({ length: 8 }, (_, i) => contestedQ(i))
    let calls = 0
    let seen: InterviewBatch | undefined
    const ratifier: Ratifier = {
      ratify: (b) => {
        calls += 1
        seen = b
        return b.questions.map((_, i) => advisory(`r${i}`, "T0"))
      },
    }
    const ratified = makeAlign({ ratifier }).interview(open)
    expect(calls).toBe(1) // fed EXACTLY once — no per-question drip
    expect(seen?.questions.length).toBeGreaterThan(1)
    expect(ratified).toHaveLength(8)
  })
})

// ── GEN-9 — Awareness sources, never fabricated ──────────────────────────────────────────────────────

describe("WP-8.29.GEN — GEN-9 Awareness sources (never fabricated)", () => {
  it("SCN-GEN-9a-1 — genesis seeds every facet source (constitution, taste, mission stub)", () => {
    const ratifiedT0 = [advisory("inv1", "T0"), advisory("inv2", "T0")]
    const aware = makeSeed(seededDeps).seed(skeleton, ratifiedT0)
    expect(aware.constitution.state).toBe("seeded")
    expect(aware.constitution.grounding.length).toBeGreaterThan(0)
    expect(aware.taste.state).toBe("seeded")
    expect(aware.taste.grounding).toContainEqual(conventions.anchor)
    const stub = makeSeed(seededDeps).mission(skeleton)
    expect(stub.unratified).toBe(true)
  })

  it("SCN-GEN-9a-1 (teeth) — taste with no CONVENTIONS source renders UN-SEEDED, never a fabricated source", () => {
    const noConv = makeSeed({ ...seededDeps, locateConventions: () => undefined })
    const aware = noConv.seed(skeleton, [advisory("inv1", "T0")])
    expect(aware.taste.state).toBe("UN-SEEDED")
    expect(aware.taste.grounding).toHaveLength(0)
  })

  it("SCN-GEN-9b-1 — a source-less facet (mission, no ratified DEFINE) renders UN-SEEDED", () => {
    const aware = makeSeed(seededDeps).seed(skeleton, [advisory("inv1", "T0")])
    expect(aware.mission.state).toBe("UN-SEEDED")
  })

  it("SCN-GEN-9c-1 — a source-less facet is never fabricated (no invented mission value)", () => {
    const aware = makeSeed(seededDeps).seed(skeleton, [advisory("inv1", "T0")])
    expect(aware.mission.content).toContain(UN_SEEDED)
    expect(aware.mission.grounding).toHaveLength(0)
    // the per-facet rollup of an absent source is also UN-SEEDED (mirrors MEM-11)
    expect(facetOf(undefined).state).toBe("UN-SEEDED")
    expect(facetOf(undefined).content).toContain(UN_SEEDED)
  })

  it("SCN-GEN-9d-1 — the mission stub carries unratified:true, never presents as ratified", () => {
    const stub = makeSeed(seededDeps).mission(skeleton)
    expect(stub.unratified).toBe(true)
    expect((stub as { ratified?: unknown }).ratified).toBeUndefined()
  })
})
