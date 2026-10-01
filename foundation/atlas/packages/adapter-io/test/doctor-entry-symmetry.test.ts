// @atlas/adapter-io — test/doctor-entry-symmetry.test.ts  (DOCTORSOURCE — classify + repair span EVERY entry)
//
// THE DEFECT THESE TEETH PIN. `drift` DETECTS over the whole grounding (`reDerives` → `driftDetect`, a
// conjunction over every citation) but used to CLASSIFY and REPAIR `entries[0]` alone. So a fact that drifted
// because a SECONDARY citation went stale still resolved its primary anchor at HEAD, read `mechanical`, and
// emitted a "repair" that swapped the primary anchor to effectively where it already was — while the entry
// that actually drifted was left untouched and the template stamped `freshness: 'FRESH'` regardless.
//
// TEETH (each fails on the pre-fix code, and the pre-fix code is transcribed below as `legacyReground` so the
// before/after is measurable in ONE run):
//   - a fact whose SECONDARY citation moved is classified FROM that entry (`anchorWas` = the secondary's
//     recorded anchor, not entry 0's) and repaired AT that entry.
//   - a fact whose SECONDARY citation ROTTED is `semantic` (retire), not `mechanical` — the fail-closed
//     direction: no automatic re-ground can make that fact whole, so no plan pretends to.
//   - the NEGATIVE direction, which matters as much: a fact whose PRIMARY drifted is classified and repaired
//     exactly as before. This block is GREEN on the pre-fix code too, by construction — it is the case that
//     already worked and the fix must not move it.
//   - `regroundTemplate`'s freshness is DERIVED: FRESH iff every entry was established, DRIFTED when the
//     repair was partial. It is never a constant.
//
// THE EMIT DOOR, MEASURED RATHER THAN ASSUMED (last block). The severity of the FRESH overstatement is
// bounded by `governed-emit.ts` gate 1, which re-derives the WHOLE grounding through `buildGate` and refuses
// a non-HOLDS node. This file measures that on the actual legacy payload: the legacy emit reads NA (refused),
// the fixed emit reads HOLDS, and the node's OWN `freshness` field is proven inert at the door (flipping it to
// DRIFTED on a genuinely fresh node still HOLDS). So the live defect was a misclassification plus a repair
// plan that could not land — NOT a false FRESH reaching the projection.
//
// ⚠ ALL temp paths under `os.tmpdir()` (CI-portable); the CAS lives OUTSIDE the fixture repo so it is never
// swept into a commit and can never perturb the tree the drift oracle reads.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hash, StructRef } from "@atlas/contracts"
import { build } from "@atlas/index"
import type { IndexNode } from "@atlas/index"
import { asHash, asNodeKey } from "@atlas/kernel"
import type { GroundedFact, StoreProjection } from "@atlas/knowledge"
import { walkFileTree } from "../src/fs.js"
import { createDiskStore } from "../src/store.js"
import { createRevIndex } from "../src/rev-index.js"
import type { RevIndex } from "../src/rev-index.js"
import { createDoctorSource, regroundTemplate } from "../src/doctor-source.js"
import { buildGate } from "../src/compose.js"

const HEAD = asHash("HEAD")

// Distinct bodies so no two files share a `subtreeHash` (`resolveBySubtreeAt` REFUSES an ambiguous content).
const PRIMARY_BODY = 'export const primary = "the citation that does not move";\n'
const SECONDARY_BODY = 'export const secondary = "the citation that moves house";\n'
const ROTTEN_V1 = 'export const rotten = "the citation that will be rewritten";\n'
const ROTTEN_V2 = 'export const rotten = "REWRITTEN — the recorded content is gone";\n'
const LEAD_BODY = 'export const lead = "the PRIMARY citation that moves house";\n'
const STABLE_BODY = 'export const stable = "a secondary citation that never moves";\n'

/** Find the built index node whose key ends with `suffix` (mirrors doctor-source.test.ts). */
function findBySuffix(node: IndexNode, suffix: string): IndexNode | undefined {
  if (node.key.endsWith(suffix)) return node
  for (const c of node.children) {
    const hit = findBySuffix(c, suffix)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** A grounded advisory fact over `entries` (given as [path, anchor] pairs, in recorded order). */
function seedFact(id: string, entries: readonly (readonly [string, StructRef])[]): GroundedFact {
  return {
    kind: "advisory",
    id: asNodeKey(id),
    tier: "T2",
    claimNorm: `a multi-cited claim (${id})`,
    grounding: { entries: entries.map(([path, anchor]) => ({ anchor, path })) },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope: "core",
  }
}

/**
 * THE PRE-FIX `regroundTemplate`, transcribed verbatim from `doctor-source.ts` at master `38f3f4b`:
 * rewrite `entries[0]`, keep the rest, stamp `FRESH` unconditionally. Kept here — and ONLY here — so the
 * legacy payload can be put in front of the real truth door and MEASURED instead of reasoned about.
 */
function legacyReground(fact: GroundedFact, anchorNow: StructRef): GroundedFact {
  const first = fact.grounding.entries[0]
  if (first === undefined) return fact
  const entries = [{ ...first, anchor: anchorNow }, ...fact.grounding.entries.slice(1)]
  return { ...fact, grounding: { entries }, freshness: "FRESH" } as GroundedFact
}

let repo: string
let cas: string
let revIndex: RevIndex
let source: ReturnType<typeof createDoctorSource>
let aPrimary: StructRef // src/a-primary.ts   — never moves
let bSecondary: StructRef // src/b-secondary.ts — renamed to src/z-secondary-moved.ts (content preserved)
let cRotten: StructRef // src/c-rotten.ts    — body rewritten (content gone)
let dLead: StructRef // src/d-lead.ts      — renamed to src/y-lead-moved.ts (content preserved)
let eStable: StructRef // src/e-stable.ts    — never moves
let secMech: GroundedFact

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-doctor-sym-"))
  cas = mkdtempSync(join(tmpdir(), "atlas-doctor-sym-cas-"))
  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: repo, stdio: "ignore" })
  mkdirSync(join(repo, "src"), { recursive: true })
  writeFileSync(join(repo, "src", "a-primary.ts"), PRIMARY_BODY)
  writeFileSync(join(repo, "src", "b-secondary.ts"), SECONDARY_BODY)
  writeFileSync(join(repo, "src", "c-rotten.ts"), ROTTEN_V1)
  writeFileSync(join(repo, "src", "d-lead.ts"), LEAD_BODY)
  writeFileSync(join(repo, "src", "e-stable.ts"), STABLE_BODY)
  git("init", "-q")
  git("config", "user.email", "doctor@atlas.test")
  git("config", "user.name", "atlas-doctor")
  git("config", "commit.gpgsign", "false")
  git("add", "-A")
  git("commit", "-q", "-m", "v1")

  // The RECORDED anchors, read from the v1 tree (== committed v1).
  const v1 = build(walkFileTree(repo), { documents: [] }).spatial
  const ref = (suffix: string): StructRef => {
    const n = findBySuffix(v1, suffix)!
    return { kind: "file", qualifiedPath: n.key, subtreeHash: n.subtreeHash }
  }
  aPrimary = ref("a-primary.ts")
  bSecondary = ref("b-secondary.ts")
  cRotten = ref("c-rotten.ts")
  dLead = ref("d-lead.ts")
  eStable = ref("e-stable.ts")

  const store = createDiskStore(join(cas, "cas"))
  // Entry order is the recorded order and is sorted by anchor path (Grounding: "sorted by anchor"), so in
  // every fact below entry 0 IS the primary and entry 1 IS the secondary.
  secMech = seedFact("sec-mech", [
    ["src/a-primary.ts", aPrimary],
    ["src/b-secondary.ts", bSecondary],
  ])
  const secRot = seedFact("sec-rot", [
    ["src/a-primary.ts", aPrimary],
    ["src/c-rotten.ts", cRotten],
  ])
  const leadMech = seedFact("lead-mech", [
    ["src/d-lead.ts", dLead],
    ["src/e-stable.ts", eStable],
  ])
  const chSec = store.put(secMech)
  const chRot = store.put(secRot)
  const chLead = store.put(leadMech)

  // v2 — move the anchors: (a) RENAME b-secondary.ts (content preserved ⇒ mechanically re-groundable),
  // (b) REWRITE c-rotten.ts (recorded content gone ⇒ semantic), (c) RENAME d-lead.ts, the PRIMARY of the
  // third fact (the case that already worked). a-primary.ts / e-stable.ts are untouched.
  rmSync(join(repo, "src", "b-secondary.ts"))
  writeFileSync(join(repo, "src", "z-secondary-moved.ts"), SECONDARY_BODY)
  writeFileSync(join(repo, "src", "c-rotten.ts"), ROTTEN_V2)
  rmSync(join(repo, "src", "d-lead.ts"))
  writeFileSync(join(repo, "src", "y-lead-moved.ts"), LEAD_BODY)
  git("add", "-A")
  git("commit", "-q", "-m", "v2")

  // Built AFTER v2 so the memoized HEAD is v2 (a process pins HEAD once).
  revIndex = createRevIndex(repo)
  const projection: StoreProjection = {
    current: new Map([
      ["sec-mech", { nodeKey: "sec-mech", family: "advisory", contentHash: chSec, claims: [] }],
      ["sec-rot", { nodeKey: "sec-rot", family: "advisory", contentHash: chRot, claims: [] }],
      ["lead-mech", { nodeKey: "lead-mech", family: "advisory", contentHash: chLead, claims: [] }],
    ]),
    cas: new Set([chSec, chRot, chLead]),
  }
  store.persistProjection(projection)
  source = createDoctorSource(store, revIndex)
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
  rmSync(cas, { recursive: true, force: true })
})

describe("DOCTORSOURCE — classification and repair span every grounding entry", () => {
  it("the fixture really does drift on the SECONDARY only — the primary still re-derives at HEAD", () => {
    // Without this, every assertion below could pass against a fixture where nothing is what it claims.
    expect(revIndex.resolveAnchorAt("HEAD", "src/a-primary.ts")?.subtreeHash).toBe(aPrimary.subtreeHash)
    expect(revIndex.resolveAnchorAt("HEAD", "src/b-secondary.ts")).toBeUndefined() // the recorded path is gone
    expect(revIndex.resolveBySubtreeAt("HEAD", String(bSecondary.subtreeHash))?.qualifiedPath).toBe(
      "src/z-secondary-moved.ts",
    )
    expect(revIndex.reDerives(secMech, HEAD)).toBe(false) // detection sees it (it always did)
  })

  it("a SECONDARY move is classified FROM the entry that drifted (pre-fix: keyed on entry 0)", () => {
    const item = source.drift("sec-mech")
    expect(item).toBeDefined()
    expect(item!.class).toBe("mechanical")
    // TEETH: the pre-fix classifier answered `anchorWas = entries[0].anchor` = 'src/a-primary.ts' and
    // `anchorNow` = that same file at HEAD — a "move" from a path to itself.
    expect(item!.anchorWas.qualifiedPath).toBe("src/b-secondary.ts")
    expect(item!.anchorNow.qualifiedPath).toBe("src/z-secondary-moved.ts")
    expect(item!.anchorWas.qualifiedPath).not.toBe(item!.anchorNow.qualifiedPath)
  })

  it("a SECONDARY move is REPAIRED at that entry, and the repair actually re-derives at HEAD", () => {
    const plan = source.plan("sec-mech")
    expect(plan).toBeDefined()
    expect(plan!.action).toBe("reground")
    const entries = plan!.emit.grounding.entries
    expect(entries.length).toBe(2)
    // entry 0 (never drifted) is passed through at its recorded anchor …
    expect(entries[0]!.anchor).toEqual(aPrimary)
    // … and entry 1 — the one that actually drifted — is re-anchored. TEETH: pre-fix this was untouched.
    expect(entries[1]!.anchor.qualifiedPath).toBe("src/z-secondary-moved.ts")
    expect(entries[1]!.anchor.subtreeHash).toBe(bSecondary.subtreeHash) // same content, new home
    expect(plan!.emit.freshness).toBe("FRESH")
    // The FRESH stamp is EARNED, not asserted: the emitted fact re-derives end to end at HEAD.
    expect(revIndex.reDerives(plan!.emit, HEAD)).toBe(true)
  })

  it("a ROTTED secondary makes the whole fact SEMANTIC — no plan that cannot land (pre-fix: mechanical)", () => {
    const item = source.drift("sec-rot")
    expect(item).toBeDefined()
    // TEETH: pre-fix, entry 0 (`src/a-primary.ts`) still resolved by content at HEAD, so this read
    // `mechanical` and emitted a reground — for a fact whose second citation had rotted away.
    expect(item!.class).toBe("semantic")
    expect(item!.anchorWas.qualifiedPath).toBe("src/c-rotten.ts") // keyed on the citation that rotted
    expect(item!.anchorNow.qualifiedPath).toBe("src/c-rotten.ts") // the path survives, its content does not
    expect(item!.anchorNow.subtreeHash).not.toBe(cRotten.subtreeHash)

    const plan = source.plan("sec-rot")
    expect(plan!.action).toBe("retire")
    expect(plan!.emit.authoring).toBe("SUPERSEDED")
    expect(plan!.emit.grounding.entries.map((e) => e.anchor)).toEqual([aPrimary, cRotten]) // body untouched
  })

  // ── THE NEGATIVE DIRECTION — this block is GREEN on the pre-fix code and MUST STAY green ───────────────
  it("a PRIMARY move is classified and repaired exactly as before (unchanged behaviour)", () => {
    const item = source.drift("lead-mech")
    expect(item).toBeDefined()
    expect(item!.class).toBe("mechanical")
    expect(item!.anchorWas).toEqual(dLead)
    expect(item!.anchorNow.qualifiedPath).toBe("src/y-lead-moved.ts")
    expect(item!.anchorNow.subtreeHash).toBe(dLead.subtreeHash)

    const plan = source.plan("lead-mech")
    expect(plan!.action).toBe("reground")
    const entries = plan!.emit.grounding.entries
    expect(entries[0]!.anchor.qualifiedPath).toBe("src/y-lead-moved.ts") // the primary, re-anchored
    expect(entries[0]!.path).toBe("src/d-lead.ts") // the human path field is not rewritten (as before)
    expect(entries[1]!.anchor).toEqual(eStable) // the fresh secondary, value-identical
    expect(plan!.emit.freshness).toBe("FRESH")
    expect(revIndex.reDerives(plan!.emit, HEAD)).toBe(true)
  })
})

describe("regroundTemplate — freshness is derived from the repair, never stamped", () => {
  it("every entry established ⇒ FRESH; a PARTIAL repair ⇒ DRIFTED, and the unestablished entry is left alone", () => {
    const moved = revIndex.resolveBySubtreeAt("HEAD", String(bSecondary.subtreeHash))!

    const total = regroundTemplate(secMech, [aPrimary, moved])
    expect(total.freshness).toBe("FRESH")
    expect(total.grounding.entries.map((e) => e.anchor)).toEqual([aPrimary, moved])

    // TEETH: pre-fix this stamped FRESH on a template that had re-derived nothing at entry 1.
    const partial = regroundTemplate(secMech, [aPrimary, undefined])
    expect(partial.freshness).toBe("DRIFTED")
    expect(partial.grounding.entries[1]!.anchor).toEqual(bSecondary) // the recorded anchor, untouched
    expect(regroundTemplate(secMech, [aPrimary]).freshness).toBe("DRIFTED") // a short array is partial too
    expect(regroundTemplate(secMech, []).freshness).toBe("DRIFTED")
  })

  it("an anchorless grounding is returned unchanged (totality)", () => {
    const anchorless = { ...secMech, grounding: { entries: [] } } as GroundedFact
    expect(regroundTemplate(anchorless, [aPrimary])).toBe(anchorless)
  })
})

// ── WHAT THE EMIT DOOR ACTUALLY DOES WITH THE LEGACY PAYLOAD — measured, not assumed ────────────────────
describe("the truth door bounds the severity of the FRESH overstatement", () => {
  it("the legacy FRESH-stamped reground is REFUSED, the fixed one HOLDS, and the stamp itself is inert", () => {
    const gate = buildGate(revIndex.axesAt("HEAD")) // the EXACT snapshot the doctor classified against
    const legacyAnchor = revIndex.resolveBySubtreeAt("HEAD", String(aPrimary.subtreeHash))!
    const legacy = legacyReground(secMech, legacyAnchor)

    // The legacy repair moved the primary to where it already was and claimed FRESH …
    expect(legacy.freshness).toBe("FRESH")
    expect(legacy.grounding.entries[0]!.anchor.qualifiedPath).toBe("src/a-primary.ts")
    expect(legacy.grounding.entries[1]!.anchor).toEqual(bSecondary) // still the stale citation
    // … and the door refuses it: `gateHolds` re-derives the WHOLE grounding, so the stale entry 1 sinks it.
    // `governed-emit.ts` gate 1 turns a non-HOLDS verdict into REJECTED_UNGROUNDED and persists NOTHING.
    expect(gate.gateHolds(legacy, HEAD)).not.toBe("HOLDS")

    // The fixed repair passes the same door.
    expect(gate.gateHolds(source.plan("sec-mech")!.emit, HEAD)).toBe("HOLDS")

    // And the node's OWN `freshness` field is never read by the door — it is re-derived from the index. So
    // the overstated stamp could not have laundered anything past it, in either direction.
    const misStamped = { ...source.plan("sec-mech")!.emit, freshness: "DRIFTED" } as GroundedFact
    expect(gate.gateHolds(misStamped, HEAD)).toBe("HOLDS")
  })
})
