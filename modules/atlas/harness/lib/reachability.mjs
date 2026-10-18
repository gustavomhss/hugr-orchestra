// harness/lib/reachability.mjs — the VALUE-vs-TYPE reachability analyser behind reference-model-guard.
//
// It lives in its own module, like drift-patterns.mjs, so a test can falsify it without importing a
// top-level sweep and a `process.exit`. An analyser nobody can falsify is not evidence.
//
// ── WHAT IT COMPUTES ─────────────────────────────────────────────────────────────────────────────────
// For every production module (`packages/<pkg>/src/**`), the set of OTHER production modules that reach
// each of its exports, split into two relations that are NOT the same thing:
//
//   VALUE reachability — the importer holds the runtime binding. `import { createGuard } from …`.
//   TYPE  reachability — the importer only names the declaration. `import type { PhasePushSource } from …`
//                        (or an inline `import { type X, y }`). Erased at emit; NOTHING runs.
//
// ── WHY THIS FILE USES THE TYPESCRIPT COMPILER, AND WHY THAT WAS NOT OPTIONAL ────────────────────────
// The first three revisions read source with a hand-written scanner. Each one shipped a FAIL-OPEN — a
// genuinely dead module vanishing from the ledger while the gate printed OK — and each fix was correct
// about its case and wrong about its class:
//
//   1. block comments stripped before line comments: `packages/<star>/src` in a `//` line opened a phantom
//      block comment that swallowed the imports beneath it.
//   2. one `${` depth counter: a `}` from an object literal drove it to zero and a nested backtick then
//      closed the OUTER template.
//   3. REGEX LITERALS: `` /`/g `` opened an unterminated template, `/a\/*b/` opened a phantom block
//      comment, and `/}/g` inside an interpolation reopened the very hole fix 2 had just closed.
//
// Three rounds, three holes, all in lexing. Telling a regex from division needs the preceding token; a
// correct JS/TS lexer is not a 300-line side project, and every miss fails OPEN and SILENT in a gate whose
// job is to not miss things. So the lexing is delegated to `typescript` (a direct devDependency), which
// this repo already builds with. Comments, strings, templates, nested interpolations and regex literals
// stop being this file's problem.
//
// The type/value split is now read from the AST's own `isTypeOnly` flags rather than inferred from
// syntax. `verbatimModuleSyntax: true` (tsconfig.base.json) remains the reason the flags are TRUSTWORTHY —
// under it TypeScript refuses to elide a value import used only as a type, so a type-only import must be
// written as one and the flag cannot disagree with the emit. That argument is now a CROSS-CHECK on the
// mechanism instead of being the mechanism.
//
// ── HOW STRONGLY EACH NUMBER IS EVIDENCED — they are NOT equal, and saying so is the point ──────────
// This file has published a confident wrong number in every round but the last, so the confidence is now
// itemised rather than averaged:
//
//   THE MODULE SET (54) and THE VALUE-EXPORT COUNT (226) are corroborated by two checks that do not
//   reduce to parsing this source at all. One recomputes reachability from the EMITTED
//   `dist/**` JavaScript, where tsc has already deleted every type-only import. The other `import()`s
//   every emitted module at RUNTIME and reads `Object.keys` of the ESM namespace. All 166 production
//   modules map to emitted output, 0 missing, and both agree on the path set AND on each module's export
//   NAMES. That is as close to ground truth as this repo can get without executing the product.
//
//   TYPE-REACHABILITY (7) is weaker, and deliberately not claimed at parity. The emitted JS cannot
//   testify about it — types are erased in exactly the artifact that corroborates the other two. The
//   available corroboration is `dist/**/*.d.ts`, which confirms 5 of the 7; `retrieval/src/own.ts` and
//   `retrieval/src/pack.ts` are used in positions (a structural constraint on an injected port, and a
//   compile-time BIND witness) that never escape into a declaration file, so no emitted artifact can see
//   them. Those two rest on this parser plus hand verification.
//
// A warning, from making the mistake while writing this paragraph: the FIRST version of the .d.ts check
// grep'd the declaration text and reported 7 of 7, because `OwnApi` and `PackApi` appear in a PROSE
// COMMENT in `push.d.ts`. Parse the .d.ts; do not search it.
//
// ── LIMITS, STATED ───────────────────────────────────────────────────────────────────────────────────
// DIRECT, NOT TRANSITIVE. "Does some other production module import this?", not "is this reachable from an
// entrypoint". A closed ring of modules that only import each other passes. Deliberate: it is the relation
// the finding was measured in, and a transitive walk needs a root set the barrels make ambiguous.
//
// INLINE `import(…)` TYPE NODES ARE NOT SEEN. The walk visits `sf.statements` only, so a type consumed
// solely as `readonly gate: import('@atlas/tools').TruthGate` — the `ts.ImportTypeNode` form — does not
// register as a type use. `adapter-io/src/wire.ts` uses it 12 times. This cannot hide a dead module: an
// `import(…)` type node is always a TYPE position, so the only thing it can affect is `typeReachable`,
// and only ever by under-reporting it. No ledger flag is wrong today (checked); if one becomes wrong, the
// gate fails LOUD with MISCLASSIFIED REACH rather than dropping anything. Stated because "no current
// instance" is what let three fail-opens ship.

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname, relative, sep } from "node:path"
import ts from "typescript"

/** Packages that EXIST to be consumed by tests. Their `src` is harness, not product; "no production
 *  caller" is their normal, correct state and flagging them would be noise. */
const TEST_ONLY_PACKAGES = new Set(["e2e", "e2e-blackbox"])

/** Every production `.ts` under `packages/<pkg>/src`. Tests, declarations and build output are not product. */
export function productionModules(pkgsDir) {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      // `.claude` holds one full worktree checkout PER SEAT. Descending into it would count a sibling
      // seat's copy of this very tree as a caller of itself. It can only appear at the repo root, never
      // below this walk root, so on a normal tree the skip never fires. It is covered by a fixture in
      // reachability.test.mjs rather than by a runtime assertion here: an assertion that cannot fire is
      // the same decoration this gate exists to argue against.
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === ".claude") continue
        walk(join(dir, e.name))
        continue
      }
      if (!/\.ts$/.test(e.name) || /\.d\.ts$/.test(e.name) || /\.test\.ts$/.test(e.name)) continue
      out.push(join(dir, e.name))
    }
  }
  for (const pkg of readdirSync(pkgsDir)) {
    if (TEST_ONLY_PACKAGES.has(pkg)) continue
    const src = join(pkgsDir, pkg, "src")
    if (existsSync(src)) walk(src)
  }
  return out.sort()
}

/** `'./x.js'` → the sibling `x.ts`; `'@atlas/pkg'` → that package's barrel. Every workspace package
 *  publishes exactly one entry (`exports: { "." : … }`), so there is no subpath case to handle. */
function resolveSpecifier(pkgsDir, fromFile, spec) {
  if (spec.startsWith(".")) {
    const p = join(dirname(fromFile), spec.replace(/\.js$/, ".ts"))
    return existsSync(p) ? p : null
  }
  const m = /^@atlas\/([a-z][a-z-]*)$/.exec(spec)
  if (m === null) return null
  const p = join(pkgsDir, m[1], "src", "index.ts")
  return existsSync(p) ? p : null
}

const hasExportModifier = (node) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
const hasDefaultModifier = (node) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)

/** Every binding name a destructuring pattern introduces — `export const { a, b } = x` exports both. */
function bindingNames(name, out) {
  if (ts.isIdentifier(name)) out.push(name.text)
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) if (ts.isBindingElement(el)) bindingNames(el.name, out)
  }
  return out
}

/**
 * Parse one module into { exports, reexports, imports } using the real parser.
 *
 * `exports`  name → 'value' | 'type'   (a DECLARATION in this file, `default` included)
 * `reexports` { spec, kind, names }    (`names: null` = `export * from`; otherwise {as, local} pairs,
 *                                       where `local: '*'` is the namespace form `export * as ns from`)
 * `imports`  { spec, name, kind }      (`name: '*'` = default or namespace binding: the whole module)
 */
function parseModule(file) {
  const text = readFileSync(file, "utf8")
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  const exports = new Map()
  const reexports = []
  const imports = []

  for (const node of sf.statements) {
    // ── imports ──────────────────────────────────────────────────────────────────────────────────────
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text
      const clause = node.importClause
      if (clause === undefined) continue // bare `import './x.js'` for side effects: no binding to credit
      const clauseType = clause.isTypeOnly
      // A default binding takes the module's runtime object; recorded as the whole module.
      if (clause.name !== undefined) imports.push({ spec, name: "*", kind: clauseType ? "type" : "value" })
      const nb = clause.namedBindings
      if (nb !== undefined && ts.isNamespaceImport(nb)) {
        imports.push({ spec, name: "*", kind: clauseType ? "type" : "value" })
      } else if (nb !== undefined && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          // `propertyName` is the name in the TARGET module; `name` is the local alias.
          const external = (el.propertyName ?? el.name).text
          imports.push({ spec, name: external, kind: clauseType || el.isTypeOnly ? "type" : "value" })
        }
      }
      continue
    }

    // ── export declarations: re-exports, and local `export { … }` ────────────────────────────────────
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause
      if (node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text
        const kind = node.isTypeOnly ? "type" : "value"
        if (clause === undefined)
          reexports.push({ spec, kind, names: null }) // export * from
        else if (ts.isNamespaceExport(clause)) {
          // `export * as ns from './x.js'` — `ns` IS the whole target module, so the chain resolves to it
          // wholesale. The hand-written revisions could not see this form at all and reported modules
          // reached only that way as dead.
          reexports.push({ spec, kind, names: [{ as: clause.name.text, local: "*" }] })
        } else {
          reexports.push({
            spec,
            kind,
            names: clause.elements.map((el) => ({
              as: el.name.text,
              local: (el.propertyName ?? el.name).text,
              typeOnly: el.isTypeOnly,
            })),
          })
        }
      } else if (clause !== undefined && ts.isNamedExports(clause)) {
        for (const el of clause.elements) {
          exports.set(el.name.text, node.isTypeOnly || el.isTypeOnly ? "type" : "value")
        }
      }
      continue
    }

    // ── `export default <expression>` ────────────────────────────────────────────────────────────────
    if (ts.isExportAssignment(node)) {
      exports.set("default", "value")
      continue
    }

    // ── exported declarations ────────────────────────────────────────────────────────────────────────
    if (!hasExportModifier(node)) continue
    const named = hasDefaultModifier(node) ? "default" : undefined
    if (ts.isVariableStatement(node)) {
      // Every declarator, so `export const A = 1, B = 2` counts as TWO — the hand-written revision
      // counted one, which quietly weakened the ledger's exact-count pin.
      for (const d of node.declarationList.declarations)
        for (const n of bindingNames(d.name, [])) exports.set(n, "value")
    } else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      exports.set(named ?? node.name?.text ?? "default", "value")
    } else if (ts.isEnumDeclaration(node)) {
      exports.set(node.name.text, "value") // an enum is a runtime object too
    } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      exports.set(node.name.text, "type")
    } else if (ts.isModuleDeclaration(node)) {
      exports.set(node.name.text, "value") // `export namespace X` emits an object
    } else {
      // ── FAIL-CLOSED TRIPWIRE (AST-keyed) ─────────────────────────────────────────────────────────
      // Every historical fail-open here worked one way: something made a module look export-less, it
      // fell out at the `valueExports.length === 0` guard below, and the gate printed OK. The previous
      // tripwire keyed on RAW TEXT, so LAYOUT decided whether a drop was loud — `export import X = ns.Y`
      // on its own line threw, and the same declaration after `const k = 2;` on one line did not, while
      // both compile and both emit `export var X`. Keying on the AST removes layout from the question.
      //
      // This is deliberately an `else`, not another recognised branch. Enumerating shapes is what the
      // first four rounds of this file did; the class of bug is "an export form nobody thought of", and
      // the only fix for a class is to make the unhandled case impossible to pass silently.
      //
      // `ImportEqualsDeclaration` is the known instance and is NOT given a branch on purpose: whether
      // `export import A = X` emits a value or is elided depends on what `X` resolves to, which needs a
      // type checker this analyser does not build. Guessing would put a wrong number in the ledger.
      // Nothing in the tree uses it; if something does, that is a deliberate decision, taken loudly.
      throw new Error(
        `reachability: UNRECOGNISED EXPORT in ${file} — a \`${ts.SyntaxKind[node.kind]}\` carries an export ` +
          `modifier and no branch of this parser handles it, so its exports would be silently dropped. ` +
          `Classify it explicitly (value or type) before this module can be measured.`,
      )
    }
  }

  // A file the parser could not read is not a file with no exports. `export` alone yields one parse
  // diagnostic and zero statements — the AST tripwire above cannot see what was never parsed, so refuse
  // the source outright rather than report it as export-less.
  const diagnostics = sf.parseDiagnostics ?? []
  if (diagnostics.length > 0) {
    throw new Error(
      `reachability: UNPARSEABLE ${file} — ${diagnostics.length} parse diagnostic(s); ` +
        `refusing to report a module whose syntax the parser rejected.`,
    )
  }
  return { exports, reexports, imports }
}

/**
 * Follow `export … from` chains from `file` to the module that actually DECLARES `name`. A barrel is a
 * forwarder, never a consumer: `export * from './guard.js'` must not make the barrel a caller of guard, or
 * every module in the repo is trivially "used" and the whole check evaporates. That is the exact failure
 * the finding this gate encodes was hiding behind.
 *
 * `kind` degrades: passing through an `export type * from`, or a `type`-marked specifier, yields a TYPE
 * binding even for a value symbol. A `local: '*'` hop is a namespace re-export and resolves to the whole
 * target module.
 */
function declaringModule(mods, pkgsDir, file, name, kind, seen = new Set()) {
  const key = `${file}::${name}`
  if (seen.has(key)) return null // cyclic barrels are legal TypeScript; do not hang on them
  seen.add(key)
  const mod = mods.get(file)
  if (mod === undefined) return null
  if (mod.exports.has(name)) return { file, name, kind }
  for (const rx of mod.reexports) {
    let downstream = name
    let next = rx.kind === "type" ? "type" : kind
    if (rx.names !== null) {
      const hit = rx.names.find((n) => n.as === name)
      if (hit === undefined) continue
      if (hit.typeOnly === true) next = "type"
      if (hit.local === "*") return { file: resolveSpecifier(pkgsDir, file, rx.spec), name: "*", kind: next }
      downstream = hit.local
    }
    const target = resolveSpecifier(pkgsDir, file, rx.spec)
    if (target === null) continue
    const found = declaringModule(mods, pkgsDir, target, downstream, next, seen)
    if (found !== null) return found
  }
  return null
}

/**
 * Analyse a `packages` directory.
 *
 * Returns one row per SUBJECT module — every production module that exports at least one VALUE. A module
 * exporting only types is not a subject: it has no runtime surface, so "no value caller" is not a finding
 * about it, and counting it would bury the real ones under ~15 `types.ts` files (it did).
 *
 * Barrels (`index.ts`) and entrypoints (`bin.ts`) are not subjects either — a barrel exists to be
 * forwarded through and an entrypoint exists to be executed, so neither can have an in-tree caller by
 * construction. They remain fully live as CALLERS.
 */
export function analyse(pkgsDir) {
  const files = productionModules(pkgsDir)
  const mods = new Map(files.map((f) => [f, parseModule(f)]))

  const valueUse = new Map()
  const typeUse = new Map()
  const record = (map, key, caller) => {
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(caller)
  }

  for (const [file, mod] of mods) {
    for (const imp of mod.imports) {
      const target = resolveSpecifier(pkgsDir, file, imp.spec)
      if (target === null) continue
      if (imp.name === "*") {
        record(imp.kind === "type" ? typeUse : valueUse, `*::${target}`, file)
        continue
      }
      const decl = declaringModule(mods, pkgsDir, target, imp.name, imp.kind)
      if (decl === null || decl.file === null || decl.file === file) continue // self-reference is not a caller
      const slot = decl.name === "*" ? `*::${decl.file}` : `${decl.file}::${decl.name}`
      record(decl.kind === "type" ? typeUse : valueUse, slot, file)
    }
  }

  const rows = []
  for (const [file, mod] of mods) {
    const base = file.split(sep).pop()
    if (base === "index.ts" || base === "bin.ts") continue
    const valueExports = [...mod.exports].filter(([, k]) => k === "value").map(([n]) => n)
    if (valueExports.length === 0) continue

    const callers = new Set()
    const typeCallers = new Set()
    for (const [name, kind] of mod.exports) {
      for (const c of valueUse.get(`${file}::${name}`) ?? []) if (kind === "value") callers.add(c)
      for (const c of typeUse.get(`${file}::${name}`) ?? []) typeCallers.add(c)
    }
    // A namespace import (or namespace re-export) takes everything the module has, values included.
    for (const c of valueUse.get(`*::${file}`) ?? []) callers.add(c)
    for (const c of typeUse.get(`*::${file}`) ?? []) typeCallers.add(c)
    callers.delete(file)
    typeCallers.delete(file)

    rows.push({
      path: relative(dirname(pkgsDir), file).split(sep).join("/"),
      valueExports: valueExports.sort(),
      valueCallers: [...callers].sort(),
      typeCallers: [...typeCallers].sort(),
    })
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}

/** The rows with ZERO value callers — the reference models. `typeReachable` separates the two shapes:
 *  a module nothing at all names, versus one whose TYPES are a live contract while its code never runs. */
export function referenceModels(pkgsDir) {
  return analyse(pkgsDir)
    .filter((r) => r.valueCallers.length === 0)
    .map((r) => ({
      path: r.path,
      values: r.valueExports.length,
      typeReachable: r.typeCallers.length > 0,
      names: r.valueExports,
    }))
}
