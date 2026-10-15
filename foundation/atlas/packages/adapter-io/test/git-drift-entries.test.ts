// @atlas/adapter-io — test/git-drift-entries.test.ts  (#185 — REQ-ADAPTER-9f / SCN-ADAPTER-9f-1/9f-2)
//
// THE THIRD INSTANCE OF THE ENTRY-0 ASYMMETRY, AND THE WORST OF THE THREE — CLOSED HERE. `git-drift.ts`
// `driftAt` is the DETECTOR that decides which facts reach `atlas-reconcile`'s classifier at all. It used to
// read `f.grounding.entries[0]` and nothing else, so a fact whose PRIMARY anchor was intact and whose
// NON-PRIMARY citation had rotted away was never surfaced as a pair — not detected, not classified, not
// reported, `exitCode 0`. `test/reconcile-entry-symmetry.test.ts`'s `MEASURED GAP` case recorded this reach
// as a pre-existing, DELIBERATELY UNCLOSED gap; this file is where it closes and that case is retired.
//
// Reproduces the SAME four-combination fixture that previous card used (`reconcile-entry-symmetry.test.ts`'s
// `makeGateFix`), rebuilt standalone here rather than imported (nothing there is exported) and split into TWO
// repositories instead of one seeded two ways: `fourFactRepo` (all four combinations, `full`) and
// `cleanRepo` (ONLY the two facts with no rotted citation at all — `sec-mech`, `lead-mech`). That second split
// is a deliberate DIFFERENCE from the prior fixture: its own "clean" control still contained `sec-rot` (a fact
// whose secondary WAS rotted, merely invisible to the pre-fix detector), so it never actually exercised
// "a knowledge base with no rotted citation" — it exercised "a knowledge base whose rot the detector could not
// see". `cleanRepo` here contains no rot at all, so SCN-ADAPTER-9f-2's exit-0 claim is honest post-fix.
//
// Everything is driven through the REAL `composeRuntime` → `WiredHandler` → `atlas-reconcile`, never a
// replicated predicate — the shipped path is what is measured.

import { describe, it, expect, afterAll, beforeAll } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hash, NodeKey, StructRef } from "@atlas/contracts"
import type { CurrentNode, GroundedFact, StoreProjection } from "@atlas/knowledge"
import type { ReconcileOut, Tool } from "@atlas/tools"
import { composeRuntime } from "../src/compose.js"
import { createDiskStore } from "../src/store.js"
import { createRevIndex } from "../src/rev-index.js"
import { createDriftSource } from "../src/git-drift.js"
import { makeFixScip } from "./harness/fix-scip.js"

const RECONCILE = "atlas-reconcile" as Tool
const CAS_REL = join(".atlas", "cas")

// Distinct bodies ⇒ no two files share a `subtreeHash` (`resolveBySubtreeAt` refuses ambiguous content).
const BODY = {
  primaryA: 'export const primaryA = "sec-mech: primary, never touched";\n',
  secMechV1: 'export const secMech = "sec-mech: secondary, about to move house";\n',
  primaryB: 'export const primaryB = "sec-rot: primary, never touched";\n',
  secRotV1: 'export const secRot = "sec-rot: secondary, about to be rewritten";\n',
  secRotV2: 'export const secRot = "REWRITTEN — sec-rot: the recorded content is gone";\n',
  leadV1: 'export const lead = "lead-mech: primary, about to move house";\n',
  secondaryC: 'export const secondaryC = "lead-mech: secondary, never touched";\n',
  mixedLeadV1: 'export const mixedLead = "mixed: primary, about to move house";\n',
  mixedRotV1: 'export const mixedRot = "mixed: secondary, about to be rewritten";\n',
  mixedRotV2: 'export const mixedRot = "REWRITTEN — mixed: the recorded content is gone";\n',
}

interface Fixture {
  readonly repoPath: string
  readonly A: Hash // the merge base: every citation is intact here
  cleanup(): void
}

const git = (repo: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()

/** A grounded advisory citing `entries` (given as [path, StructRef] pairs, in recorded order). */
function advisory(id: string, entries: readonly (readonly [string, StructRef])[]): GroundedFact {
  return {
    kind: "advisory",
    id: id as NodeKey,
    tier: "T2",
    claimNorm: `a multi-cited claim (${id})`,
    grounding: { entries: entries.map(([path, anchor]) => ({ anchor, path })) },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

/**
 * Commit A authors the files every fixture needs; commit B (HEAD, the topic tip) renames the "moves house"
 * files (byte-identical body) and rewrites the "about to be rewritten" ones. `seed` selects which of the four
 * two-citation facts the durable projection holds, so `fourFactRepo`/`cleanRepo` differ in exactly that.
 */
function makeFixture(seed: readonly string[]): Fixture {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-drift-entries-"))
  git(repoPath, "init", "-q")
  git(repoPath, "config", "user.email", "t@t.t")
  git(repoPath, "config", "user.name", "T")
  git(repoPath, "config", "commit.gpgsign", "false")
  mkdirSync(join(repoPath, "src"), { recursive: true })
  const w = (rel: string, body: string): void => writeFileSync(join(repoPath, "src", rel), body)
  w("a-primary.ts", BODY.primaryA)
  w("b-secmech.ts", BODY.secMechV1)
  w("c-primaryb.ts", BODY.primaryB)
  w("d-secrot.ts", BODY.secRotV1)
  w("e-lead.ts", BODY.leadV1)
  w("f-secondary.ts", BODY.secondaryC)
  w("g-mixedlead.ts", BODY.mixedLeadV1)
  w("h-mixedrot.ts", BODY.mixedRotV1)
  git(repoPath, "add", "-A")
  git(repoPath, "commit", "-q", "-m", "A: every citation intact")
  const A = git(repoPath, "rev-parse", "HEAD") as Hash

  // B = HEAD: three content-preserving renames (mechanically re-groundable) + two rewrites (content gone).
  git(repoPath, "mv", "src/b-secmech.ts", "src/z-secmech-moved.ts")
  git(repoPath, "mv", "src/e-lead.ts", "src/y-lead-moved.ts")
  git(repoPath, "mv", "src/g-mixedlead.ts", "src/x-mixedlead-moved.ts")
  w("d-secrot.ts", BODY.secRotV2)
  w("h-mixedrot.ts", BODY.mixedRotV2)
  git(repoPath, "add", "-A")
  git(repoPath, "commit", "-q", "-m", "B: three renames, two rewrites")

  // A real `.atlas/index.scip` so the composition root's index build has one (wire.ts reads it). Written
  // AFTER the commits and never `git add`-ed, so the durable store stays UNTRACKED.
  const scip = makeFixScip()
  mkdirSync(join(repoPath, ".atlas"), { recursive: true })
  copyFileSync(scip.scipPath, join(repoPath, ".atlas", "index.scip"))
  scip.cleanup()

  // Ground every citation at the ACTUAL unit structure at A, through the same COMPOSE-C index.
  const rev = createRevIndex(repoPath)
  const at = (qp: string): readonly [string, StructRef] => [qp, rev.resolveAnchorAt(String(A), qp)!]
  const all: Record<string, GroundedFact> = {
    // primary FRESH, secondary RENAMED — drifted, but only at the secondary.
    "sec-mech": advisory("sec-mech", [at("src/a-primary.ts"), at("src/b-secmech.ts")]),
    // primary FRESH, secondary REWRITTEN AWAY — the citation a human must re-author.
    "sec-rot": advisory("sec-rot", [at("src/c-primaryb.ts"), at("src/d-secrot.ts")]),
    // primary RENAMED, secondary FRESH — the case that already worked pre-#185.
    "lead-mech": advisory("lead-mech", [at("src/e-lead.ts"), at("src/f-secondary.ts")]),
    // primary RENAMED AND secondary REWRITTEN AWAY — surfaced pre-#185 too, but the fix under test here is
    // detection, not classification, so this fact's own class is unaffected by this card.
    mixed: advisory("mixed", [at("src/g-mixedlead.ts"), at("src/h-mixedrot.ts")]),
  }

  const store = createDiskStore(join(repoPath, CAS_REL))
  const current = new Map<string, CurrentNode>()
  const cas = new Set<string>()
  for (const key of seed) {
    const f = all[key]!
    const h = store.put(f as never) as string
    current.set(key, { nodeKey: key, family: "advisory", contentHash: h, claims: [] })
    cas.add(h)
  }
  store.persistProjection({ current, cas } satisfies StoreProjection)

  return { repoPath, A, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** Drive the REAL shipped gate: `composeRuntime` → `WiredHandler` → `atlas-reconcile` at `mergeBase = A`. */
function runGate(fix: Fixture): ReconcileOut {
  const { handler } = composeRuntime(fix.repoPath)
  const v = handler.handle(RECONCILE, { mergeBase: fix.A })
  expect(v.ok).toBe(true)
  return v.data as ReconcileOut
}

let fourFactRepo: Fixture
let cleanRepo: Fixture

beforeAll(() => {
  fourFactRepo = makeFixture(["sec-mech", "sec-rot", "lead-mech", "mixed"])
  cleanRepo = makeFixture(["sec-mech", "lead-mech"]) // NO rotted citation anywhere in this projection
})
afterAll(() => {
  fourFactRepo?.cleanup()
  cleanRepo?.cleanup()
})

describe("SCN-ADAPTER-9f-1 — detection spans every entry, driven through the real merge gate", () => {
  it("all four facts are surfaced; a secondary-only drift now reaches the gate (MEASURED BEFORE: only 2 of 4)", () => {
    const out = runGate(fourFactRepo)
    // BEFORE #185 (recorded in reconcile-entry-symmetry.test.ts's MEASURED GAP, and reproduced by the TEETH
    // test below on THIS fixture): mechanical=['lead-mech'], semantic=['mixed'], reauthorCount=1, exitCode=2 —
    // `sec-mech`/`sec-rot` never reached the classifier because their PRIMARY never drifted.
    expect(out.mechanical).toEqual(["sec-mech", "lead-mech"])
    expect(out.semantic).toEqual(["sec-rot", "mixed"])
    expect(out.reauthorCount).toBe(2)
    expect(out.exitCode).toBe(2)
    expect(out.drift).toHaveLength(4)

    // The pair reported for each surfaced fact is the FIRST DRIFTED entry (frozen `DriftItem`, one pair) —
    // never `entries[0]` unconditionally. `sec-mech`/`sec-rot` drifted at entry 1 (their primary is entry 0
    // and never moved); `lead-mech`/`mixed` drifted at entry 0.
    const byFact = new Map(out.drift.map((d) => [d.fact, d]))
    expect(byFact.get("sec-mech")!.anchorWas.qualifiedPath).toBe("src/b-secmech.ts")
    expect(byFact.get("sec-mech")!.anchorNow.qualifiedPath).toBe("src/z-secmech-moved.ts")
    expect(byFact.get("sec-rot")!.anchorWas.qualifiedPath).toBe("src/d-secrot.ts")
    expect(byFact.get("sec-rot")!.anchorNow.qualifiedPath).toBe("src/d-secrot.ts") // same path, rewritten content
    expect(byFact.get("lead-mech")!.anchorWas.qualifiedPath).toBe("src/e-lead.ts")
    expect(byFact.get("lead-mech")!.anchorNow.qualifiedPath).toBe("src/y-lead-moved.ts")
  })

  it("TEETH — reverting to an entries[0]-only view of the SAME facts reproduces the pre-#185 gap exactly", () => {
    // This does not re-implement `driftAt`; it calls the REAL (fixed) `createDriftSource` but hands it facts
    // whose grounding has been TRUNCATED to entry 0 — mathematically identical to what the pre-#185 `driftAt`
    // computed (it only ever looked at index 0), without duplicating its body. `git-drift.test.ts`'s own
    // `preFix` comparisons use the same "call the shipped API on a narrowed input" idiom.
    const rev = createRevIndex(fourFactRepo.repoPath)
    const truncated = (f: GroundedFact): GroundedFact => ({
      ...f,
      grounding: { entries: f.grounding.entries.slice(0, 1) },
    })
    const source = createDriftSource({
      repoPath: fourFactRepo.repoPath,
      resolveAnchorAt: rev.resolveAnchorAt,
      resolveBySubtreeAt: rev.resolveBySubtreeAt,
      facts: (["sec-mech", "sec-rot", "lead-mech", "mixed"] as const).map((k) =>
        truncated(advisoryOf(fourFactRepo, k)),
      ),
    })
    const surfaced = source.driftAt(fourFactRepo.A).map((p) => String(p.drifted.fact.id))
    expect(surfaced).toEqual(["lead-mech", "mixed"]) // the exact pre-#185 reach — sec-mech/sec-rot invisible
  })
})

describe("SCN-ADAPTER-9f-2 — the negative direction: single-entry facts unaffected, no rot ⇒ exit 0", () => {
  it("a knowledge base with NO rotted citation anywhere still merges clean", () => {
    const out = runGate(cleanRepo)
    expect(out.mechanical).toEqual(["sec-mech", "lead-mech"])
    expect(out.semantic).toEqual([])
    expect(out.exitCode).toBe(0)
    expect(out.reauthorCount).toBe(0)
    expect(out.regroundedCount).toBe(0)
  })

  it("a single-entry grounding is UNAFFECTED by the widening (its only entry IS entry 0), over the REAL fixture repo", () => {
    // `packages/adapter-io/test/git-drift.test.ts` and `compose-recon(-n10).test.ts` are the standing pin for
    // this claim (every fixture there grounds exactly ONE entry per fact, and this card leaves all of them
    // green, unchanged). Restated here as a direct, live proof over the SAME real repo this file already
    // built, rather than resting only on "the other files stayed green": two single-entry facts, one whose
    // sole citation is untouched at HEAD and one whose sole citation moved — a single-entry loop, by
    // construction, inspects entry 0 and stops, so it is indistinguishable from the pre-widening body here.
    const rev = createRevIndex(fourFactRepo.repoPath)
    const untouched = advisory("F_single_fresh", [
      ["src/a-primary.ts", rev.resolveAnchorAt(String(fourFactRepo.A), "src/a-primary.ts")!],
    ])
    const renamed = advisory("F_single_renamed", [
      ["src/e-lead.ts", rev.resolveAnchorAt(String(fourFactRepo.A), "src/e-lead.ts")!],
    ])
    const source = createDriftSource({
      repoPath: fourFactRepo.repoPath,
      resolveAnchorAt: rev.resolveAnchorAt,
      resolveBySubtreeAt: rev.resolveBySubtreeAt,
      facts: [untouched, renamed],
    })
    const pairs = source.driftAt(fourFactRepo.A)
    expect(pairs.map((p) => String(p.drifted.fact.id))).toEqual(["F_single_renamed"]) // untouched excluded
    expect(pairs[0]!.anchorNow.qualifiedPath).toBe("src/y-lead-moved.ts")
  })
})

/** Look up one of `fourFactRepo`'s FOUR seeded facts by key, re-derived from the store rather than kept around
 *  as a second copy — `driftFacts`-shaped, read back exactly as `composeRuntime` reads them. */
function advisoryOf(fix: Fixture, key: string): GroundedFact {
  const rev = createRevIndex(fix.repoPath)
  const at = (qp: string): readonly [string, StructRef] => [qp, rev.resolveAnchorAt(String(fix.A), qp)!]
  const table: Record<string, GroundedFact> = {
    "sec-mech": advisory("sec-mech", [at("src/a-primary.ts"), at("src/b-secmech.ts")]),
    "sec-rot": advisory("sec-rot", [at("src/c-primaryb.ts"), at("src/d-secrot.ts")]),
    "lead-mech": advisory("lead-mech", [at("src/e-lead.ts"), at("src/f-secondary.ts")]),
    mixed: advisory("mixed", [at("src/g-mixedlead.ts"), at("src/h-mixedrot.ts")]),
  }
  return table[key]!
}
