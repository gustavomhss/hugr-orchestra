// @atlas/adapter-io — src/test-vacuity-source.ts  (the reachable PRODUCER + READ leg for the single-anchor test-vacuity family, #95 D5)
//
// The shipped edge that turns the reference-model oracle `scanTestVacuity` (test-vacuity.ts) into running code —
// the single-anchor HEAD analogue of the 2-rev transition producer (`transition-source.ts`). Given the repo's
// HEAD test units (`*.test.ts` / `*.spec.ts`, walked from the SAME FileTree the index folds — wired at the
// composition root, Wave 2), it PARSES each unit via the SAME tree-sitter machinery `ast.ts` uses (`parseTsDoc`),
// runs `scanTestVacuity` over the AST, and for every PROVEN fact builds a `TestVacuityProposal` + calls
// `trySoundTestVacuity` (@atlas/genesis) injecting a `scanTestVacuity`-backed verifier — genesis is the seal
// authority (D5), this module only supplies the closure. Each sealed node is routed THROUGH the governed emit
// door (`emit`, the `kind:'test-vacuity'` branch is `governed-emit-test-vacuity.ts`), NEVER a direct
// `commitProjection` — the #87/#234 gate-less-write fix, so KNOW-11 authz + ARCH-9 anchor + the HEAD truth gate
// all apply.
//
// FAIL-CLOSED on any unit it cannot parse: `parseTsDoc` returns `undefined` (error tree / non-TS / throw), the
// producer emits NOTHING for that unit (a MEASURED `admitted:false`), never a fabricated fact — exactly the
// caller-side fail-closed contract `scanTestVacuity`'s header requires.

import type { Hash, StructRef, Tier } from "@atlas/contracts"
import type { GroundingEntry } from "@atlas/grounding"
import type { Axes, FileTree, IndexNode } from "@atlas/index"
import { trySoundTestVacuity } from "@atlas/genesis"
import type { TestVacuityProposal } from "@atlas/genesis"
import { testVacuitiesOf } from "@atlas/knowledge"
import type { GroundedTestVacuity, TestVacuityNode, TestVacuityShape } from "@atlas/knowledge"
import type { EmitOut, Guidance, Verdict } from "@atlas/tools"
import { parseTsDoc } from "./ast.js"
import { scanTestVacuity } from "./test-vacuity.js"
import { unitScopeOf } from "./llm.js"
import { rehydrateProjection } from "./store.js"
import type { DiskStore } from "./store.js"
import { MINED_TIER } from "./reverify-store.js"
import type { TestVacuityReplay } from "./reverify-store.js"

/** One HEAD test unit the producer scans — its LOCATION-FREE `unitKey` lineage, the repo-relative `path` (the
 *  grounding entry's human/nav leg), the unit's HEAD `anchor` (its `subtreeHash` the freshness leg), and the raw
 *  TS `content` to parse. INJECTED — the composition root (Wave 2) walks the FileTree for `*.test.ts`/`*.spec.ts`
 *  leaves and hands their bytes + anchors here; a test hands a literal list. */
export interface TestUnit {
  readonly unitKey: string
  readonly path: string
  readonly anchor: StructRef
  readonly content: string
}

/** The governed emit door leg the producer writes THROUGH — `createGovernedEmit(...).emit` (compose binds it).
 *  Its `kind:'test-vacuity'` branch (`governed-emit-test-vacuity.ts`) applies the HEAD truth gate + KNOW-11 authz
 *  + ARCH-9 anchor + produced-only. */
export type TestVacuityEmit = (node: TestVacuityNode, at: Hash) => EmitOut

/** The outcome of producing ONE fact — a MEASURED record, never a manufactured fact. `admitted:false` carries the
 *  honest reason: the unit could not be parsed (fail-closed), or the injected oracle did not re-prove the shape.
 *  `persisted:false` on a governed refusal is the whole point of the write-through — a gate-less path would land it. */
export interface TestVacuityRun {
  readonly admitted: boolean
  readonly unitKey: string
  readonly testName?: string // present once a proven fact was proposed (absent on an unparseable unit)
  readonly shape?: TestVacuityShape // WHICH vacuity shape was proven — carried to the render so no surface
  //                                    states a shape the fact does not hold (the wp-surface-truth class)
  readonly id?: string // the durable content address the door returned, present iff persisted
  readonly persisted?: boolean // whether the governed door COMMITTED (false ⇒ authz/anchor/ratify/ground refusal)
  readonly reason?: string // the honest why-not / the governed door's refusal text, present iff NOT admitted-and-persisted
}

/** The composition-root PRODUCER leg: HEAD test units → produce + GOVERNED-emit every proven test-vacuity fact. */
export type TestVacuityProducer = () => readonly TestVacuityRun[]

/** One unit's HEAD anchor as a `GroundingEntry` — the `StructRef` (whose `subtreeHash` IS the unit's content hash
 *  at HEAD) wrapped with the file path. Mirrors `transition-source.ts`'s `entryOf`. */
function entryOf(ref: StructRef, path: string): GroundingEntry {
  return { anchor: ref, path }
}

/**
 * Build the REACHABLE producer over an injected `units` feed + the GOVERNED emit door `emit`. The returned leg
 * parses each HEAD test unit, runs `scanTestVacuity`, and for every proven fact admits a `proven`-sealed node
 * through genesis's seal authority (`trySoundTestVacuity`, injecting a `scanTestVacuity`-backed verifier) and
 * routes it THROUGH the door (KNOW-11 authz + ARCH-9 anchor + the HEAD truth gate). `at` is the anchor rev the
 * write is stamped at (the repo's live HEAD), threaded to the door's HEAD truth gate.
 *
 * FAIL-CLOSED / ABSTAIN, NEVER FABRICATE (all a MEASURED result, never a throw):
 *   - the unit could not be parsed (error tree / non-TS / throw) ⇒ one `admitted:false` run, nothing emitted;
 *   - `scanTestVacuity` proves nothing on a unit ⇒ that unit contributes no run (no fact to state);
 *   - the injected verifier does not re-prove a proposed fact ⇒ `admitted:false` (genesis withheld the seal);
 *   - the GOVERNED DOOR refuses (unauthorized actor / anchor, stale grounding, unratified) ⇒ admitted:true but
 *     persisted:false + the door's reason.
 */
export function createTestVacuityProducer(
  units: () => readonly TestUnit[],
  emit: TestVacuityEmit,
  at: Hash,
): TestVacuityProducer {
  return () => {
    const runs: TestVacuityRun[] = []
    for (const u of units()) {
      const doc = parseTsDoc(u.path, u.content)
      if (doc === undefined) {
        // FAIL-CLOSED: an unparseable unit yields no proven fact, never a false one.
        runs.push({
          admitted: false,
          unitKey: u.unitKey,
          reason: `unit '${u.unitKey}' could not be parsed (error tree / non-TS / parse throw) — fail-closed, no fact`,
        })
        continue
      }
      try {
        const facts = scanTestVacuity(doc.root)
        // The scanTestVacuity-backed verifier genesis re-runs (D5) — 'proven' iff a fact with this (shape,
        // testName) still appears in the unit's HEAD scan. genesis is the seal authority; this only supplies it.
        const verify = (_unitKey: string, testName: string, shape: TestVacuityShape): "proven" | "abstain" =>
          facts.some((f) => f.testName === testName && f.shape === shape) ? "proven" : "abstain"
        for (const f of facts) {
          const proposal: TestVacuityProposal = {
            kind: "test-vacuity",
            unitKey: u.unitKey,
            testName: f.testName,
            shape: f.shape,
            grounding: { entries: [entryOf(u.anchor, u.path)] },
            tier: MINED_TIER as Tier, // the mined tier — a produced, advisory-class fact (mirrors the transition/sound-arm tier)
            scope: unitScopeOf(u.unitKey), // KNOW-11a authz scope — the unit's own containing directory; the door authorizes against it
          }
          // No `score` — a PRODUCED structural fact carries no obviousness (adapter-io has no harness door;
          // `ObviousnessScore.by` admits only 'harness-predicate'), exactly as a transition carries none.
          const node = trySoundTestVacuity(proposal, verify)
          if (node === undefined) {
            runs.push({
              admitted: false,
              unitKey: u.unitKey,
              testName: f.testName,
              shape: f.shape,
              reason: `the injected sound oracle did not re-prove the '${f.shape}' shape at HEAD`,
            })
            continue
          }
          // ROUTE THROUGH THE GOVERNED DOOR — the HEAD truth gate + KNOW-11 authz + ARCH-9 anchor + produced-only
          // apply here (the security fix). A refusal is a MEASURED persisted:false, never a throw.
          const out = emit(node, at)
          runs.push({
            admitted: true,
            unitKey: u.unitKey,
            testName: f.testName,
            shape: f.shape, // carried so the render names the shape PROVEN, never a hardcoded one
            persisted: out.emitted,
            ...(out.emitted
              ? { id: String(out.id) }
              : { reason: out.rejected ?? "the governed door refused the write" }),
          })
        }
      } finally {
        doc.dispose() // release the WASM handles the parse held open (ast.ts discipline)
      }
    }
    return runs
  }
}

/**
 * Build the REVERIFY REPLAY leg (Wave 3, #95 D5) over the SAME injected HEAD `units` feed the producer rides —
 * the read-side re-proof `reverifyTestVacuity` (reverify-store.ts) calls with a proven fact's `(unitKey, testName,
 * shape)`. It re-parses the named unit at HEAD via the SAME tree-sitter path the producer uses (`parseTsDoc` +
 * `scanTestVacuity`, never a second parser) and returns `'proven'` IFF a fact with this `(shape, testName)` STILL
 * appears in the unit's HEAD scan, else `'abstain'` (the test changed / vanished ⇒ the caller reads `broken`).
 *
 * FAIL-CLOSED, NEVER a false re-prove (all a MEASURED `'abstain'`, never a throw): the unit is not among HEAD's
 * test units (renamed / deleted) ⇒ `'abstain'`; the unit no longer parses (error tree / non-TS) ⇒ `'abstain'`.
 * Pure over its feed; the only effect is the WASM parse, disposed on every path (ast.ts discipline). This is the
 * exact same predicate the producer's own in-scan verifier applies (`facts.some(...)`) — the read-side re-run of
 * the write-side proof, so the two can never disagree about what "still proven at HEAD" means.
 */
export function buildTestVacuityReplay(units: () => readonly TestUnit[]): TestVacuityReplay {
  return (unitKey, testName, shape) => {
    const u = units().find((x) => x.unitKey === unitKey)
    if (u === undefined) return "abstain" // the unit is gone from HEAD — nothing to re-scan (fail-closed)
    const doc = parseTsDoc(u.path, u.content)
    if (doc === undefined) return "abstain" // no longer parses — fail-closed, never a false re-prove
    try {
      return scanTestVacuity(doc.root).some((f) => f.testName === testName && f.shape === shape) ? "proven" : "abstain"
    } finally {
      doc.dispose() // release the WASM handles the parse held open (ast.ts discipline)
    }
  }
}

// ── THE COMPOSITION-ROOT UNITS FEED — the HEAD `*.test.ts`/`*.spec.ts` walk that feeds `createTestVacuityProducer` ──

/** A repo-relative test-unit path — `*.test.ts` / `*.spec.ts` (also `.tsx`/`.cts`/`.mts`), the leaves the
 *  producer scans. A file NODE's key on the spatial rail is exactly this path; a sub-file AST item carries a
 *  `::` refinement (adapter-io/src/ast.ts) and is NOT a test unit. */
const TEST_UNIT = /\.(test|spec)\.[cm]?tsx?$/

/** Collect every walked LEAF's bytes into a `path → content` map. A leaf is a `FileTree` node with no children;
 *  a directory carries children and no `content`. Total — a leaf without `content` (a bare structural node) is
 *  simply skipped, never guessed at. */
function collectContent(node: FileTree, out: Map<string, string>): void {
  if (node.children.length === 0 && typeof node.content === "string") out.set(node.path, node.content)
  for (const child of node.children) collectContent(child, out)
}

/** Collect every FILE node on the spatial rail whose path is a test unit into a `TestUnit`, pairing the node's
 *  HEAD `subtreeHash` (the anchor the truth gate re-derives — `driftDetect` resolves `qualifiedPath` against
 *  the SAME `axes.spatial`, so this anchor reads FRESH) with the walked bytes for that path. A test file with no
 *  content in the walk (unreadable / deleted) is skipped — the producer cannot parse bytes it does not hold. */
function collectTestUnits(node: IndexNode, content: Map<string, string>, out: TestUnit[]): void {
  // A FILE node's key is the repo-relative path (no `::`); an AST sub-item carries a `::` refinement.
  if (!node.key.includes("::") && TEST_UNIT.test(node.key)) {
    const bytes = content.get(node.key)
    if (bytes !== undefined) {
      out.push({
        unitKey: node.key,
        path: node.key,
        anchor: { kind: "file", qualifiedPath: node.key, subtreeHash: node.subtreeHash },
        content: bytes,
      })
    }
  }
  for (const child of node.children) collectTestUnits(child, content, out)
}

/**
 * The composition-root UNITS FEED (Wave 2): the repo's HEAD test units, one `TestUnit` per `*.test.ts`/
 * `*.spec.ts` leaf, its `anchor.subtreeHash` read STRAIGHT off the built `axes.spatial` (so the producer's
 * governed-door HEAD truth gate — `driftDetect` over the SAME axes — reads it FRESH) and its `content` from the
 * SAME `fileTree` walk `build` folded. Pure + total: no clock, no IO (the walk + build already happened), so two
 * calls over the same axes/tree are byte-identical. A repo with no test files yields `[]` (the producer then
 * emits nothing — abstain-by-design, never a fabricated fact).
 */
export function testUnitsOf(fileTree: FileTree, axes: Axes): readonly TestUnit[] {
  const content = new Map<string, string>()
  collectContent(fileTree, content)
  const units: TestUnit[] = []
  collectTestUnits(axes.spatial, content, units)
  return units
}

// ── THE READ LEG + READ VERDICT (mirrors createTransitionLeg / transitionsVerdict) ───────────────────────────

/** The composition-root READ leg: `unit` → the grounded test-vacuity facts on that unit (empty ⇒ every unit).
 *  TOTAL — `testVacuitiesOf` is pure + total. Re-reads the LIVE projection per call, so a fact produced in this
 *  session is visible to the very next call. */
export type TestVacuityLeg = (unit: string) => readonly GroundedTestVacuity[]

/** Build the READ leg over the durable `store` — the SAME store the handler's query leg reads (so `atlas
 *  test-vacuities` and `atlas query` are two projections of ONE store). Read-only; opens no write path. This is
 *  the ONE production caller that makes `testVacuitiesOf` (@atlas/knowledge, WP-TV-1b) running code. */
export function createTestVacuityLeg(store: DiskStore): TestVacuityLeg {
  return (unit) => testVacuitiesOf(rehydrateProjection(store), unit)
}

/** The data payload a `test-vacuities` read verdict carries — the facts on the unit plus the query unit, so an
 *  EMPTY result is a MEASURED fact (this unit, zero vacuous tests) and never an absent line. */
export interface TestVacuitiesData {
  readonly testVacuities: readonly GroundedTestVacuity[]
  readonly unit: string
}

/** The one property a reader should check the bytes against. */
const READ_INVARIANT =
  "TV-READ: `atlas test-vacuities` reads GROUNDED single-anchor proven facts (family:test-vacuity) off the live projection the query readback rides — sorted (unitKey, testName, nodeKey) so equal input is byte-identical output, each fact standing alone (no lineage, no supersession — the family is single-anchor), never a throw, no write path"

/** The one actionable sentence, derived from the result's own numbers. */
function readNextLine(unit: string, facts: readonly GroundedTestVacuity[]): string {
  if (facts.length === 0) {
    return `no grounded test-vacuity fact on unit '${unit}' — a fact is produced by \`atlas test-vacuity <path>\` when a test holds one of the proven vacuity shapes (assertions all inside a catch clause, or no assertion at all in a body that discards work); check the unit key spelling`
  }
  return `${facts.length} proven test-vacuity fact(s) on unit '${unit}' — each a named test proven to hold one of the vacuity shapes, sealed proven`
}

/**
 * The SHARED read-verdict builder — both transports call this over the SAME `TestVacuityLeg`, so identical
 * `unit` yields a byte-identical `Verdict`. TOTAL: a missing/empty `unit` fails CLOSED to a structured `ok:false`
 * verdict (exit 1 on the CLI), never a throw.
 */
export function testVacuitiesVerdict(leg: TestVacuityLeg, unit: string): Verdict<TestVacuitiesData> {
  if (typeof unit !== "string" || unit.length === 0) {
    const guidance: Guidance = {
      next: "`atlas test-vacuities <unit>` requires the unit key whose grounded test-vacuity facts to read",
      invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
    }
    return { ok: false, rejected: "missing unit: `atlas test-vacuities` requires a non-empty unit key", guidance }
  }
  const testVacuities = leg(unit)
  const guidance: Guidance = { next: readNextLine(unit, testVacuities), invariant: READ_INVARIANT }
  return { ok: true, guidance, data: { testVacuities, unit } }
}
