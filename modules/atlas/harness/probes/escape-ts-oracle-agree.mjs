// REPRODUCE: node harness/probes/escape-ts-oracle-agree.mjs  (from repo root, fresh .atlas/index.scip)
// M1 SOUNDNESS GATE: per-target escape-verdict agreement between the
// SCIP⋈tree-sitter join (the language-agnostic engine) and the tsc oracle
// (independent second extractor). Restricted to the SAME target set: atlas
// package exports. The ONLY failure that matters is UNSOUND disagreement:
// join says NON-ESCAPING while oracle says ESCAPING (a real runtime escape the
// engine missed => a false-admit risk). join=escaping / oracle=non-escaping is
// acceptable over-approximation (costs recall, never soundness).
// EXPECTED (measured on atlas, 2026-08-13): shared targets compared: 1135,
// AGREE 100.0%, UNSOUND 0, over-approx 0.
import ts from "typescript"
import { deserializeSCIP } from "@c4312/scip"
import { readFileSync } from "node:fs"
import { relative, resolve as presolve, dirname } from "node:path"
import { globSync } from "node:fs"
import Parser from "web-tree-sitter"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const ROOT = presolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const require = createRequire(import.meta.url)

// ================= tsc oracle: per-target escape, keyed by defFile#name =================
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
const LINKAGE_TS = new Set([
  ts.SyntaxKind.ImportSpecifier,
  ts.SyntaxKind.ImportClause,
  ts.SyntaxKind.NamespaceImport,
  ts.SyntaxKind.ExportSpecifier,
  ts.SyntaxKind.ExportAssignment,
  ts.SyntaxKind.ImportEqualsDeclaration,
])
const isLinkageTs = (n) => {
  let p = n.parent
  for (let i = 0; p && i < 4; i++, p = p.parent) if (LINKAGE_TS.has(p.kind)) return true
  return false
}
// a value ref sitting in a TYPE position (typeof X, X used as a type) is runtime-
// erased -> non-escaping (same sound rule the join implements via tree-sitter).
const inTypeTsc = (n) => {
  let p = n.parent
  for (let i = 0; p && i < 8; i++, p = p.parent) {
    if (ts.isTypeNode(p) || ts.isTypeQueryNode(p) || p.kind === ts.SyntaxKind.TypeQuery) return true
  }
  return false
}
const isSafeTsc = (n) => {
  const p = n.parent
  if (!p) return false
  if (ts.isCallExpression(p) && p.expression === n) return true
  if (ts.isNewExpression(p) && p.expression === n) return true
  if (isLinkageTs(n)) return true
  if (inTypeTsc(n)) return true
  return false
}
const isPureType = (sym) => {
  const f = sym.getFlags()
  const t = ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.TypeParameter
  const v =
    ts.SymbolFlags.Function |
    ts.SymbolFlags.Variable |
    ts.SymbolFlags.Class |
    ts.SymbolFlags.Enum |
    ts.SymbolFlags.Method |
    ts.SymbolFlags.Property
  return f & t && !(f & v)
}
const decls = new Map() // declNode -> rec
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
    if (!decls.has(d)) decls.set(d, { name: s.getName(), df, isType: isPureType(s), sym: s, escaped: false, refs: 0 })
  }
}
const byDecl = new Map()
for (const [d, rec] of decls) for (const alt of rec.sym.getDeclarations() || []) byDecl.set(alt, d)
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
        const rec = decls.get(key)
        if (decl.name === node) continue
        rec.refs++
        if (!rec.isType && !isSafeTsc(node)) rec.escaped = true
        break
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}
// oracle verdict keyed by df#name (type -> non-escaping/erased)
const oracle = new Map()
for (const rec of decls.values())
  oracle.set(`${rec.df}#${rec.name}`, { escaped: rec.isType ? false : rec.escaped, isType: rec.isType, refs: rec.refs })

// ================= SCIP⋈tree-sitter join: per-target escape =================
await Parser.init()
const TSG = await Parser.Language.load(require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm"))
const parser = new Parser()
parser.setLanguage(TSG)
const LINKAGE = new Set([
  "import_specifier",
  "import_clause",
  "namespace_import",
  "export_specifier",
  "export_clause",
  "namespace_export",
])
const TYPE_CTX = new Set([
  "type_annotation",
  "type_arguments",
  "type_parameters",
  "predefined_type",
  "generic_type",
  "type_alias_declaration",
  "interface_declaration",
  "type_predicate",
  "union_type",
  "intersection_type",
  "object_type",
  "function_type",
  "type_query",
  "index_type_query",
  "lookup_type",
  "conditional_type",
  "extends_type_clause",
  "implements_clause",
  "mapped_type_clause",
  "tuple_type",
  "array_type",
  "nested_type_identifier",
])
function tsIsSafe(node) {
  if (node.type === "type_identifier") return true
  const p = node.parent
  if (!p) return false
  if (p.type === "call_expression" && p.childForFieldName("function")?.id === node.id) return true
  if (p.type === "new_expression" && p.childForFieldName("constructor")?.id === node.id) return true
  let a = p
  for (let i = 0; a && i < 6; i++, a = a.parent) {
    if (LINKAGE.has(a.type)) return true
    if (TYPE_CTX.has(a.type)) return true
  }
  return false
}
// descriptor NAME of a SCIP symbol: single trailing top-level descriptor -> Name, else null.
function scipName(symbol) {
  const m = symbol.match(/^scip-typescript npm (\S+) (\S+) (.+)$/)
  if (!m) return null
  const seg = m[3].replace(/`/g, "").split("/")
  const i = seg.findIndex((s) => /\.tsx?$/.test(s))
  if (i === -1 || i + 1 >= seg.length) return null
  const after = seg.slice(i + 1)
  if (after.length !== 1) return null
  const name = after[0].replace(/\(\)\.?$/, "").replace(/[#.]$/, "")
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : null
}
const idx = deserializeSCIP(readFileSync(`${ROOT}/.atlas/index.scip`))
const DEF = 1
// canonicalize a SCIP symbol: map a cross-package dist/*.d.ts symbol back to its
// source src/*.ts form (mirrors @atlas/index canonicalizeSymbol / #189). Without
// this a target's escaping ref in ANOTHER package resolves through the built
// .d.ts symbol, never unifies with the source def, and is invisible -> a
// false "non-escaping" -> a false-admit risk in the negation gate.
const canon = (s) => s.replace(/ dist\/(?:src\/)?((?:[^`]*\/)?`[^`]+)\.d\.ts`/, " src/$1.ts`")
// pass 1: canonical symbol -> repo-relative def path (from the DEF occurrence's doc).
const symDefPath = new Map()
for (const doc of idx.documents) {
  if (!/^packages\/[^/]+\/src\/.+\.tsx?$/.test(doc.relativePath) || /\.test\.tsx?$/.test(doc.relativePath)) continue
  for (const o of doc.occurrences)
    if (o.symbolRoles & DEF && scipName(o.symbol)) symDefPath.set(canon(o.symbol), doc.relativePath)
}
// pass 2: collect references, keyed by the CANONICAL symbol's def path + name.
const refsByDoc = new Map()
for (const doc of idx.documents) {
  if (!/^packages\/[^/]+\/src\/.+\.tsx?$/.test(doc.relativePath) || /\.test\.tsx?$/.test(doc.relativePath)) continue
  const refs = []
  for (const o of doc.occurrences) {
    if (o.symbolRoles & DEF) continue
    const cs = canon(o.symbol)
    const df = symDefPath.get(cs),
      name = scipName(cs)
    if (df && name) refs.push({ o, k: { df, name } })
  }
  refsByDoc.set(doc.relativePath, refs)
}
const joinEscaped = new Map() // df#name -> escaped bool (init false when seen)
for (const [relp, refs] of refsByDoc) {
  if (!refs.length) continue
  const tree = parser.parse(readFileSync(`${ROOT}/${relp}`, "utf8"))
  for (const { o, k } of refs) {
    const key = `${k.df}#${k.name}`
    const node = tree.rootNode.descendantForPosition({ row: o.range[0], column: o.range[1] })
    if (!node) continue
    if (!joinEscaped.has(key)) joinEscaped.set(key, false)
    if (!tsIsSafe(node)) joinEscaped.set(key, true)
  }
}

// ================= confusion matrix on the shared key set =================
let both = 0,
  unsound = 0,
  overapprox = 0,
  agree = 0
const unsoundEx = [],
  overEx = []
for (const [key, jEsc] of joinEscaped) {
  const orc = oracle.get(key)
  if (!orc) continue
  both++
  const oEsc = orc.escaped
  if (jEsc === oEsc) agree++
  else if (!jEsc && oEsc) {
    unsound++
    if (unsoundEx.length < 12) unsoundEx.push(key)
  } // join safe, oracle escape = UNSOUND
  else {
    overapprox++
    if (overEx.length < 8) overEx.push(key)
  } // join escape, oracle safe = over-approx
}
console.log("=== M1 AGREEMENT (shared atlas-export targets) ===")
console.log("shared targets compared      :", both)
console.log("AGREE                        :", agree, `(${((agree / both) * 100).toFixed(1)}%)`)
console.log("UNSOUND (join safe/oracle esc):", unsound, unsound === 0 ? " <= SOUND" : " <= BUG")
console.log(
  "over-approx (join esc/oracle safe):",
  overapprox,
  `(recall cost, ${((overapprox / both) * 100).toFixed(1)}%)`,
)
if (unsoundEx.length) console.log("UNSOUND examples:", unsoundEx.join(", "))
console.log("over-approx examples:", overEx.join(", "))
