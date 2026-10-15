// @atlas/genesis — test/wp-8.29-gen.heldout.test.ts  (WP-8.29.GEN — HELD-OUT gate, reviewer-authored)
//
// Cold transcription of the held_out:true `-2` goldens SCN-GEN-5a-2..5d-2 + 9a-2..9d-2 from
// docs/requirements/goldens-gen.md. Same oracle surface (../src/align.js + ../src/seed.js); DIFFERENT
// fixtures than the `-1` tests (beacon: 9 seeds, 6 T0/contested, billing/invoice.ts::finalize, STYLE.md@sha,
// a README-fabrication probe). Probes over-fit to the visible `-1` fixtures. No src changes.

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

const ref = (id: string, kind: StructRef["kind"] = "block"): StructRef => ({
  kind,
  qualifiedPath: `beacon/${id}`,
  subtreeHash: asSubtreeHash(`st-${id}`),
})
const advisory = (id: string, tier: Tier): GroundedFact => ({
  kind: "advisory",
  id: asNodeKey(`nk-${id}`),
  tier,
  claimNorm: `claim-${id}`,
  grounding: { entries: [{ anchor: ref(id), path: `beacon/${id}` }] },
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
})
const contestedQ = (i: number): OpenQ => ({ kind: "contested", site: ref(`fq${i}`), rankReason: `blast×tier ${9 - i}` })
const skeleton = {} as unknown as Skeleton
const styleMd: ConventionsSource = { path: "STYLE.md", anchor: ref("style", "file") }
const beaconDeps = { locateConventions: () => styleMd, rootAnchor: () => ref("root", "repo") }

describe("WP-8.29.GEN held-out — GEN-5 (beacon)", () => {
  it("SCN-GEN-5a-2 — 9 beacon seeds all candidate, 0 ratified (even self-asserted high-confidence)", () => {
    const seeds = Array.from({ length: 9 }, (_, i) => advisory(`b${i}`, "T0")) // top-tier, would-be self-promoters
    const written = writeCandidates(seeds)
    expect(written).toHaveLength(9)
    expect(written.filter((w) => w.status === "candidate")).toHaveLength(9)
    expect(written.filter((w) => w.status === "ratified")).toHaveLength(0)
  })

  it("SCN-GEN-5b-2 — 6 T0/contested → one batched, ranked interview (size>1, cap 20)", () => {
    const open = Array.from({ length: 6 }, (_, i) => contestedQ(i))
    const { batch, deferred } = assembleInterview(open)
    expect(batch.questions).toHaveLength(6)
    expect(batch.questions.length).toBeGreaterThan(1)
    expect(batch.cap).toBe(20)
    expect(deferred).toHaveLength(0)
    // rank order preserved
    expect(batch.questions.map((q) => q.site.qualifiedPath)).toEqual(open.map((q) => q.site.qualifiedPath))
  })

  it("SCN-GEN-5c-2 — finalize T0: only candidate→ratified edge is interview; no auto_promote(tier==T0)", () => {
    const toRatified = edgesToRatified()
    expect(toRatified).toHaveLength(1)
    expect(toRatified[0]!.via).toBe("interview")
    // mutation-verify: NO edge in the closed set reaches ratified by anything but interview
    expect(ROUTER_EDGES.filter((e) => e.to === "ratified" && e.via !== "interview")).toHaveLength(0)
    // the via union is closed to write|interview — no 'auto_promote' literal is even expressible
    expect(ROUTER_EDGES.every((e) => e.via === "write" || e.via === "interview")).toBe(true)
    expect(canAutoPromote()).toBe(false)
  })

  it("SCN-GEN-5d-2 — 6 contested beacon candidates fed as ONE batch of >1, never a drip", () => {
    const open = Array.from({ length: 6 }, (_, i) => contestedQ(i))
    let calls = 0
    let seen: InterviewBatch | undefined
    const ratifier: Ratifier = {
      ratify: (b) => {
        calls += 1
        seen = b
        return b.questions.map((_, i) => advisory(`fr${i}`, "T0"))
      },
    }
    const ratified = makeAlign({ ratifier }).interview(open)
    expect(calls).toBe(1)
    expect(seen?.questions.length).toBeGreaterThan(1)
    expect(ratified).toHaveLength(6)
  })
})

describe("WP-8.29.GEN held-out — GEN-9 (beacon, never fabricated)", () => {
  it("SCN-GEN-9a-2 — seeds constitution←T0 manifest, taste←STYLE.md@sha, mission stub", () => {
    const t0 = [advisory("inv1", "T0"), advisory("inv2", "T0"), advisory("inv3", "T0")]
    const aware = makeSeed(beaconDeps).seed(skeleton, t0)
    expect(aware.constitution.state).toBe("seeded")
    expect(aware.constitution.grounding.length).toBeGreaterThan(0)
    expect(aware.taste.state).toBe("seeded")
    expect(aware.taste.grounding).toContainEqual(styleMd.anchor)
    expect(aware.taste.content).toContain("STYLE.md")
    expect(makeSeed(beaconDeps).mission(skeleton).unratified).toBe(true)
  })

  it("SCN-GEN-9b-2 — mission facet with no DEFINE artifact renders UN-SEEDED (not an empty value)", () => {
    const aware = makeSeed(beaconDeps).seed(skeleton, [advisory("inv1", "T0")])
    expect(aware.mission.state).toBe("UN-SEEDED")
    expect(aware.mission.content).toContain(UN_SEEDED)
  })

  it("SCN-GEN-9c-2 — never fabricates a mission from a README-like source; stays UN-SEEDED", () => {
    // a plausible README object is NOT a ConventionsSource → must NOT synthesize a facet
    const readme = { path: "README.md", text: "We build beacons for everyone." }
    // note: README has a `path:string` — the guard must not mistake prose for a taste source without an anchor
    const f = facetOf(readme)
    // README has no `anchor` → not a ConventionsSource → UN-SEEDED (never a fabricated mission)
    expect(f.state).toBe("UN-SEEDED")
    expect(f.content).toContain(UN_SEEDED)
    expect(facetOf(undefined).state).toBe("UN-SEEDED")
    expect(facetOf(null).state).toBe("UN-SEEDED")
  })

  it("SCN-GEN-9d-2 — beacon mission stub carries unratified:true, never ratified", () => {
    const stub = makeSeed(beaconDeps).mission(skeleton)
    expect(stub.unratified).toBe(true)
    expect((stub as { ratified?: unknown }).ratified).toBeUndefined()
  })
})
