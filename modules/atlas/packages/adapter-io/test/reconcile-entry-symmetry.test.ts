// @atlas/adapter-io — test/reconcile-entry-symmetry.test.ts  (THE MERGE GATE runs the SAME classifier doctor does)
//
// `atlas doctor` is advisory and exits 0. `atlas reconcile` is a MERGE GATE: `exitCode = |semantic| > 0 ? 2 : 0`.
// Both asked the mechanical-vs-semantic question, and until this card they asked it from TWO COPIES — doctor's
// (fixed to span every grounding entry) and a second one inlined at the composition root, still keyed on
// `entries[0]`. The copy with teeth was not the copy anyone was reading. Here the gate is driven END TO END
// through the real `composeRuntime` handler, so what is measured is the shipped path, not a replication.
//
// WHAT MOVES, AND IT IS A MERGE GATE MOVING — say it plainly: a fact that reaches the gate carrying a drifted
// citation whose content re-derives NOWHERE now classifies `semantic` ⇒ exit 2, where the entry-0 copy read its
// primary anchor, found it re-derivable, and answered `mechanical` ⇒ exit 0. Repos with multi-entry grounding
// where a non-primary citation has rotted will start FAILING `reconcile` where they used to pass. That is the
// gate doing its job; it is not silent.
//
// ── THE THIRD INSTANCE OF THE SAME ASYMMETRY — NAMED HERE, CLOSED IN `git-drift-entries.test.ts` (#185) ────
// `git-drift.ts` `driftAt` — the DETECTOR that decides which facts reach the gate at all — used to read
// `f.grounding.entries[0]` and nothing else, so a fact whose PRIMARY was intact was never surfaced as a pair,
// whatever happened to its other citations: the classifier could not misclassify a fact it never received.
// That was the WORST of the three instances (total invisibility, one layer above where the classifier fix
// could reach) and it is now CLOSED: `driftAt` spans every grounding entry, the reported pair is the FIRST
// entry that actually drifted (never `entries[0]` unconditionally), and `DriftItem` stays frozen at one pair.
// The `MEASURED GAP` test below is retired in favour of a GREEN assertion — the gap it recorded now closes —
// and the full four-combination / real-merge-gate proof (REQ-ADAPTER-9f, SCN-ADAPTER-9f-1/9f-2), including the
// TEETH that reproduce this file's OLD pre-#185 numbers, lives in `git-drift-entries.test.ts`.

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
  aPrimary: 'export const primary = "the citation that does not move";\n',
  bSecondary: 'export const secondary = "the citation that moves house";\n',
  cRottenV1: 'export const rotten = "the citation that will be rewritten";\n',
  cRottenV2: 'export const rotten = "REWRITTEN — the recorded content is gone";\n',
  dLead: 'export const lead = "the PRIMARY citation that moves house";\n',
  eStable: 'export const stable = "a secondary citation that never moves";\n',
  fMixedLead: 'export const mixedLead = "a PRIMARY that moves, over a secondary that rots";\n',
  gMixedRotV1: 'export const mixedRot = "the secondary of the mixed fact, before";\n',
  gMixedRotV2: 'export const mixedRot = "REWRITTEN — the mixed fact lost this citation";\n',
}

interface GateFix {
  readonly repoPath: string
  readonly A: Hash // the merge base: every citation is intact here
  readonly facts: Readonly<Record<string, GroundedFact>>
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
 * Commit A (the merge base) authors seven units; commit B (HEAD, the topic tip) renames three of them with
 * byte-identical bodies and rewrites two. Four two-citation facts are grounded at A and seeded into the
 * DURABLE projection the way governed-emit does (invariant 6), so `composeRuntime`'s `driftFacts` reads them
 * back out of CAS. `seed` selects which of them the knowledge base holds — the "no rotted citation" control
 * is the SAME repo with the rotted fact left out, so the two runs differ in exactly one thing.
 */
function makeGateFix(seed: readonly string[]): GateFix {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-gate-sym-"))
  git(repoPath, "init", "-q")
  git(repoPath, "config", "user.email", "t@t.t")
  git(repoPath, "config", "user.name", "T")
  git(repoPath, "config", "commit.gpgsign", "false")
  mkdirSync(join(repoPath, "src"), { recursive: true })
  const w = (rel: string, body: string): void => writeFileSync(join(repoPath, "src", rel), body)
  w("a-primary.ts", BODY.aPrimary)
  w("b-secondary.ts", BODY.bSecondary)
  w("c-rotten.ts", BODY.cRottenV1)
  w("d-lead.ts", BODY.dLead)
  w("e-stable.ts", BODY.eStable)
  w("f-mixed-lead.ts", BODY.fMixedLead)
  w("g-mixed-rot.ts", BODY.gMixedRotV1)
  git(repoPath, "add", "-A")
  git(repoPath, "commit", "-q", "-m", "A: every citation intact")
  const A = git(repoPath, "rev-parse", "HEAD") as Hash

  // B = HEAD: three content-preserving renames (mechanically re-groundable) + two rewrites (content gone).
  git(repoPath, "mv", "src/b-secondary.ts", "src/z-secondary-moved.ts")
  git(repoPath, "mv", "src/d-lead.ts", "src/y-lead-moved.ts")
  git(repoPath, "mv", "src/f-mixed-lead.ts", "src/x-mixed-moved.ts")
  w("c-rotten.ts", BODY.cRottenV2)
  w("g-mixed-rot.ts", BODY.gMixedRotV2)
  git(repoPath, "add", "-A")
  git(repoPath, "commit", "-q", "-m", "B: three renames, two rewrites")

  // A real `.atlas/index.scip` so the composition root's index build has one (wire.ts reads it). Written
  // AFTER the commits and never `git add`-ed, so the durable store stays UNTRACKED (a committed store is
  // refused by the read-provenance guard).
  const scip = makeFixScip()
  mkdirSync(join(repoPath, ".atlas"), { recursive: true })
  copyFileSync(scip.scipPath, join(repoPath, ".atlas", "index.scip"))
  scip.cleanup()

  // Ground every citation at the ACTUAL unit structure at A, through the same COMPOSE-C index.
  const rev = createRevIndex(repoPath)
  const at = (qp: string): readonly [string, StructRef] => [qp, rev.resolveAnchorAt(String(A), qp)!]
  const all: Record<string, GroundedFact> = {
    // primary intact, secondary RENAMED  — drifted, but only at the secondary
    "sec-mech": advisory("sec-mech", [at("src/a-primary.ts"), at("src/b-secondary.ts")]),
    // primary intact, secondary REWRITTEN — the citation a human must re-author
    "sec-rot": advisory("sec-rot", [at("src/a-primary.ts"), at("src/c-rotten.ts")]),
    // primary RENAMED, secondary intact   — the case that already worked
    "lead-mech": advisory("lead-mech", [at("src/d-lead.ts"), at("src/e-stable.ts")]),
    // primary RENAMED, secondary REWRITTEN — surfaced by the detector AND misclassified by the entry-0 copy
    mixed: advisory("mixed", [at("src/f-mixed-lead.ts"), at("src/g-mixed-rot.ts")]),
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

  return { repoPath, A, facts: all, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** Drive the REAL shipped gate: `composeRuntime` → `WiredHandler` → `atlas-reconcile` at `mergeBase = A`. */
function runGate(fix: GateFix): ReconcileOut {
  const { handler } = composeRuntime(fix.repoPath)
  const v = handler.handle(RECONCILE, { mergeBase: fix.A })
  expect(v.ok).toBe(true)
  return v.data as ReconcileOut
}

const ALL_FOUR = ["sec-mech", "sec-rot", "lead-mech", "mixed"]
let full: GateFix
let clean: GateFix

beforeAll(() => {
  full = makeGateFix(ALL_FOUR)
  // The two facts with NO rot at all (#185 — see the negative-direction test below for why `sec-rot` was
  // dropped from this seed, not just `mixed`).
  clean = makeGateFix(["sec-mech", "lead-mech"])
})
afterAll(() => {
  full?.cleanup()
  clean?.cleanup()
})

describe("THE MERGE GATE — one classifier, spanning every citation (detection now spans every citation too, #185)", () => {
  it("a fact whose non-primary citation ROTTED blocks the merge: exitCode 2 (the entry-0 copy answered 0)", () => {
    const out = runGate(full)
    // TEETH: the pre-fix composition root asked `resolveBySubtreeAt(entries[0].subtreeHash)`. For `mixed`
    // that is the RENAMED primary, whose content is alive at src/x-mixed-moved.ts ⇒ `mechanical` ⇒ the whole
    // run reported semantic=[] and exitCode 0, over a knowledge base holding a dead citation.
    //
    // TIGHTENED BY #185: `sec-rot` (primary fresh, secondary rewritten away) now ALSO reaches the gate and
    // classifies `semantic` — pre-#185 it was invisible to `driftAt` entirely (its primary never drifted), so
    // this run used to report `semantic: ['mixed']` alone. `sec-mech` (primary fresh, secondary renamed) now
    // reaches the gate too and classifies `mechanical` (moved-but-alive).
    expect(out.semantic).toEqual(["sec-rot", "mixed"])
    expect(out.exitCode).toBe(2)
    expect(out.reauthorCount).toBe(2) // exactly the facts a human must re-author — never the whole store
    // The reviewable items are classed semantic too (the split and the items never disagree).
    expect(out.drift.find((d) => d.fact === "mixed")!.class).toBe("semantic")
    expect(out.drift.find((d) => d.fact === "sec-rot")!.class).toBe("semantic")
    // `mixed` LEFT the mechanical set (pre-fix: `['lead-mech','mixed']`); `sec-mech` newly ENTERS it
    // (pre-fix: invisible, in neither set) — one rotted fact blocks the merge without condemning every other
    // drifted fact in the run.
    expect(out.mechanical).toEqual(["sec-mech", "lead-mech"])
  })

  it("the NEGATIVE direction — no rotted citation anywhere ⇒ the gate still passes", () => {
    // RENAMED FROM the pre-#185 `clean` fixture (`['sec-mech','sec-rot','lead-mech']`): that fixture actually
    // CONTAINED a rotted citation (`sec-rot`'s secondary) — it was named "clean" only because the pre-#185
    // detector could not see it. `clean` here is `['sec-mech','lead-mech']`, the two facts with NO rot at all,
    // so this exit-0 claim is honest post-fix. The genuinely rot-free case is TIGHTENED, never relaxed: this
    // fixture is now smaller, not larger, so the assertion is a stronger claim than the one it replaces.
    const out = runGate(clean)
    expect(out.mechanical).toEqual(["sec-mech", "lead-mech"])
    expect(out.semantic).toEqual([])
    expect(out.exitCode).toBe(0) // a knowledge base with NO rotted citation must still merge
    expect(out.reauthorCount).toBe(0)
    expect(out.regroundedCount).toBe(0)
  })

  it("CLOSED (#185) — `driftAt` now spans every entry, so a secondary-ONLY drift reaches the gate", () => {
    // This test USED TO record the detector's entries[0]-only reach as a deliberately unrepaired gap
    // (`MEASURED GAP`, git blame this file). #185 closed it: `driftAt` now surfaces a fact when ANY entry
    // drifted, not just `entries[0]`. `sec-mech` and `sec-rot` — previously invisible because their PRIMARY
    // never moved — now surface alongside `lead-mech` and `mixed`. Full REQ-ADAPTER-9f / SCN-ADAPTER-9f-1/9f-2
    // coverage (all four combinations, the real merge gate, the TEETH reproducing these exact OLD numbers, and
    // the single-entry negative-direction pin) lives in `git-drift-entries.test.ts`; this assertion is kept
    // here, tightened rather than deleted, so this file's own history stays legible.
    const rev = createRevIndex(full.repoPath)
    const source = createDriftSource({
      repoPath: full.repoPath,
      resolveAnchorAt: rev.resolveAnchorAt,
      resolveBySubtreeAt: rev.resolveBySubtreeAt,
      facts: ALL_FOUR.map((k) => full.facts[k]!),
    })
    const surfaced = source.driftAt(full.A).map((p) => String(p.drifted.fact.id))
    expect(surfaced).toEqual(["sec-mech", "sec-rot", "lead-mech", "mixed"]) // ALL FOUR, recorded order
  })
})
