// @atlas/adapter-io — test/negation-bench.test.ts  (#95 · #99 M3 — THE SOUND-NEGATION BENCHMARK)
//
// REPRODUCE: (from repo root, fresh `.atlas/index.scip` — `scip-typescript index --output .atlas/index.scip`)
//   ATLAS_NEG_BENCH=1 npx vitest run packages/adapter-io/test/negation-bench.test.ts
//
// WHAT THIS MEASURES. The shipped v2 negation door (ADR-0016 gate 1b: admit `¬∃ caller of X in S` iff
// `resolves(X) ∧ ¬escape(X) ∧ ¬dynamic-reach(S) ∧ reverseCallers(X)∩S==∅`, else abstain) is the DETERMINISTIC
// genesis gate for the NEGATION shape. It carries no LLM — a proposer (an LLM miner) suggests candidate
// negatives; THIS gate judges them (the A1/A3 proposer arm lives in `negation-proposer-bench.test.ts`). So the
// gate's own quality is two numbers, measured here over Atlas itself:
//   · 0-FALSE-ADMIT (soundness, the headline): every negation the gate ADMITS is TRUE — X is genuinely not
//     called in S — confronted against an INDEPENDENT second extractor (the TypeScript compiler, `tsc`, whose
//     escape verdicts the engine already agrees with 1135/1135 / 0-unsound, `escape-ts-oracle-agree.mjs`).
//     A single false-admit breaks the whole soundness claim; this suite FAILS if one is found.
//   · NET-RECALL: of the TRUE scoped-negatives in the pool (X really not called in S, per tsc), what fraction
//     the gate ADMITS rather than abstains. The #99 design floor was 0% (the #99b blanket `holeSources()∩S`
//     abstains on ~92% of files); the v2 target-relative gate is the recall win, quantified here.
// Plus the ADVERSARIAL rows: the reproduced `ns[key]()` false-admit + all 5 hardened dynamic channels, each a
// synthetic scope where X IS reachable with no emitted occurrence — the gate MUST abstain.
//
// HONESTY RAILS (honestidade-inegociável):
//   · The gate under test is the SHIPPED door (`createGovernedEmit(...).emit` on a `kind:'negation'` node), NOT
//     a re-implementation — driven via `setupNegBench` (test/support/neg-bench-lib.ts), the ONE assembly this and
//     the proposer arm share so the gate + oracle are byte-identical across them. Authz is permissive so a
//     gate-1 ADMIT surfaces as `emitted:true` (authz/ratify/commit are orthogonal, tested elsewhere).
//   · GROUND TRUTH is tsc, built independently in the lib (its own `ts.createProgram`), never the SCIP index the
//     gate reads — so "the gate agrees with itself" can never masquerade as truth.
//   · The pool is EXHAUSTIVE over (every joinable export target X) × (every real src scope S) with def(X) not
//     under S — no sampling, no cherry-pick. If a hard cap ever truncates it, the run LOGS the drop (no silent cap).
//
// Skipped unless ATLAS_NEG_BENCH=1 (a full tsc program + thousands of door calls is too heavy for `npm test`).

import { describe, it, expect, beforeAll } from "vitest"
import { readFileSync } from "node:fs"
import { join, dirname, resolve as presolve } from "node:path"
import { deserializeSCIP } from "@c4312/scip"
import { asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { nodeHashOfPath } from "@atlas/index"
import type { FileTree } from "@atlas/index"
import type { GroundedFact, NegationNode, StoreProjection } from "@atlas/knowledge"
import type { CommitDecision, CommitResult } from "../src/sidecar.js"
import type { DiskStore } from "../src/store.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { walkFileTree } from "../src/fs.js"
import { initAst } from "../src/ast.js"
import { buildDynamicReach } from "../src/escape/dynamic-reach.js"
import { edgeModelVersion } from "../src/wire.js"
import { setupNegBench, classify, type NegBench, type Target } from "./support/neg-bench-lib.js"

const RUN = process.env.ATLAS_NEG_BENCH === "1"
const ROOT = presolve(__dirname, "..", "..", "..") // packages/adapter-io/test → repo root
const SCIP = join(ROOT, ".atlas", "index.scip")
const ACTOR = "bench@atlas.test"
const AT = asHash("cafe") as unknown as Hash // the CAS `at` arg emit takes; a negation ignores it (routes by key).
const HARD_CAP = 40_000 // backstop; the real pool is ~20k. Truncation is LOGGED, never silent.

// ── ADVERSARIAL ROWS (owner directive): the reproduced `ns[key]()` false-admit + all 5 hardened dynamic
//    channels, each a scope S where a target COULD be reached with NO emitted occurrence. Driven through the
//    REAL leg the door consumes (`buildDynamicReach`): a firing channel ⇒ the door abstains `scope-dynamic`,
//    so it NEVER admits "X is uncalled in S" when X might be reached via that channel. (Leg-level teeth also
//    live in `dynamic-reach.test.ts`; door-level `ns[key]()` false-admit in `negation-door-v2-escape.test.ts`.)
const CH = (content: string): FileTree => ({ path: "src/pay/x.ts", children: [], content })
const ADVERSARIAL: ReadonlyArray<{ row: string; tree: FileTree; expect: string }> = [
  {
    row: "ns[key]() — static namespace + computed member (the reproduced false-admit)",
    expect: "ns-escape",
    tree: {
      path: ".",
      children: [
        { path: "src/pay/x.ts", children: [], content: "import * as ns from './m';\nexport const c = ns[key]();\n" },
      ],
    },
  },
  {
    row: "import(nonliteral) — dynamic module load",
    expect: "import-nonliteral",
    tree: { path: ".", children: [CH("const k = spec;\nexport const a = import(k);\n")] },
  },
  {
    row: "require(nonliteral) — dynamic CJS load (incl. member callee module.require)",
    expect: "require-nonliteral",
    tree: { path: ".", children: [CH("const m = req;\nexport const b = require(m);\n")] },
  },
  {
    row: "eval(...) — arbitrary code (incl. member callee globalThis.eval)",
    expect: "eval",
    tree: { path: ".", children: [CH("export const d = eval(userInput);\n")] },
  },
  {
    row: "new Function(...) — arbitrary code",
    expect: "new-Function",
    tree: { path: ".", children: [CH("export const e = new Function('return 1');\n")] },
  },
  {
    row: "JS-family file (.cjs/.mjs) under S — TS-only grammar ⇒ fail-closed",
    expect: "js-unscanned",
    tree: {
      path: ".",
      children: [{ path: "src/pay/legacy.cjs", children: [], content: "module.exports = require(process.env.MOD);\n" }],
    },
  },
]

describe.skipIf(!RUN)("#95/#99 M3 — adversarial channel rows (each MUST make the door abstain scope-dynamic)", () => {
  it("every hardened dynamic channel fires under scope S (never a silent admit)", async () => {
    await initAst()
    /* eslint-disable no-console */
    console.log("\n=== #95/#99 M3 — ADVERSARIAL CHANNEL ROWS (buildDynamicReach over synthetic S=src/pay) ===")
    for (const c of ADVERSARIAL) {
      const dr = buildDynamicReach(c.tree)!
      const wits = dr("src/pay")
      const fired = wits.some((w) => w.endsWith(c.expect))
      console.log(`  [${fired ? "ABSTAIN" : "ADMIT!!"}] ${c.expect.padEnd(18)} ${c.row}`)
      expect(fired, `channel ${c.expect} MUST fire (else false-admit)`).toBe(true)
    }
    console.log(
      "  (a LITERAL import/require/ns['lit'] yields NO channel — recall preserved — see dynamic-reach.test.ts)",
    )
    console.log("================================================================================\n")
    /* eslint-enable no-console */
  }, 60_000)

  it(
    "REGRESSION GUARD (#233 closed the parse gap): atlas has ZERO scope-dynamic witnesses — 0 :unparsed " +
      "fail-closes AND 0 real dynamic channels [teeth: revert normalizeForGrammarGaps ⇒ 11 :unparsed ⇒ RED]",
    async () => {
      await initAst()
      const dr = buildDynamicReach(walkFileTree(ROOT))!
      const idx = deserializeSCIP(readFileSync(SCIP))
      const scopes = new Set<string>()
      for (const doc of idx.documents)
        if (/^packages\/[^/]+\/src\/.+\.tsx?$/.test(doc.relativePath) && !/\.test\.tsx?$/.test(doc.relativePath))
          scopes.add(dirname(doc.relativePath))
      let real = 0,
        unparsed = 0
      const unparsedFiles = new Set<string>()
      for (const s of scopes)
        for (const w of dr(s)) {
          if (w.endsWith(":unparsed")) {
            unparsed++
            unparsedFiles.add(w.replace(/:0:0:unparsed$/, ""))
          } else real++
        }
      /* eslint-disable no-console */
      console.log("\n=== atlas scope-dynamic cause (per-scope-union witnesses) — post-#233 ===")
      console.log(`  REAL dynamic channels: ${real}   :unparsed fail-closes: ${unparsed}`)
      if (unparsedFiles.size)
        console.log(`  unparseable prod files (${unparsedFiles.size}): ${[...unparsedFiles].sort().join(", ")}`)
      console.log("=======================================================================\n")
      /* eslint-enable no-console */
      // #233: the grammar-gap parse rescue (ast.ts normalizeForGrammarGaps) makes the 11 formerly-unparseable
      // production files parse ⇒ no fail-close abstention. If this regresses, unparsed jumps back to 11.
      expect(unparsed).toBe(0)
      expect(real).toBe(0) // still no real dynamic reachability on atlas
    },
    60_000,
  )
})

describe.skipIf(!RUN)("#95/#99 M3 — sound-negation benchmark (0-false-admit + net-recall vs the tsc oracle)", () => {
  let B: NegBench
  let emitCeiling: ReturnType<typeof createGovernedEmit>["emit"] // parse-tolerant arm (see below)
  let projC: StoreProjection

  beforeAll(async () => {
    B = await setupNegBench(ROOT, SCIP)
    // CEILING arm — the SAME shipped door with a PARSE-TOLERANT dynamic-reach: it drops the `:unparsed` /
    // `:js-unscanned` fail-closed witnesses (a tree-sitter parse failure on a normal .ts file), keeping only
    // REAL dynamic channels. This isolates how much realized recall is lost to the pinned grammar's parse gaps
    // vs to genuine dynamic reachability. NOT a sound gate (dropping unparsed IS unsound) — a measurement of the
    // recall the sound gate would reach once the files parse. Reported separately, never as the shipped number.
    const policyScopes: Record<string, readonly string[]> = {}
    for (const s of B.scopes) policyScopes[s] = [ACTOR]
    projC = { current: new Map(), cas: new Set() } as unknown as StoreProjection
    const storeC = {
      commitProjection<T>(decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> {
        const d = decide(projC)
        if (d.next !== undefined) projC = d.next
        return { settled: true, out: d.out }
      },
    } as unknown as DiskStore
    const dynamicReachCeiling = (scope: string): readonly string[] =>
      B.dynamicReach(scope).filter((w) => !w.endsWith(":unparsed") && !w.endsWith(":js-unscanned"))
    emitCeiling = createGovernedEmit({
      store: storeC,
      gate: { gateHolds: () => "HOLDS" } as never,
      policy: { t0Heuristic: { keywords: [] }, authz: { scopes: policyScopes } },
      actor: ACTOR,
      origin: "promoted",
      ratifyToken: "billy",
      symbolReverse: () => B.symbolReverse,
      axes: B.axes,
      nodeHashOfPath,
      edgeModel: edgeModelVersion(),
      targetEscapes: B.targetEscapes,
      dynamicReach: dynamicReachCeiling,
    }).emit
  }, 180_000)

  it("drives the shipped v2 door over the exhaustive (X external to S) pool; 0 false-admit; reports recall", () => {
    const negation = (target: string, scope: string): GroundedFact =>
      ({
        kind: "negation",
        id: "ignored",
        tier: "T2",
        relationKind: "calls",
        target,
        scope,
        grounding: { entries: [] },
        edgeModel: "ignored",
        freshness: "FRESH",
        claims: [],
        authoring: "NEGATED",
      }) as unknown as NegationNode as unknown as GroundedFact
    const ceilingVerdict = (target: string, scope: string): string => {
      projC = { current: new Map(), cas: new Set() } as unknown as StoreProjection
      return classify(emitCeiling(negation(target, scope), AT))
    }

    const tally: Record<string, number> = {}
    const bump = (k: string): void => {
      tally[k] = (tally[k] ?? 0) + 1
    }
    let pool = 0,
      truthTrue = 0,
      admits = 0,
      admitTrue = 0,
      falseAdmits = 0
    let refutes = 0,
      refuteWrong = 0 // refute where tsc says NOT called = over-refute (recall cost, not soundness)
    let recallAdmitOnTrue = 0
    let ceilingAdmitOnTrue = 0,
      ceilingFalseAdmits = 0 // the parse-tolerant arm
    const falseAdmitEx: string[] = []
    const started = Date.now()

    let considered = 0
    outer: for (const t of B.targets) {
      for (const scope of B.scopes) {
        if (B.underScope(t.df, scope)) continue // X external to S (def not under S) — the meaningful negation
        if (++considered > HARD_CAP) {
          break outer
        }
        pool++
        const truthNegative = !B.calledInScope(t, scope) // the negative "X not called in S" is TRUE
        if (truthNegative) truthTrue++
        const v = B.judge(t.symbol, scope) // the SHIPPED door, over a fresh empty projection (reset inside judge)
        const vc = ceilingVerdict(t.symbol, scope) // the parse-tolerant arm on the SAME candidate + SAME truth
        if (vc === "admit") {
          if (truthNegative) ceilingAdmitOnTrue++
          else ceilingFalseAdmits++
        }
        bump(v)
        if (v === "admit") {
          admits++
          if (truthNegative) recallAdmitOnTrue++
          if (truthNegative) admitTrue++
          else {
            falseAdmits++
            if (falseAdmitEx.length < 20)
              falseAdmitEx.push(
                `${t.name} @ ${scope} (called: ${[...B.oracle.get(t.key)!.callFiles].filter((f) => B.underScope(f, scope)).join(",")})`,
              )
          }
        } else if (v === "refute") {
          refutes++
          if (truthNegative && !B.refInScope(t, scope)) refuteWrong++ // refuted but tsc sees no reference at all
        }
      }
    }
    const dur = ((Date.now() - started) / 1000).toFixed(1)

    // ── the report (the #95 number, self-contained + re-derivable from the tally above) ──
    const recall = truthTrue > 0 ? (recallAdmitOnTrue / truthTrue) * 100 : 0
    const admitPrecision = admits > 0 ? (admitTrue / admits) * 100 : 100
    /* eslint-disable no-console */
    console.log("\n=== #95/#99 M3 — SOUND-NEGATION BENCHMARK (atlas self, v2 door vs tsc oracle) ===")
    console.log(
      `targets: ${B.targets.length}   scopes: ${B.scopes.length}   pool (X ext to S): ${pool}${considered > HARD_CAP ? `  [TRUNCATED at HARD_CAP=${HARD_CAP} — pool larger]` : ""}   ${dur}s`,
    )
    console.log(
      `TRUE scoped-negatives in pool (tsc: X not called in S): ${truthTrue}  (${((truthTrue / pool) * 100).toFixed(1)}%)`,
    )
    console.log("--- door verdict distribution ---")
    for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
      console.log(`  ${k.padEnd(26)} ${n}  (${((n / pool) * 100).toFixed(1)}%)`)
    console.log("--- soundness (the headline) ---")
    console.log(`  ADMITs: ${admits}   admit-precision (admit∧true / admit): ${admitPrecision.toFixed(2)}%`)
    console.log(
      `  FALSE-ADMITS (admit but tsc says X IS called in S): ${falseAdmits}  ${falseAdmits === 0 ? "<= SOUND" : "<= UNSOUND BUG"}`,
    )
    if (falseAdmitEx.length) console.log("  false-admit examples:\n    " + falseAdmitEx.join("\n    "))
    console.log("--- net-recall (the #99 win, 0% floor → measured) ---")
    console.log(
      `  SHIPPED (sound) recall: admitted TRUE / all TRUE = ${recallAdmitOnTrue} / ${truthTrue} = ${recall.toFixed(1)}%`,
    )
    console.log(`  over-refute (refuted but tsc sees no reference at all): ${refuteWrong}`)
    const ceilRecall = truthTrue > 0 ? (ceilingAdmitOnTrue / truthTrue) * 100 : 0
    console.log("--- recall CEILING (parse-tolerant: drop tree-sitter :unparsed fail-closed, keep real channels) ---")
    console.log(
      `  achievable recall once the ~10 unparseable prod files parse: ${ceilingAdmitOnTrue} / ${truthTrue} = ${ceilRecall.toFixed(1)}%`,
    )
    console.log(`  ceiling arm false-admits (must still be 0 — the extra admits are all TRUE): ${ceilingFalseAdmits}`)
    console.log(`  ⇒ recall lost purely to the pinned grammar's parse gaps: ${(ceilRecall - recall).toFixed(1)} pts`)
    console.log("=====================================================================\n")
    /* eslint-enable no-console */

    // THE TEETH: the soundness guarantee. Never admit a negative tsc can refute.
    expect(falseAdmits).toBe(0)
    // sanity: the pool actually exercised the gate (guards a silently-empty bench).
    expect(pool).toBeGreaterThan(1000)
    expect(admits).toBeGreaterThan(0)
  }, 600_000)
})
