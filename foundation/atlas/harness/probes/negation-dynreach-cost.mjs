// REPRODUCE: node harness/probes/negation-dynreach-cost.mjs  (from repo root)
// Measures the ADR-0016 dynamic-reach leg's per-scope abstention cost across packages/*/src.
// EXPECTED (measured on atlas, 2026-08-13): scopes with dynamic-reach (ABSTAIN): 0 = 0%.
import ts from "typescript"
import { relative, resolve as presolve, dirname } from "node:path"
import { globSync } from "node:fs"
import { fileURLToPath } from "node:url"
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
  },
})
const rel = (fn) => relative(ROOT, presolve(fn)).split("\\").join("/")
const isNonLiteral = (a) => !!a && !ts.isStringLiteralLike(a)
function reachSites(sf) {
  const nsNames = new Set()
  const sites = []
  const pre = (n) => {
    if (ts.isNamespaceImport(n)) nsNames.add(n.name.text)
    ts.forEachChild(n, pre)
  }
  pre(sf)
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword && isNonLiteral(n.arguments[0])) sites.push("import(var)")
      const ex = n.expression
      const isReq =
        (ts.isIdentifier(ex) && ex.text === "require") ||
        (ts.isPropertyAccessExpression(ex) && ts.isIdentifier(ex.expression) && ex.expression.text === "require")
      if (isReq && isNonLiteral(n.arguments[0])) sites.push("require(var)")
      if (ts.isIdentifier(ex) && ex.text === "eval") sites.push("eval")
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Function")
      sites.push("new Function")
    if (
      ts.isElementAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      nsNames.has(n.expression.text) &&
      !ts.isStringLiteralLike(n.argumentExpression)
    )
      sites.push("ns[var]")
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return sites
}
const scopeOf = (p) => p.match(/^(packages\/[^/]+\/src)\//)?.[1] ?? null
const scopes = new Map()
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue
  const p = rel(sf.fileName)
  const s = scopeOf(p)
  if (!s) continue
  if (!scopes.has(s)) scopes.set(s, { files: 0, reach: 0 })
  const r = scopes.get(s)
  r.files++
  if (reachSites(sf).length) r.reach++
}
let withReach = 0
for (const [, r] of scopes) if (r.reach > 0) withReach++
console.log(
  "package-src scopes:",
  scopes.size,
  "| scopes with dynamic-reach (ABSTAIN):",
  withReach,
  "=",
  ((withReach / scopes.size) * 100).toFixed(0) + "%",
)
