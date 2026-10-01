#!/usr/bin/env node
// wiring-guard — BUILT ≠ REACHABLE. The README's unreached-package ledger vs the actual import graph.
//
// ── THE DEFECT THIS EXISTS TO STOP RETURNING ─────────────────────────────────────────────────────────
// `packages/memory` is eleven source files, ~2000 lines, eleven test files, and a reference contract. It
// is also called by NOTHING: the only import of `@atlas/memory` anywhere outside itself is an
// `import type` in `packages/genesis/src/seed.ts`, which is erased at compile time. No command, no MCP
// tool, no composition root ever reaches it. Meanwhile README.md listed "Knowledge ≠ Memory" under the
// heading **What it guarantees** — a guarantee the shipped product cannot exercise, because nothing in it
// runs that code.
//
// That is not a stale sentence. It is a whole category the tree had no way to express: a package can be
// built, tested, documented and DEAD, and every gate in this repo would stay green — the layer guard
// checks direction and cycles, the doc guards check correspondence, the test suites check the package
// against itself. None of them asks whether anyone CALLS it.
//
// ── WHAT IT CHECKS ───────────────────────────────────────────────────────────────────────────────────
// One property, both ways: the set of packages with NO runtime importer must equal the set the README
// names in its delimited `unreached` region.
//
//   (1) UNREACHED AND UNDECLARED — nothing imports it at runtime and the README does not say so. This is
//                                  the memory case: dead weight reading as shipped surface.
//   (2) DECLARED BUT REACHED     — the README says nothing calls it and something does. The ledger is
//                                  then understating the product, which is the safe direction but still
//                                  false, and a ledger nobody trusts gets ignored in both directions.
//
// The region carries a REASON per package because the set is not homogeneous: an entry point (`cli`,
// `mcp-server`) and a suite are unimported BY DESIGN, `contracts` is pure types BY DESIGN, and `memory`
// is the finding. The gate checks the SET and never the reasons — it holds no policy about which packages
// are allowed to be unreached, so it cannot go stale as the tree's shape changes. Judging the reasons is a
// human job and is not claimed here.
//
// ── RUNTIME vs TYPE-ONLY, AND WHICH WAY THE UNCERTAINTY LEANS ────────────────────────────────────────
// An `import type` / `export type` declaration is erased and is NOT a runtime reference. Every other
// import counts as runtime, INCLUDING one whose bindings are all inline `{ type A }` — that is
// conservative on purpose: mis-scoring a type-only import as runtime can only make a dead package look
// alive, i.e. it can only make this gate MISS a finding, never manufacture one. A gate that invents dead
// packages would be worked around; a gate that occasionally misses one is merely incomplete, and says so.
//
// It is a PARSE, not a regex: `@atlas/memory` appears in prose comments across this tree, and a pattern
// that counts a comment as a call would have scored the memory package alive.
//
// ── FAIL-CLOSED ──────────────────────────────────────────────────────────────────────────────────────
// The worst outcome is not a false alarm — it is a gate that finds zero packages, compares two empty sets
// and prints OK. So every way of not getting a list is a named failure: no `packages/` directory, no
// package with a `src/`, a missing README, a missing marker, and an EMPTY region. The region cannot be
// legitimately empty: `cli` alone is never imported by anything.
//
// Run: `node harness/gates/wiring-guard.mjs` (no build needed — it reads source only).

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const ROOT = process.env.WIRING_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")

const PACKAGES_REL = "packages"
const README_REL = "README.md"
const PACKAGES = join(ROOT, PACKAGES_REL)
const README = join(ROOT, README_REL)

/** The delimiters of the checked region. Explicit, so the gate's scope cannot drift with the prose. */
const BEGIN = "<!-- unreached:begin -->"
const END = "<!-- unreached:end -->"

/** Every `.ts` under `dir`, recursively. */
function sources(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (e.name.endsWith(".ts")) out.push(p)
  }
  return out
}

/**
 * The runtime import graph over `@atlas/*`, read from source.
 *
 * Returns `{ names, importers }` — every package that has a `src/`, and for each the set of OTHER packages
 * that reference it at RUNTIME — or `{ broken }` naming how the read failed.
 */
function importGraph() {
  if (!existsSync(PACKAGES)) {
    return { broken: `${PACKAGES_REL}/ does not exist, so there is no import graph to read.` }
  }
  const names = readdirSync(PACKAGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, "src")))
    .map((e) => e.name)
    .sort()
  if (names.length === 0) {
    return {
      broken: `no package under ${PACKAGES_REL}/ has a src/ directory. Either the workspace moved or this gate's reading of it broke — and comparing two empty sets would print OK for a tree where nothing is wired to anything.`,
    }
  }

  const importers = new Map(names.map((n) => [n, new Set()]))
  for (const pkg of names) {
    for (const file of sources(join(PACKAGES, pkg, "src"))) {
      const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
      for (const st of sf.statements) {
        const isImport = ts.isImportDeclaration(st)
        if (!isImport && !ts.isExportDeclaration(st)) continue
        const spec = st.moduleSpecifier
        if (spec === undefined || !ts.isStringLiteral(spec)) continue
        const m = /^@atlas\/([a-z][a-z0-9-]*)$/.exec(spec.text)
        if (m === null) continue
        const target = m[1]
        if (target === pkg || !importers.has(target)) continue
        // Erased declarations are not references. Everything else counts — see the header on which way
        // this conservatism leans.
        const typeOnly = isImport ? (st.importClause?.isTypeOnly ?? false) : (st.isTypeOnly ?? false)
        if (!typeOnly) importers.get(target).add(pkg)
      }
    }
  }
  return { names, importers }
}

/** The packages the README's delimited region declares unreached. Fail-closed exactly like the graph read. */
function declaredUnreached(text) {
  const b = text.indexOf(BEGIN)
  const e = text.indexOf(END)
  if (b === -1 || e === -1) {
    return {
      broken: `${README_REL} is missing the ${b === -1 ? BEGIN : END} marker. The gate cannot tell which lines are the ledger, and refuses to guess — a check whose scope is inferred from prose stops checking the moment the prose moves.`,
    }
  }
  if (e < b) {
    return { broken: `${README_REL} has ${END} BEFORE ${BEGIN}. The region is inside-out, so it encloses nothing.` }
  }
  const found = []
  for (const line of text.slice(b + BEGIN.length, e).split("\n")) {
    const m = /^\s*\|\s*`([a-z][a-z0-9-]*)`/.exec(line)
    if (m !== null) found.push(m[1])
  }
  if (found.length === 0) {
    return {
      broken: `the ${README_REL} unreached region extracted ZERO rows. It cannot legitimately be empty — the CLI entry point alone is imported by nothing — so either the ledger was emptied or its row shape changed, and an empty ledger would agree with a fully wired tree.`,
    }
  }
  const seen = new Set()
  for (const n of found) {
    if (seen.has(n)) {
      return {
        broken: `the ${README_REL} unreached ledger lists \`${n}\` TWICE. A duplicated row makes the ledger's own count meaningless.`,
      }
    }
    seen.add(n)
  }
  return { names: found }
}

const graph = importGraph()
if (graph.broken !== undefined) {
  console.error(`wiring-guard: FAIL\n\n  ✗ EXTRACTION BROKEN — ${graph.broken}\n`)
  console.error("The gate refuses to report on a graph it could not read. Fix the extraction, not the docs.")
  process.exit(1)
}

if (!existsSync(README)) {
  console.error(
    `wiring-guard: FAIL\n\n  ✗ EXTRACTION BROKEN — ${README_REL} does not exist, so the unreached ledger cannot be checked.\n`,
  )
  process.exit(1)
}

const readme = declaredUnreached(readFileSync(README, "utf8"))
if (readme.broken !== undefined) {
  console.error(`wiring-guard: FAIL\n\n  ✗ EXTRACTION BROKEN — ${readme.broken}\n`)
  console.error("The gate refuses to report on a ledger it could not read. Fix the extraction, not the docs.")
  process.exit(1)
}

const unreached = graph.names.filter((n) => graph.importers.get(n).size === 0)
const declared = new Set(readme.names)
const actual = new Set(unreached)
const fail = []

for (const p of unreached) {
  if (!declared.has(p)) {
    fail.push(
      `UNREACHED AND UNDECLARED — \`${p}\`\n` +
        `      No package imports it at RUNTIME, and the ${README_REL} unreached ledger does not name it.\n` +
        `      It is built, and as far as anything that RUNS is concerned it is not there. Either wire it,\n` +
        `      or add the row and say why it is unreached — silence is what let a dead package read as\n` +
        `      shipped surface for an entire campaign.`,
    )
  }
}
for (const p of declared) {
  if (!actual.has(p)) {
    const who = graph.importers.has(p) ? [...graph.importers.get(p)].sort().join(", ") : "(no such package)"
    fail.push(
      `DECLARED BUT REACHED — \`${p}\`\n` +
        `      The ${README_REL} unreached ledger says nothing calls it; it is imported at runtime by: ${who}.\n` +
        `      The ledger understates the product. That is the safe direction and still false — delete the row.`,
    )
  }
}

if (fail.length > 0) {
  console.error("wiring-guard: FAIL\n")
  for (const f of fail) console.error(`  ✗ ${f}\n`)
  console.error(
    `${fail.length} violation(s) over ${graph.names.length} package(s). The import graph is the oracle.\n` +
      "Move the ledger to it — do not weaken this gate to the ledger.",
  )
  process.exit(1)
}

console.log(
  `wiring-guard: OK — ${graph.names.length} package(s); ${unreached.length} with no runtime importer ` +
    `(${unreached.join(", ")}), each declared in the ${README_REL} ledger. ` +
    "Membership only — WHY a package is unreached is a human job and is not claimed here.",
)
