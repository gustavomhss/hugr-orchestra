// @atlas/adapter-io — test/doctor-source.test.ts  (DOCTORSOURCE — the real read-only DoctorSource port)
//
// The teeth for the REAL `DoctorSource`: a temp git repo whose grounded facts are seeded at v1 anchors, then
// committed as v2 = HEAD so the recorded anchors MOVE in TWO distinct ways. Over that repo:
//   - `hotSetSize()` reflects the current-node count of the durable projection.
//   - `lineage()` returns the CAS chain (scope-filtered).
//   - `drift()` returns a `DriftItem` classified `semantic` when the recorded CONTENT is gone at HEAD (a
//     body rewrite) and `mechanical` when the SAME content re-derives at a NEW location (a file rename);
//     `undefined` for the stable fact / an unknown fact (totality).
//   - `plan()` returns a well-formed `GroundedFact` (retire on semantic, reground on mechanical).
// TEETH: a mutant making `drift` always-undefined flips the drifted golden RED; a mutant making `hotSetSize`
// return 0 flips the count golden RED. THE SELF-COMPARE MUTANT (the WP-N9 bug): classifying via
// `reDerives(grounded, HEAD) ? 'mechanical' : 'semantic'` re-checks the recorded hash on the SAME anchor —
// a detected drift is then ALWAYS DRIFTED ⇒ ALWAYS `semantic`, so the mechanical golden below flips RED. The
// fix classifies by whether the recorded CONTENT re-derives ANYWHERE at HEAD (`resolveBySubtreeAt`), which
// makes the moved-but-alive claim `mechanical`. ⚠ ALL temp paths under `os.tmpdir()` (CI-portable).

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { StructRef } from "@atlas/contracts"
import { build } from "@atlas/index"
import type { IndexNode } from "@atlas/index"
import { asNodeKey } from "@atlas/kernel"
import type { GroundedFact, StoreProjection } from "@atlas/knowledge"
import { walkFileTree } from "../src/fs.js"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { createRevIndex } from "../src/rev-index.js"
import { createDoctorSource, regroundTemplate } from "../src/doctor-source.js"

const UTIL_V1 = "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n"
const UTIL_V2 = "export function greet(name: string): string {\n  return `HELLO ${name}!!`;\n}\n"
// The MECHANICAL case: a file whose EXACT content is preserved across a RENAME (`keep.ts` → `moved.ts`), so
// the recorded content re-derives at a NEW path at HEAD — the anchor moved but the claim survives.
const KEEP_BODY = "export const keeper = 42;\n"

/** Find the built index node whose key ends with `suffix` — robust to whatever key format `build` uses. */
function findBySuffix(node: IndexNode, suffix: string): IndexNode | undefined {
  if (node.key.endsWith(suffix)) return node
  for (const c of node.children) {
    const hit = findBySuffix(c, suffix)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** A grounded advisory fact anchored at `anchor`, scoped to `scope`. */
function seedFact(id: string, anchor: StructRef, scope: string): GroundedFact {
  return {
    kind: "advisory",
    id: asNodeKey(id),
    tier: "T2",
    claimNorm: `a grounded claim (${id})`,
    grounding: { entries: [{ anchor, path: "src/util.ts" }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope,
  }
}

let repo: string
let store: DiskStore
let source: ReturnType<typeof createDoctorSource>
let anchorV1: StructRef
let anchorV2: StructRef
let anchorKeep: StructRef // the RECORDED anchor of the renamed (mechanical) fact
let driftFactV1: GroundedFact
let chDrift: string
let chStable: string
let chMech: string

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-doctor-src-"))
  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: repo, stdio: "ignore" })
  mkdirSync(join(repo, "src"), { recursive: true })
  writeFileSync(join(repo, "src", "util.ts"), UTIL_V1)
  writeFileSync(join(repo, "src", "keep.ts"), KEEP_BODY)
  git("init", "-q")
  git("config", "user.email", "doctor@atlas.test")
  git("config", "user.name", "atlas-doctor")
  git("config", "commit.gpgsign", "false")
  git("add", "-A")
  git("commit", "-q", "-m", "v1")

  // v1 anchors — the RECORDED grounding anchors, read from the v1 working tree (== committed v1).
  const v1 = build(walkFileTree(repo), { documents: [] }).spatial
  const nodeV1 = findBySuffix(v1, "util.ts")!
  anchorV1 = { kind: "file", qualifiedPath: nodeV1.key, subtreeHash: nodeV1.subtreeHash }
  const nodeKeep = findBySuffix(v1, "keep.ts")!
  anchorKeep = { kind: "file", qualifiedPath: nodeKeep.key, subtreeHash: nodeKeep.subtreeHash }
  store = createDiskStore(join(repo, ".atlas", "cas"))
  driftFactV1 = seedFact("fact-drift", anchorV1, "core")
  chDrift = store.put(driftFactV1)
  chMech = store.put(seedFact("fact-mech", anchorKeep, "core"))

  // Move the anchors: (a) REWRITE util.ts's body (the recorded content is gone ⇒ semantic), and (b) RENAME
  // keep.ts → moved.ts with IDENTICAL content (the recorded content re-derives at a new path ⇒ mechanical).
  writeFileSync(join(repo, "src", "util.ts"), UTIL_V2)
  rmSync(join(repo, "src", "keep.ts"))
  writeFileSync(join(repo, "src", "moved.ts"), KEEP_BODY)
  git("add", "-A")
  git("commit", "-q", "-m", "v2")

  // The DoctorSource's revIndex is created AFTER v2 so its memoized HEAD resolves to v2 (a process pins HEAD
  // once). The stable fact is anchored at the v2 HEAD anchor, so it does NOT drift.
  const revIndex = createRevIndex(repo)
  anchorV2 = revIndex.resolveAnchorAt("HEAD", anchorV1.qualifiedPath)!
  const stableFact = seedFact("fact-stable", anchorV2, "core")
  chStable = store.put(stableFact)

  const projection: StoreProjection = {
    current: new Map([
      ["fact-drift", { nodeKey: "fact-drift", family: "advisory", contentHash: chDrift, claims: [] }],
      ["fact-mech", { nodeKey: "fact-mech", family: "advisory", contentHash: chMech, claims: [] }],
      ["fact-stable", { nodeKey: "fact-stable", family: "advisory", contentHash: chStable, claims: [] }],
    ]),
    cas: new Set([chDrift, chMech, chStable]),
  }
  store.persistProjection(projection)
  source = createDoctorSource(store, revIndex)
})

afterAll(() => rmSync(repo, { recursive: true, force: true }))

describe("DOCTORSOURCE — the real read-only DoctorSource port", () => {
  it("hotSetSize() reflects the durable current-node count (TEETH: a 0-returning mutant flips this RED)", () => {
    expect(source.hotSetSize()).toBe(3)
  })

  it("lineage() returns the CAS chain, scope-filtered", () => {
    const all = source.lineage()
    expect([...all].sort()).toEqual([chDrift, chMech, chStable].sort())
    expect([...source.lineage("core")].sort()).toEqual([chDrift, chMech, chStable].sort()) // all in scope core
    expect(source.lineage("nonexistent-scope")).toEqual([]) // no node in that scope
  })

  it("drift(fact) classifies a rewritten unit SEMANTIC (recorded content gone at HEAD)", () => {
    const item = source.drift("fact-drift")
    expect(item).toBeDefined()
    expect(item!.fact).toBe("fact-drift")
    expect(item!.anchorWas.subtreeHash).toBe(anchorV1.subtreeHash) // the RECORDED (v1) anchor
    expect(item!.anchorNow.subtreeHash).toBe(anchorV2.subtreeHash) // the HEAD (v2) anchor
    expect(item!.anchorNow.subtreeHash).not.toBe(item!.anchorWas.subtreeHash) // it really moved
    expect(item!.class).toBe("semantic") // the recorded content re-derives NOWHERE at HEAD ⇒ broken
  })

  it("drift(fact) classifies a content-preserving RENAME MECHANICAL (SELF-COMPARE MUTANT flips this RED)", () => {
    const item = source.drift("fact-mech")
    expect(item).toBeDefined()
    expect(item!.fact).toBe("fact-mech")
    expect(item!.anchorWas.qualifiedPath).toBe("src/keep.ts") // the RECORDED path (pre-rename)
    // The claim MOVED but its exact content re-derives at HEAD — re-groundable to the new location.
    expect(item!.class).toBe("mechanical")
    expect(item!.anchorNow.qualifiedPath).toBe("src/moved.ts") // the NEW location the content lives at
    expect(item!.anchorNow.subtreeHash).toBe(anchorKeep.subtreeHash) // SAME content ⇒ same subtreeHash
    // MUTANT (the WP-N9 bug): `reDerives(grounded, HEAD) ? 'mechanical' : 'semantic'` re-checks the recorded
    // hash on the SAME (gone) anchor ⇒ DRIFTED ⇒ this would be `semantic` — the two verdicts could never
    // disagree. Asserting `mechanical` here kills that self-compare.
  })

  it("drift(fact) is undefined when the anchor is stable, and for an unknown fact (totality)", () => {
    expect(source.drift("fact-stable")).toBeUndefined()
    expect(source.drift("no-such-fact")).toBeUndefined()
    expect(() => source.drift("no-such-fact")).not.toThrow()
  })

  it("plan(fact) returns a well-formed GroundedFact — retire on semantic, reground on mechanical", () => {
    const retire = source.plan("fact-drift")
    expect(retire).toBeDefined()
    expect(retire!.action).toBe("retire")
    expect(retire!.emit.kind).toBe("advisory") // a real, well-formed GroundedFact
    expect(retire!.emit.grounding.entries.length).toBeGreaterThan(0)
    expect(retire!.emit.authoring).toBe("SUPERSEDED") // tagged for retire

    const reground = source.plan("fact-mech")
    expect(reground).toBeDefined()
    expect(reground!.action).toBe("reground") // BOTH plan verdicts reachable
    expect(reground!.emit.kind).toBe("advisory")
    expect(reground!.emit.grounding.entries[0]!.anchor.qualifiedPath).toBe("src/moved.ts") // re-anchored
    expect(reground!.emit.freshness).toBe("FRESH") // freshness reset on re-ground

    expect(source.plan("fact-stable")).toBeUndefined() // no drift ⇒ no plan
    expect(source.plan("no-such-fact")).toBeUndefined()
  })

  it("regroundTemplate produces a well-formed re-grounded fact (its one entry re-anchored at HEAD)", () => {
    // `resolved` is POSITIONAL over the grounding entries; this fact carries exactly one, so the whole
    // repair is `[anchorV2]` — total, hence the earned FRESH. The multi-entry behaviour (a partial repair
    // stamping DRIFTED, a secondary-only drift) is pinned in `doctor-entry-symmetry.test.ts`.
    const emit = regroundTemplate(driftFactV1, [anchorV2])
    expect(emit.kind).toBe("advisory")
    expect(emit.grounding.entries[0]!.anchor.subtreeHash).toBe(anchorV2.subtreeHash) // re-grounded at HEAD
    expect(emit.freshness).toBe("FRESH")
    expect(emit.grounding.entries[0]!.anchor.subtreeHash).not.toBe(anchorV1.subtreeHash)
  })
})
