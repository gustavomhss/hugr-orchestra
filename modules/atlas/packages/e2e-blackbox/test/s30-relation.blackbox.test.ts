// @atlas/e2e-blackbox — test/s30-relation.blackbox.test.ts  (S30 — RELATION as a first-class 2-ended fact)
//
// NARRATIVE (ADR-0015 D2 / #99a). Atlas learns to ground a RELATION — "A depends-on B" — as a first-class
// fact, and to answer it BIDIRECTIONALLY. The whole product limit #99 named ("Atlas cannot ground a
// relation") lives in ONE structural fact: a relation spans TWO units that live in DIFFERENT files, and the
// shipped intrinsic identity path refuses exactly that shape on purpose — `primaryAnchorId` is the segment-
// wise longest-common `::` prefix of the cited anchors, so two anchors in two directories share NO prefix,
// the common unit is `''`, and `nodeKey` throws `DegenerateAnchorError` (the #103 wildcard-collision fix).
// A relation therefore CANNOT reuse `nodeKey`; it mints its own `relationKey` over the ORDERED endpoint pair
// and never calls `deepestCommonUnit`. This story proves the whole leg end-to-end THROUGH THE SHIPPED
// BINARIES — nothing here imports product runtime code into an assertion.
//
// The invariant this story exists to pin is ADR-0015's IDENTITY/FRESHNESS SPLIT, made observable:
//   • IDENTITY legs are the location-free `endpointA`/`endpointB` (the qualifiedPaths). They survive a pure
//     edit — the path text does not move when the bytes change — so `atlas relations` KEEPS finding the
//     relation after its subject file is edited: no false orphan.
//   • FRESHNESS legs are the two grounding entries' `subtreeHash`es. `driftDetect` AND-folds both (drift-if-
//     EITHER, for free), so the SAME reused oracle that `atlas reconcile` runs reports the relation DRIFTED
//     the moment either endpoint's bytes move, and FRESH again once they are restored. Drift = f(git state).
//
// THE CONTRAST that proves the crux is real (not "everything emits"): the SAME two cross-directory files,
// authored as an INTRINSIC multi-anchor advisory, are REFUSED at the write door with the degenerate-anchor
// refusal — the exact path a relation must bypass. Relation EMITS where intrinsic THROWS.
//
// Pure black-box: the real `atlas` CLI as a subprocess, asserted on exit code + rendered stdout + the bytes
// of the durable projection sidecar. Facts are AUTHORED with the product-lib helper (adversarial-fixtures.ts) only so
// their groundings re-derive FRESH; the write is then decided on identity alone.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { groundedMultiSymbolFact, groundedRelationFact } from "./adversarial-fixtures.js"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"

// Two files in DIFFERENT top-level directories ⇒ no common `::` ancestor ⇒ the intrinsic identity path is
// degenerate on this pair. `src/charge.ts` is the directed SUBJECT (endpointA, scope-owned); `vendor/lib.ts`
// is the OBJECT (endpointB). Each carries a top-level symbol so the multi-anchor CONTRAST can be authored.
const A = "src/charge.ts"
const B = "vendor/lib.ts"
const A_ORIGINAL = "export function charge() { return 1; }\n"
const FILES = {
  [A]: A_ORIGINAL,
  [B]: "export function dep() { return 2; }\n",
}

let repo: FixtureRepo
let genesis: string // the sha the relation was grounded at (the merge-base WITH drift after A is edited)
let priorActor: string | undefined
let priorRatify: string | undefined

/** The durable projection sidecar as RAW BYTES — absent ⇒ nothing ever landed. */
function projectionBytes(): string {
  const p = join(repo.repoPath, ".atlas", "projection.json")
  return existsSync(p) ? readFileSync(p, "utf8") : "<<ABSENT>>"
}

/** The rendered `  relation <kind> <A> -> <B> (<nodeKey>)` lines of a `atlas relations` verdict. */
function relationLines(stdout: string): string[] {
  return stdout.split("\n").filter((l) => l.trimStart().startsWith("relation "))
}

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // KNOW-8 ratifier — a T1 relation routes to full-ratify
  repo = makeFixtureRepo({ files: FILES, policy: scopedPolicy("src") })
  genesis = repo.sha()
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S30 — a relation grounds across two files where an intrinsic fact cannot", () => {
  it("THE CRUX: `(A, depends-on, B)` across two directories EMITS (exit 0) — the intrinsic wildcard is bypassed", () => {
    const rel = groundedRelationFact({ repoPath: repo.repoPath, fileA: A, fileB: B, relationKind: "depends-on" })
    const run = emitFact(repo, rel)
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    expect(run.stderr).toBe("")
    // it is DURABLE — one relation row landed.
    const proj = JSON.parse(projectionBytes()) as { current: readonly [string, { family?: string }][] }
    expect(proj.current).toHaveLength(1)
    expect(proj.current[0]![1].family).toBe("relation")
  })

  it("THE CONTRAST: the SAME two files as an INTRINSIC multi-anchor advisory are REFUSED (degenerate anchor)", () => {
    const before = projectionBytes()
    const diffuse = groundedMultiSymbolFact({
      repoPath: repo.repoPath,
      sites: [
        [A, "charge"],
        [B, "dep"],
      ],
      slot: "invariant",
      claim: "charge and dep agree",
    })
    const run = emitFact(repo, diffuse)
    expect(run.exitCode).not.toBe(0)
    expect(run.stdout).toContain("degenerate anchor: this grounding does not name ONE structural unit")
    expect(run.stderr).toBe("") // fail-CLOSED refusal, never an uncaught throw
    // the relation is BYTE-UNCHANGED — the refused intrinsic write touched nothing.
    expect(projectionBytes()).toBe(before)
  })
})

describe("S30 — the grounded relation is read BIDIRECTIONALLY and DIRECTED", () => {
  it("`atlas relations <A> out` finds the relation (A is the SUBJECT)", () => {
    const r = runAtlas(repo.repoPath, ["relations", A, "out"])
    expect(r.exitCode).toBe(0)
    const lines = relationLines(r.stdout)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`relation depends-on ${A} -> ${B}`)
  })

  it("`atlas relations <B> in` finds the SAME relation (B is the OBJECT)", () => {
    const r = runAtlas(repo.repoPath, ["relations", B, "in"])
    expect(r.exitCode).toBe(0)
    const lines = relationLines(r.stdout)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`relation depends-on ${A} -> ${B}`)
  })

  it("DIRECTED: `atlas relations <B> out` finds NOTHING — the relation points A->B, not B->A", () => {
    const r = runAtlas(repo.repoPath, ["relations", B, "out"])
    expect(r.exitCode).toBe(0)
    expect(relationLines(r.stdout)).toHaveLength(0)
    expect(r.stdout).toContain("0 edge(s)")
  })
})

describe("S30 — the identity/freshness split, observed end-to-end (ADR-0015)", () => {
  it("FRESHNESS leg: editing A's bytes makes `atlas reconcile <genesis>` report the relation DRIFTED", () => {
    // A pure edit of the SUBJECT file: its subtreeHash moves ⇒ the relation's entry[0] no longer re-derives
    // ⇒ the 2-entry AND-fold drifts ⇒ the reused oracle `atlas reconcile` runs detects it (drift = f(git state)).
    repo.commit({ [A]: "export function charge() { return 999; }\n// semantic edit\n" })
    const r = runAtlas(repo.repoPath, ["reconcile", genesis])
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("status: rejected")
  })

  it("IDENTITY leg SURVIVES the edit: `atlas relations <A> out` STILL finds the relation (no false orphan)", () => {
    // endpointA is the location-free qualifiedPath — the path text did NOT move when the bytes changed. The
    // relation keeps its identity even while its freshness has drifted: exactly the split ADR-0015 mandates.
    const r = runAtlas(repo.repoPath, ["relations", A, "out"])
    expect(r.exitCode).toBe(0)
    const lines = relationLines(r.stdout)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`relation depends-on ${A} -> ${B}`)
  })

  it("FRESH again: restoring A's exact bytes clears the drift — `atlas reconcile <genesis>` verdicts 0", () => {
    // Content restored to genesis bytes ⇒ the relation's grounding re-derives at HEAD ⇒ FRESH. The verdict
    // tracks the git STATE, not a history of edits.
    repo.commit({ [A]: A_ORIGINAL })
    const r = runAtlas(repo.repoPath, ["reconcile", genesis])
    expect(r.exitCode).toBe(0)
  })
})
