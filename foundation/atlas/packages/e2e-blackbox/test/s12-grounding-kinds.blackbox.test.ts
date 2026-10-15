// @atlas/e2e-blackbox — test/s12-grounding-kinds.blackbox.test.ts  (S12 — the GROUNDING-KIND axis + drift
// contrast, WAVE-COV-1 cell 3)
//
// GROUNDED FACTS (verified in code, not guessed):
//   - `StructRef.kind ∈ {'symbol','block','file','repo','project'}` (@atlas/contracts struct.ts); a
//     `Grounding = { entries: [{ anchor: StructRef, path, displayLines? }] }`. `anchor.subtreeHash` is the
//     SOLE drift oracle — `path`/`displayLines`/line-ranges NEVER participate (@atlas/grounding drift.ts).
//   - In the black-box FIXTURE index (a plain source tree, no policy-artifact heading/section folding), only
//     TWO kinds ever resolve to a real node: `file` (a spatial leaf/branch) and `symbol` (a folded `::`
//     AST unit). `block`/`repo`/`project` are RESERVED for policy-artifact nodes (struct.ts: "'repo'/
//     'project' anchors a global rule to a policy artifact's heading/section BLOCK subtreeHash") that no
//     product src file ever constructs (`grep kind: 'block'|'repo'|'project'` across every package's `src/`
//     is EMPTY) — the fixture index (adapter-io `foldAstUnits(walkFileTree(repo))` → `build`) cannot build
//     one, so any such anchor is mechanically unresolvable. Proven live below (not skipped).
//   - IDENTITY: `primaryAnchorId` (knowledge/src/write/router.ts) filters `grounding.entries` to `kind ===
//     'symbol'` anchors ONLY; a non-empty filter result WINS regardless of entry order — it falls back to
//     the first entry only when NO symbol anchor is present. So a `file`/`block`/`repo`/`project` anchor
//     riding ALONGSIDE a `symbol` anchor in the same grounding is SECONDARY: it feeds `driftDetect` (every
//     entry must independently re-derive FRESH) but never `nodeKey`.
//   - DRIFT per kind (@atlas/grounding types.ts / drift.ts): FRESH iff EVERY anchor's `subtreeHash` matches
//     at HEAD. A `symbol` anchor's `qualifiedPath` folds the unit's OWN body-hash — a body-preserving MOVE
//     (new code prepended above it) re-keys nothing that matters and RE-DERIVES (mechanical, alive). A
//     `file` anchor's `subtreeHash` is the whole file's hash — REWRITING the file's body changes it and it
//     no longer re-derives ANYWHERE (semantic, dead). See s8-doctor.blackbox.test.ts ~line 90-104 (same
//     recipe, reused here as the grounding-kind axis's own drift-contrast leg).
//
// Everything below drives the REAL `atlas` bin (CLI subprocess). Happy-path facts are authored through the
// product `atlas draft` door (`draftFact` / `symbolAnchorKey`, support.ts). The surviving
// product-lib fabricators `groundedSymbolFact` / `subtreeHashOf` (adversarial-fixtures.ts) are used ONLY to
// build the multi-entry combined facts below — a symbol+file grounding the single-anchor draft door cannot
// author — plus the id-prediction used to recognize a real query row; every EXECUTION and every ASSERTION
// stays pure black-box (subprocess stdout/exit).

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact, symbolAnchorKey } from "./support.js"
// groundedSymbolFact + subtreeHashOf + SymbolFactSpec stay: `combinedSymbolPlusFileFact` below builds a
// MULTI-ENTRY (symbol + secondary-file) grounding that the single-anchor `atlas draft` door cannot author.
import { groundedSymbolFact, subtreeHashOf } from "./adversarial-fixtures.js"
import type { SymbolFactSpec } from "./adversarial-fixtures.js"
import { nodeKey } from "@atlas/knowledge"
import type { Candidate, GroundedFact, PredicateSlot } from "@atlas/knowledge"
import type { SubtreeHash } from "@atlas/contracts"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"

/** Brand a raw digest string as `SubtreeHash` (erased in JSON — mirrors adversarial-fixtures.ts `asSubtree`). */
const asSubtree = (h: string): SubtreeHash => h as unknown as SubtreeHash

/**
 * A multi-entry advisory `GroundedFact` grounded at BOTH a `::` SYMBOL anchor (the identity-driving one)
 * AND a SECONDARY `file` anchor on a different, unrelated fixture file. Both entries independently
 * re-derive FRESH (each carries the REAL subtreeHash the emit truth-gate re-checks — `driftDetect` requires
 * EVERY entry to resolve), so this is honestly grounded, not a shortcut. Its `id` is the REAL `nodeKey`
 * (recomputed here via the real product formula, exactly as the product identity formula does)
 * so the story can recognize which query row is "this" node — the runtime NEVER trusts a payload's `id`
 * for routing (governed-emit.ts recomputes it from content), so a query-row match against this predicted id
 * is proof the real product agrees, not a tautology.
 */
function combinedSymbolPlusFileFact(spec: {
  readonly repoPath: string
  readonly symbolSpec: SymbolFactSpec
  readonly secondaryFilePath: string
}): GroundedFact {
  const symFact = groundedSymbolFact(spec.symbolSpec)
  const secondaryHash = asSubtree(subtreeHashOf(spec.repoPath, spec.secondaryFilePath))
  const grounding: GroundedFact["grounding"] = {
    entries: [
      ...symFact.grounding.entries, // the SYMBOL anchor — identity-driving
      {
        anchor: { kind: "file", qualifiedPath: spec.secondaryFilePath, subtreeHash: secondaryHash },
        path: spec.secondaryFilePath,
      }, // SECONDARY
    ],
  }
  const tier = spec.symbolSpec.tier ?? "T1"
  const slot: PredicateSlot = spec.symbolSpec.slot
  const candidate: Candidate = {
    claimText: spec.symbolSpec.claim,
    claimNorm: spec.symbolSpec.claim,
    slot,
    grounding,
    provenance: { source: "e2e-blackbox", trusted: true },
    tier,
  }
  return {
    kind: "advisory",
    id: nodeKey(candidate),
    tier,
    claimNorm: spec.symbolSpec.claim,
    grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope: spec.symbolSpec.scope ?? "src",
    predicateSlot: slot,
  }
}

/** A single-entry advisory `GroundedFact` whose anchor carries a RESERVED kind (`block`/`repo`/`project`) —
 *  no product src file anywhere ever constructs one of these (grep-verified), and the fixture index (plain
 *  source tree, no policy-artifact heading/section folding) has no node any such `qualifiedPath` could
 *  resolve to. The `subtreeHash` value is irrelevant to the outcome — `driftDetect` fails at `resolveCurrent`
 *  (the qualifiedPath itself is unresolvable) before the hash is ever compared. Same shape as adversarial-fixtures.ts's
 *  `ungroundedFact`, parameterized over the reserved kind. */
function reservedKindFact(kind: "block" | "repo" | "project", claim: string): GroundedFact {
  const grounding: GroundedFact["grounding"] = {
    entries: [
      {
        anchor: { kind, qualifiedPath: `POLICY.md::heading:${kind}-rule`, subtreeHash: asSubtree("a".repeat(64)) },
        path: "POLICY.md",
      },
    ],
  }
  return {
    kind: "advisory",
    id: `reserved-${kind}-e2e-node` as unknown as GroundedFact["id"],
    tier: "T1",
    claimNorm: claim,
    grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope: "src",
    predicateSlot: "invariant",
  }
}

let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // KNOW-8 ratifier — the T1 facts below route to full-ratify
})

afterAll(() => {
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

// ── GROUP A — both resolvable kinds emit & readback, then per-kind DRIFT CONTRAST ─────────────────────────
describe("S12A — symbol + file both resolve & readback; drift contrast (mechanical vs semantic)", () => {
  let repo: FixtureRepo
  let symFact: GroundedFact //  anchored at the SYMBOL `foo` — its code will MOVE, body-preserving
  let fileFact: GroundedFact // anchored at the FILE `src/rot.ts` — its body will be REWRITTEN
  let symEmit: ReturnType<typeof emitFact> //  the real emit result for symFact (pre-drift, exit 0 expected)
  let fileEmit: ReturnType<typeof emitFact> // the real emit result for fileFact (pre-drift, exit 0 expected)
  let preDriftQuery: string // the `query src` stdout captured BEFORE the drifting commit (fresh readback)
  let genesis: string

  beforeAll(() => {
    repo = makeFixtureRepo({
      files: { "src/keep.ts": "export const foo = 1;\n", "src/rot.ts": "export const gone = 1;\n" },
      policy: scopedPolicy("src"),
    })
    genesis = repo.sha()
    symFact = draftFact(repo, symbolAnchorKey(repo, "src/keep.ts", "foo"), "invariant", "foo is 1").fact
    fileFact = draftFact(repo, "src/rot.ts", "invariant", "rot exists").fact
    // Emit BOTH pre-drift and CAPTURE the real results — asserted by the first `it` below. Re-emitting these
    // exact facts AFTER the drifting commit (further down) would legitimately fail: `symFact`'s anchor cites
    // the PRE-move `::` unit key, which the truth gate looks up by EXACT qualifiedPath (unlike doctor's
    // reground-aware "content re-derives somewhere" classification) — so it must be captured HERE, not re-run.
    symEmit = emitFact(repo, symFact)
    if (symEmit.exitCode !== 0) throw new Error(`S12A setup: symbol-grounded emit failed:\n${symEmit.stdout}`)
    fileEmit = emitFact(repo, fileFact)
    if (fileEmit.exitCode !== 0) throw new Error(`S12A setup: file-grounded emit failed:\n${fileEmit.stdout}`)
    preDriftQuery = runAtlas(repo.repoPath, ["query", "src"]).stdout
    // ONE commit drifting BOTH, in OPPOSITE ways (mirrors s8-doctor's proven recipe): `foo` MOVES TO
    // ANOTHER FILE but its body is byte-identical ⇒ the unit's subtreeHash survives and re-derives at HEAD
    // ⇒ mechanical/alive. `rot.ts`'s body is REWRITTEN ⇒ its recorded content vanishes ⇒ semantic/dead.
    //
    // A prepend-above no longer drifts anything: the anchor key used to carry the symbol's BYTE START
    // INDEX, so an inserted line re-keyed the unit. That was a bug, and this fixture's mechanical verdict
    // used to depend on it. The move is the real thing the classification is about.
    repo.commit({
      "src/keep.ts": "// foo moved to src/moved.ts\n",
      "src/moved.ts": "export const foo = 1;\n",
      "src/rot.ts": "export const gone = 999;\n// semantic change\n",
    })
  })

  afterAll(() => repo?.cleanup())

  it("a SYMBOL-grounded fact and a FILE-grounded fact both emit (exit 0) with a content-addressed id", () => {
    expect(symEmit.exitCode).toBe(0)
    expect(fileEmit.exitCode).toBe(0)
    expect(symEmit.stdout).toContain("status: ok")
    expect(fileEmit.stdout).toContain("status: ok")
    expect(symEmit.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m)
    expect(fileEmit.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m)
  })

  it("BOTH kinds READ BACK through `atlas query` — two rows, correct claims, fresh (stale:false)", () => {
    const rows = invLines(preDriftQuery)
    expect(rows).toContain(`  inv T1 ${symFact.id} [FRESH]: foo is 1`)
    expect(rows).toContain(`  inv T1 ${fileFact.id} [FRESH]: rot exists`)
    expect(rows.length).toBe(2)
    expect(preDriftQuery).toContain("  stale: false") // pre-drift: the whole pack reads fresh
  })

  it("DRIFT CONTRAST — `doctor why` classifies the SYMBOL anchor MECHANICAL (moved, body survives)", () => {
    const r = runAtlas(repo.repoPath, ["doctor", "why", String(symFact.id)])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain(`whyBroken: fact=${symFact.id}`)
    expect(r.stdout).toContain("class=mechanical")
  })

  it("DRIFT CONTRAST — `doctor why` classifies the FILE anchor SEMANTIC (rewritten, content gone)", () => {
    const r = runAtlas(repo.repoPath, ["doctor", "why", String(fileFact.id)])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain(`whyBroken: fact=${fileFact.id}`)
    expect(r.stdout).toContain("class=semantic")
  })

  it("the SAME two facts DISAGREE end-to-end: `reconcile <genesis>` blocks on the semantic flip (exit 2)", () => {
    // A second, independent real door corroborates the doctor verdicts: the moved-but-alive symbol anchor
    // would be silently re-groundable, but the genuinely rewritten file anchor makes reconcile FAIL closed.
    const r = runAtlas(repo.repoPath, ["reconcile", genesis])
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("status: rejected")
    expect(r.stdout).toContain("semantic flip")
  })
})

// ── GROUP B — IDENTITY: only the symbol anchor drives nodeKey; a secondary anchor is drift-only ───────────
describe("S12B — identity is symbol-only: a non-symbol grounding detail never enters nodeKey", () => {
  let repo: FixtureRepo
  let combinedA: GroundedFact // symbol `foo` + secondary file src/aux1.ts, claim K1
  let combinedB: GroundedFact // SAME symbol `foo` + a DIFFERENT secondary file src/aux2.ts, claim K2
  let fileOnly: GroundedFact //  NO symbol anchor at all — grounded solely at src/aux1.ts, same slot+claim as A

  beforeAll(() => {
    repo = makeFixtureRepo({
      files: {
        "src/keep.ts": "export const foo = 1;\n",
        "src/aux1.ts": "export const one = 1;\n",
        "src/aux2.ts": "export const two = 2;\n",
      },
      policy: scopedPolicy("src"),
    })
    const symbolSpecFor = (secondary: string, claim: string): SymbolFactSpec => ({
      repoPath: repo.repoPath,
      filePath: "src/keep.ts",
      symbolName: "foo",
      slot: "gotcha",
      claim,
    })
    combinedA = combinedSymbolPlusFileFact({
      repoPath: repo.repoPath,
      symbolSpec: symbolSpecFor("src/aux1.ts", "K1"),
      secondaryFilePath: "src/aux1.ts",
    })
    combinedB = combinedSymbolPlusFileFact({
      repoPath: repo.repoPath,
      symbolSpec: symbolSpecFor("src/aux2.ts", "K2"),
      secondaryFilePath: "src/aux2.ts",
    })
    fileOnly = draftFact(repo, "src/aux1.ts", "gotcha", "K1").fact
  })

  afterAll(() => repo?.cleanup())

  it("PREDICTED (product-formula) identity: same symbol anchor + DIFFERENT secondary file ⇒ SAME nodeKey", () => {
    // The REAL nodeKey formula, computed by author-side plumbing (never trusted server-side — see below):
    // combinedA and combinedB share the identical symbol anchor + slot; only their SECONDARY file entry
    // differs (aux1.ts vs aux2.ts, distinct qualifiedPath+subtreeHash). primaryAnchorId filters to symbol-
    // only anchors, so this secondary difference must NOT show up in the identity.
    expect(combinedB.id).toBe(combinedA.id)
    // Contrast: dropping the symbol anchor entirely (fileOnly has NO symbol anchor) falls back to the first
    // grounding entry — a DIFFERENT primaryAnchorId (aux1.ts's file path, not keep.ts's `::foo` unit) — so
    // it mints a genuinely DISTINCT node, even though its (slot,claim) matches combinedA's exactly.
    expect(fileOnly.id).not.toBe(combinedA.id)
  })

  it("CORROBORATED live: emitting A then B (real bin, never trusting the payload id) collides on ONE node", () => {
    const a = emitFact(repo, combinedA)
    const b = emitFact(repo, combinedB)
    expect(a.exitCode).toBe(0)
    expect(b.exitCode).toBe(0) // both independently grounded (every entry, incl. the secondary, re-derives)
    // governed-emit.ts RECOMPUTES nodeKey from content server-side — it never trusts combinedA/B's `.id`. If
    // the real router disagreed with the prediction above, this would show TWO nodes, not one merged claim.
    const rows = invLines(runAtlas(repo.repoPath, ["query", "src"]).stdout)
    expect(rows).toEqual([`  inv T1 ${combinedA.id} [FRESH]: K1; K2`]) // ONE node, claims set-unioned (advisory UPDATE)
  })

  it("the fileOnly contrast fact (no symbol anchor) mints its OWN, separate node", () => {
    const r = emitFact(repo, fileOnly)
    expect(r.exitCode).toBe(0)
    const rows = invLines(runAtlas(repo.repoPath, ["query", "src"]).stdout)
    // now TWO nodes: the symbol-anchored merged pair, and the file-only node — distinct identities.
    expect(rows).toContain(`  inv T1 ${fileOnly.id} [FRESH]: K1`)
    expect(rows).toContain(`  inv T1 ${combinedA.id} [FRESH]: K1; K2`)
    expect(rows.length).toBe(2)
  })
})

// ── GROUP C — block/repo/project: DOCUMENTED non-behavior (no fixture node of that grain exists) ──────────
describe("S12C — reserved kinds (block/repo/project): the fixture index builds no such node; fail CLOSED", () => {
  // NOT skipped: this is a REAL, non-vacuous, GREEN black-box proof through the real `atlas emit` door,
  // stronger than a documented `it.skip` — it exercises the actual fail-closed behavior rather than merely
  // asserting the harness can't build one. Grep across every package's `src/` confirms NO product code ever
  // constructs a `kind: 'block' | 'repo' | 'project'` anchor (GROUND-12's policy-artifact block-grain
  // folding is unimplemented in this build) — so, with a plain source-tree fixture index (no policy-artifact
  // heading/section folding), every reserved-kind anchor is mechanically unresolvable, regardless of the
  // `qualifiedPath` chosen or the `subtreeHash` cited. The truth door (TOOLS-7b/GROUND-6) is the FIRST gate
  // — it fires before authz/ratify, so a single scoped repo suffices for all three kinds.
  let repo: FixtureRepo

  beforeAll(() => {
    repo = makeFixtureRepo({ files: { "src/foo.ts": "export const foo = 1;\n" }, policy: scopedPolicy("src") })
  })

  afterAll(() => repo?.cleanup())

  it.each(["block", "repo", "project"] as const)(
    "a '%s'-kind anchor never resolves in this fixture ⇒ emit REJECTED fail-closed (exit 2, ungrounded)",
    (kind) => {
      const r = emitFact(repo, reservedKindFact(kind, `a ${kind}-anchored rule`))
      expect(r.exitCode).toBe(2)
      expect(r.stdout).toContain("status: rejected")
      expect(r.stdout).toContain("reason: ungrounded")
      expect(r.stdout).not.toContain("id:") // nothing persisted — no silent partial success
    },
  )

  it("SOTA grounded-or-rejected holds for reserved kinds too: query shows NOTHING landed", () => {
    const rows = invLines(runAtlas(repo.repoPath, ["query", "src"]).stdout)
    expect(rows).toEqual([]) // all three reserved-kind attempts left the store untouched
  })
})
