// REPRODUCE: node harness/probes/escape-recall-ceiling.mjs  (from repo root)
// The sound-groundable recall CEILING for ADR-0016: fraction of exported top-level
// targets for which the static import-closure is sound (non-escaping values + pure
// types). Independent tsc extractor; the escape engine's own oracle.
// DECIDING MEASUREMENT (corrected): does the SOUND macro (import-closure)
// negation recover recall? The static import-closure is sound for a target X
// IFF X never ESCAPES into shared mutable state (global / DI container / registry
// / property / data structure) — otherwise a scope that never imports X's module
// could still reach X at runtime through that shared state. Escape is the true
// breaker; dynamic module load is one sub-case.
//
// Over-approximated (SOUND-direction) escape: a runtime reference to X is SAFE
// only if it is (1) the callee of a call `X(...)`, (2) the callee of `new X()`,
// or (3) an import/export linkage (which the closure already tracks). ANY other
// position — passed as an argument, `X.member`, assigned, put in a literal —
// counts as ESCAPE (conservative: over-counts escape, never under-counts). A
// target whose EVERY reference is safe => import-closure is sound for it =>
// negation groundable. Report the non-escaping fraction (the sound-macro recall
// floor). Pure TYPE symbols are erased at runtime (no dynamic dispatch) and are
// reported separately — a candidate for a cheaper always-sound path.
import ts from "typescript"
import { relative, resolve as presolve } from "node:path"
import { globSync } from "node:fs"

import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
const ROOT = presolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
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
const rel = (fn) => relative(ROOT, presolve(fn)).split("\\").join("/")

// linkage ancestors: the reference is part of an import/export statement.
const LINKAGE = new Set([
  ts.SyntaxKind.ImportSpecifier,
  ts.SyntaxKind.ImportClause,
  ts.SyntaxKind.NamespaceImport,
  ts.SyntaxKind.ExportSpecifier,
  ts.SyntaxKind.ExportAssignment,
  ts.SyntaxKind.ImportEqualsDeclaration,
])
function isLinkage(node) {
  let p = node.parent
  for (let i = 0; p && i < 4; i++, p = p.parent) if (LINKAGE.has(p.kind)) return true
  return false
}
// SAFE (non-escaping) position for a runtime value reference.
function isSafeRef(node) {
  const p = node.parent
  if (!p) return false
  if (ts.isCallExpression(p) && p.expression === node) return true // X(...)
  if (ts.isNewExpression(p) && p.expression === node) return true // new X()
  if (isLinkage(node)) return true // import/export linkage
  return false
}

// classify each global value target by escape; collect pure types separately.
const decls = new Map() // declNode -> {name, isType, refs:[], escaped:false}
function isPureType(sym) {
  const f = sym.getFlags()
  const typeish = ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.TypeParameter
  const valueish =
    ts.SymbolFlags.Function |
    ts.SymbolFlags.Variable |
    ts.SymbolFlags.Class |
    ts.SymbolFlags.Enum |
    ts.SymbolFlags.Method |
    ts.SymbolFlags.Property
  return f & typeish && !(f & valueish)
}

// seed targets: exported top-level decls of each package module.
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
      decls.set(d, { name: s.getName(), isType: isPureType(s), sym: s, escaped: false, refs: 0, escapeSites: [] })
  }
}

// walk all identifiers; for each that resolves to a seeded target, classify.
const declSet = decls
const byDecl = new Map()
for (const [d, rec] of declSet) for (const alt of rec.sym.getDeclarations() || []) byDecl.set(alt, d)
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue
  const p = rel(sf.fileName)
  if (!p.startsWith("packages/")) continue
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      let s = checker.getSymbolAtLocation(node)
      if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s)
      for (const decl of s?.getDeclarations() ?? []) {
        const key = byDecl.get(decl)
        if (!key) continue
        const rec = declSet.get(key)
        // skip the declaration name itself
        if (decl.name === node) continue
        rec.refs++
        if (!rec.isType && !isSafeRef(node)) {
          rec.escaped = true
          if (rec.escapeSites.length < 2)
            rec.escapeSites.push(p + ":" + sf.getLineAndCharacterOfPosition(node.getStart()).line)
        }
        break
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

const all = [...declSet.values()]
const values = all.filter((r) => !r.isType)
const types = all.filter((r) => r.isType)
const valNonEscaping = values.filter((r) => !r.escaped)
const valWithRefs = values.filter((r) => r.refs > 0)
const valNonEscapingWithRefs = valWithRefs.filter((r) => !r.escaped)
console.log("--- ESCAPE ANALYSIS (sound-macro recall floor) ---")
console.log(`total exported top-level targets: ${all.length}  (value=${values.length}, pure-type=${types.length})`)
console.log(
  `VALUE targets non-escaping (import-closure is SOUND for them): ${valNonEscaping.length}/${values.length} = ${((valNonEscaping.length / values.length) * 100).toFixed(1)}%`,
)
console.log(
  `  ...restricted to value targets that are actually referenced: ${valNonEscapingWithRefs.length}/${valWithRefs.length} = ${((valNonEscapingWithRefs.length / (valWithRefs.length || 1)) * 100).toFixed(1)}%`,
)
console.log(`PURE-TYPE targets (runtime-erased, no dynamic hole -> always sound path): ${types.length}`)
console.log(
  `\ncombined sound-groundable (non-escaping values + all types): ${valNonEscaping.length + types.length}/${all.length} = ${(((valNonEscaping.length + types.length) / all.length) * 100).toFixed(1)}%`,
)
console.log("\nsample ESCAPING value targets (import-closure NOT sound -> would abstain):")
for (const r of values.filter((r) => r.escaped).slice(0, 8))
  console.log(`  ${r.name.padEnd(24)} first-escape: ${r.escapeSites[0] ?? "?"}`)
console.log("\nsample NON-ESCAPING value targets (sound negation recoverable):")
for (const r of valNonEscapingWithRefs.slice(0, 8)) console.log(`  ${r.name.padEnd(24)} refs=${r.refs}`)
