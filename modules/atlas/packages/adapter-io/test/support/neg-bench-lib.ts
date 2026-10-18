// @atlas/adapter-io — test/support/neg-bench-lib.ts  (#95/#99 — shared apparatus for the negation benchmarks)
//
// The ONE assembly both negation-benchmark arms drive, so the deterministic gate + the independent tsc oracle
// are byte-identical across them:
//   · `negation-bench.test.ts`          — the exhaustive gate sweep (0-false-admit + net-recall, no LLM).
//   · `negation-proposer-bench.test.ts` — the A1/A3 arm (a cheap LLM proposes; this SAME gate + oracle judge).
// Not a test file itself (no `.test.ts`), so vitest does not run it; it is imported by the two that do.

import { readFileSync, globSync } from "node:fs"
import { dirname, relative, resolve as presolve } from "node:path"
import ts from "typescript"
import { deserializeSCIP } from "@c4312/scip"
import { asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { build, createSymbolReverse, nodeHashOfPath, canonicalizeSymbol } from "@atlas/index"
import type { Axes, SymbolReverseApi } from "@atlas/index"
import type { StoreProjection, GroundedFact, NegationNode } from "@atlas/knowledge"
import type { CommitDecision, CommitResult } from "../../src/sidecar.js"
import type { DiskStore } from "../../src/store.js"
import { createGovernedEmit } from "../../src/governed-emit.js"
import { walkFileTree } from "../../src/fs.js"
import { foldAstUnits, initAst } from "../../src/ast.js"
import { readScipOrEmpty, readScipIndexerName } from "../../src/scip.js"
import { buildTargetEscapes } from "../../src/escape/target-escapes.js"
import { buildDynamicReach } from "../../src/escape/dynamic-reach.js"
import { underScope } from "../../src/anchor-scope.js"
import { edgeModelVersion } from "../../src/wire.js"

const ACTOR = "bench@atlas.test"
const AT = asHash("cafe") as unknown as Hash

/** The SCIP-symbol ⋈ tsc-oracle key: canon(symbol) + trailing descriptor name (mirrors escape-ts-oracle-agree.mjs). */
export function scipName(symbol: string): string | null {
  const m = symbol.match(/^scip-typescript npm (\S+) (\S+) (.+)$/)
  if (!m) return null
  const seg = m[3]!.replace(/`/g, "").split("/")
  const i = seg.findIndex((s) => /\.tsx?$/.test(s))
  if (i === -1 || i + 1 >= seg.length) return null
  const after = seg.slice(i + 1)
  if (after.length !== 1) return null
  const name = after[0]!.replace(/\(\)\.?$/, "").replace(/[#.]$/, "")
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : null
}

export interface Target {
  symbol: string
  df: string
  name: string
  key: string
} // symbol = canonical SCIP; key = df#name
export interface OracleRec {
  callFiles: Set<string>
  refFiles: Set<string>
}

/** The independent tsc ground truth: per exported decl, the files where it is CALLED / merely REFERENCED. */
export function buildOracle(ROOT: string): Map<string, OracleRec> {
  const rootNames = globSync("packages/*/src/**/*.ts", { cwd: ROOT })
    .filter((p) => !/\.test\.ts$/.test(p) && !/\/test\//.test(p))
    .map((p) => presolve(ROOT, p))
  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: ROOT,
      paths: { "@atlas/*": ["packages/*/src/index.ts"] },
    },
  })
  const checker = program.getTypeChecker()
  const rel = (fn: string): string => relative(ROOT, presolve(fn)).split("\\").join("/")
  const decls = new Map<ts.Declaration, { name: string; df: string; sym: ts.Symbol; rec: OracleRec }>()
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue
    const p = rel(sf.fileName)
    if (!p.startsWith("packages/") || !/\/src\//.test(p)) continue
    const modSym = checker.getSymbolAtLocation(sf)
    if (!modSym) continue
    for (const ex of checker.getExportsOfModule(modSym)) {
      let s = ex
      if (s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s)
      const d = (s.getDeclarations() || [])[0]
      if (!d) continue
      const df = rel(d.getSourceFile().fileName)
      if (!df.startsWith("packages/") || !/\/src\//.test(df)) continue
      if (!decls.has(d))
        decls.set(d, { name: s.getName(), df, sym: s, rec: { callFiles: new Set(), refFiles: new Set() } })
    }
  }
  const byDecl = new Map<ts.Declaration, ts.Declaration>()
  for (const [d, r] of decls) for (const alt of r.sym.getDeclarations() || []) byDecl.set(alt, d)
  const isCallee = (n: ts.Node): boolean => {
    const p = n.parent
    return !!p && ((ts.isCallExpression(p) && p.expression === n) || (ts.isNewExpression(p) && p.expression === n))
  }
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue
    const p = rel(sf.fileName)
    if (!p.startsWith("packages/")) continue
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        let s = checker.getSymbolAtLocation(node)
        if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s)
        for (const decl of s?.getDeclarations() ?? []) {
          const key = byDecl.get(decl)
          if (!key) continue
          const r = decls.get(key)!
          if (ts.getNameOfDeclaration(decl) === node) break
          r.rec.refFiles.add(p)
          if (isCallee(node)) r.rec.callFiles.add(p)
          break
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  const oracle = new Map<string, OracleRec>()
  for (const r of decls.values()) oracle.set(`${r.df}#${r.name}`, r.rec)
  return oracle
}

/** Every canonical global def symbol in the index that JOINS the tsc oracle, plus the real src scopes. */
export function buildTargets(SCIP: string, oracle: Map<string, OracleRec>): { targets: Target[]; scopes: string[] } {
  const idx = deserializeSCIP(readFileSync(SCIP))
  const DEF = 1
  const seen = new Map<string, Target>()
  const scopes = new Set<string>()
  for (const doc of idx.documents) {
    if (!/^packages\/[^/]+\/src\/.+\.tsx?$/.test(doc.relativePath) || /\.test\.tsx?$/.test(doc.relativePath)) continue
    scopes.add(dirname(doc.relativePath))
    for (const o of doc.occurrences) {
      if (!(o.symbolRoles & DEF)) continue
      const name = scipName(o.symbol)
      if (!name) continue
      const symbol = canonicalizeSymbol(o.symbol)
      const key = `${doc.relativePath}#${name}`
      if (!oracle.has(key) || seen.has(symbol)) continue
      seen.set(symbol, { symbol, df: doc.relativePath, name, key })
    }
  }
  return { targets: [...seen.values()], scopes: [...scopes].sort() }
}

export type Verdict = "admit" | "refute" | `abstain:${string}`

/** Map an `EmitOut` to a compact verdict label. */
export function classify(out: { emitted: boolean; rejected?: string }): Verdict {
  if (out.emitted) return "admit"
  const r = out.rejected ?? ""
  if (r.includes("negation refuted")) return "refute"
  for (const reason of [
    "scope-open",
    "escape-open",
    "scope-dynamic",
    "target-unresolvable",
    "target-not-global",
    "scope-empty",
  ]) {
    if (r.includes(`(${reason})`)) return `abstain:${reason}`
  }
  return `abstain:other`
}

export interface NegBench {
  axes: Axes
  symbolReverse: SymbolReverseApi
  targetEscapes: (t: string) => readonly string[]
  dynamicReach: (s: string) => readonly string[]
  oracle: Map<string, OracleRec>
  targets: Target[]
  scopes: string[]
  /** ADMIT/REFUTE/ABSTAIN of the SHIPPED v2 door for (target, scope), over a fresh empty projection. */
  judge(target: string, scope: string): Verdict
  /** The SAME shipped v2 door but with the #99 collapsed-local OPAQUE gate turned OFF — the symbol-reverse view
   *  is rebuilt with the indexer identity ABSENT, so `opaqueRefSources()` is empty and the (b0) opaque abstain
   *  (governed-emit-negation.ts:259) never fires. Used ONLY by the AC-6 non-vacuity TEETH: with the gate off the
   *  cross-package tsc-false negatives (whose real caller scip-typescript collapsed onto an opaque `local`) fall
   *  through to the refute/admit path — `reverseCallers` cannot see the collapsed caller — and are ADMITTED,
   *  reproducing the pre-fix false-admit. That the number RISES off 0 proves the 0 is EARNED by the opaque gate. */
  judgeGateOff(target: string, scope: string): Verdict
  /** The SAME shipped v2 door with its REVERSE-CALLER leg BLINDED (`reverseCallers` ≡ `[]`), everything else
   *  byte-identical. This is the AC-6 non-vacuity TEETH that BITES on the operating (dist-form) index: gate (c)
   *  — `reverseCallers(X) ∩ S == ∅ ⇒ the negative stands` (governed-emit-negation.ts) — is the leg the door's
   *  soundness actually rests on here, so defeating it turns every REFUTE into an ADMIT and the tsc-FALSE
   *  negatives false-admit. `judgeGateOff` no longer bites on this index (see the AC-6 comment). */
  judgeCallersBlind(target: string, scope: string): Verdict
  /** tsc ground truth: is X CALLED anywhere under S? (⇒ the negative "X not called in S" is FALSE). */
  calledInScope(t: Target, scope: string): boolean
  /** tsc ground truth: is X REFERENCED (any position) anywhere under S? */
  refInScope(t: Target, scope: string): boolean
  underScope(anchor: string, scope: string): boolean
}

/**
 * Assemble the deterministic gate + the independent tsc oracle + the candidate pool over a fresh index. `judge`
 * drives the REAL shipped door (`createGovernedEmit(...).emit` on a negation node) with permissive authz so a
 * gate-1 ADMIT surfaces as `emitted:true`, over an in-memory projection RESET per call (independent single-negation
 * invocation; a DiskStore is O(n²) over thousands of admits).
 */
export async function setupNegBench(ROOT: string, SCIP: string): Promise<NegBench> {
  await initAst()
  const scipOutput = readScipOrEmpty(SCIP)
  const rawTree = walkFileTree(ROOT)
  const axes = build(foldAstUnits(rawTree), scipOutput)
  // #99 — thread the real indexer identity so the collapsed-local gate (`opaqueRefSources`) engages on the
  // scip-typescript index the bench runs over (the whole point of the F4 arm: the CLASS-2 false-admits abstain).
  const symbolReverse = createSymbolReverse(scipOutput, { indexerName: readScipIndexerName(SCIP) })
  const te = buildTargetEscapes({ scipPath: SCIP, repoPath: ROOT })
  const dr = buildDynamicReach(rawTree)
  if (!te || !dr) throw new Error("v2 legs failed to build (astWarmed? scip-typescript indexer?)")
  const oracle = buildOracle(ROOT)
  const { targets, scopes } = buildTargets(SCIP, oracle)

  const policyScopes: Record<string, readonly string[]> = {}
  for (const s of scopes) policyScopes[s] = [ACTOR]
  process.env.ATLAS_RATIFY_TOKEN = "billy"

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

  // A single-negation door over a fresh in-memory projection RESET per call (a DiskStore is O(n²) over thousands
  // of admits). Factored so the AC-6 teeth's SECOND door shares byte-identical wiring — SAME store shape, policy,
  // axes, escape/dynamic legs — differing ONLY in the symbol-reverse view it is handed (gate-ON vs gate-OFF).
  const mkDoor = (sr: SymbolReverseApi): ((target: string, scope: string) => Verdict) => {
    let proj: StoreProjection = { current: new Map(), cas: new Set() } as unknown as StoreProjection
    const store = {
      commitProjection<T>(decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> {
        const d = decide(proj)
        if (d.next !== undefined) proj = d.next
        return { settled: true, out: d.out }
      },
    } as unknown as DiskStore
    const emit = createGovernedEmit({
      store,
      gate: { gateHolds: () => "HOLDS" } as never,
      policy: { t0Heuristic: { keywords: [] }, authz: { scopes: policyScopes } },
      actor: ACTOR,
      origin: "promoted",
      ratifyToken: "billy",
      symbolReverse: () => sr,
      axes,
      nodeHashOfPath,
      edgeModel: edgeModelVersion(),
      targetEscapes: te,
      dynamicReach: dr,
    }).emit
    return (target, scope) => {
      proj = { current: new Map(), cas: new Set() } as unknown as StoreProjection
      return classify(emit(negation(target, scope), AT))
    }
  }

  // GATE-ON: the shipped view, with the real indexer identity threaded so `opaqueRefSources()` engages (#99 F4).
  const judge = mkDoor(symbolReverse)
  // GATE-OFF: rebuild the symbol-reverse with the indexer identity ABSENT ⇒ the collapsed-local heuristic is off
  // and `opaqueRefSources()` is empty (fail-closed to prior behavior). The (b0) opaque abstain never fires, so the
  // cross-package tsc-false negatives return to the pre-fix false-admit — the AC-6 non-vacuity witness.
  const symbolReverseGateOff = createSymbolReverse(scipOutput, {})
  const judgeGateOff = mkDoor(symbolReverseGateOff)
  // CALLERS-BLIND: the shipped view with ONLY the reverse-caller leg defeated — the single-leg mutation that is
  // load-bearing on a dist-form index (gate (c) refute). Everything else (opaque gate, escape, dynamic, resolves)
  // is the byte-identical shipped view.
  const judgeCallersBlind = mkDoor({ ...symbolReverse, reverseCallers: () => [] })

  return {
    axes,
    symbolReverse,
    targetEscapes: te,
    dynamicReach: dr,
    oracle,
    targets,
    scopes,
    underScope,
    judge,
    judgeGateOff,
    judgeCallersBlind,
    calledInScope(t, scope) {
      for (const f of oracle.get(t.key)!.callFiles) if (underScope(f, scope)) return true
      return false
    },
    refInScope(t, scope) {
      for (const f of oracle.get(t.key)!.refFiles) if (underScope(f, scope)) return true
      return false
    },
  }
}
