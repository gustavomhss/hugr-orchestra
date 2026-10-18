// harness/lib/workspace-scan.mjs — the SCANNING half of the architecture fitness function.
//
// Extracted verbatim from `harness/gates/layer-guard.mjs`, which sat at exactly the 400-LOC ceiling and
// therefore could not take another line the moment `godfile-guard` learned to walk `harness/**`. Nothing
// here is new logic and nothing here decides anything: this module READS (the workspace dependency graph,
// the canonical layer diagram) and layer-guard JUDGES. That is also why it lives in `harness/lib/` and not
// in `harness/gates/` — it exits 0 having asserted nothing, which is correct for a library and is a lie in
// the gates directory (see `harness/README.md`, and the fitness function in `gate-directory.test.mjs`).
//
// ── THE ONE STRUCTURAL CHANGE, AND WHY IT IS NOT A BEHAVIOUR CHANGE ──────────────────────────────────
// `canonicalRanks` used to call layer-guard's module-level `note()` directly. A library that reaches into
// its caller's accumulator is not extractable, so it now RETURNS `{ ranks, notes }` and layer-guard splices
// those notes in at the same point in the same order. The violation list — which is printed in order and is
// what makes the verdict comparable byte-for-byte — is unchanged. Verified: the gate's output on this tree,
// on a tree carrying a deliberate `tools → adapter-io` inversion (4 violations), and on a missing root, is
// byte-identical before and after this extraction, and layer-guard's own 23 fixture tests are untouched.
//
// `harness/lib/` is admin-owned in CODEOWNERS for the same reason `harness/gates/` is: the comment stripper
// this module leans on decides how many imports layer-guard can see at all.

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./lexing.mjs"

const shortName = (dep) => (dep.startsWith("@atlas/") ? dep.slice("@atlas/".length) : null)

/**
 * The layer ranking is DERIVED, never transcribed.
 *
 * The canonical order is the `L0..L8` diagram in the repo-root `ARCHITECTURE.md`, which every core package
 * barrel independently restates (`// Layer N:`). An earlier version of this gate hard-coded its own array
 * and got it WRONG in three places (persist ranked above knowledge; memory and genesis unranked entirely),
 * which false-PASSed real inversions out of `persist` and false-FAILed the legal `knowledge → persist` edge.
 * A gate that enforces a wrong architecture is worse than no gate — so the order is now read from the one
 * place that already declared it, and drift between that diagram and this gate is impossible by construction.
 *
 * The outer RING (adapter-io + the entrypoints + the e2e suites) sits above the core and is ranked by the
 * caller-supplied `ringOrder` because ARCHITECTURE.md's diagram predates it. Any workspace package that is
 * neither in the diagram nor in that ring list is a HARD FAILURE (checked by the caller) — silently-unranked
 * packages are exactly how the previous version let memory and genesis through unchecked.
 *
 * Parses `<names…> L<n>` rows out of the canonical diagram → Map(pkg → rank). Several packages may share a
 * rank on one row (`persist   index       L2`), which is a genuine TIER: a peer edge inside a tier is an
 * inversion just as an upward edge is, so equal ranks are compared with `>=` by the caller.
 *
 * Returns `{ ranks, notes }`. `ranks === null` means the diagram could not be read and the caller must skip
 * the direction check; `notes` says why, in the caller's own violation vocabulary.
 */
export function canonicalRanks(architectureDoc, known, ringOrder) {
  const notes = []
  if (!existsSync(architectureDoc)) {
    notes.push(
      `ARCH-1 canonical layer diagram missing: ${architectureDoc} — the layer order MUST be declared, not inferred`,
    )
    return { ranks: null, notes }
  }
  const ranks = new Map()
  for (const line of readFileSync(architectureDoc, "utf8").split("\n")) {
    const m = /^(.*?)\bL(\d)\b/.exec(line)
    if (m === null) continue
    for (const word of m[1].match(/[a-z][a-z-]*/g) ?? []) {
      if (known.has(word)) ranks.set(word, Number(m[2]))
    }
  }
  if (ranks.size === 0) {
    notes.push(
      `ARCH-1 no \`L<n>\` layer rows parsed from ${architectureDoc} — the diagram format changed; this gate is blind until it is fixed`,
    )
    return { ranks: null, notes }
  }
  // The ring is stacked strictly above the deepest core layer.
  const base = Math.max(...ranks.values()) + 1
  ringOrder.forEach((pkg, i) => {
    if (known.has(pkg)) ranks.set(pkg, base + i)
  })
  return { ranks, notes }
}

/**
 * The edges that ACTUALLY create coupling are imports, not manifest entries. A manifest-only graph is
 * blind: a source import needs no manifest edit to resolve (npm workspaces symlinks every package into the
 * root `node_modules`), which was demonstrated on this tree — a real `tools → adapter-io` runtime edge
 * passed the entire gate suite green. So the graph is the UNION of declared and imported edges, and the
 * divergence between them is itself reported.
 *
 * Both static (`from '@atlas/x'`) and dynamic (`import('@atlas/x')`) forms are scanned; `wire.ts` uses the
 * dynamic form heavily in type positions, so a `from`-only scan misses real edges. A dynamic specifier that
 * is NOT a literal cannot be resolved statically and is refused outright in an inner layer — that is the
 * exact shape used to smuggle the undetectable edge.
 *
 * ── WHAT THE SPECIFIER GRAMMAR MUST ADMIT, because two shapes it rejected were live blind spots ───────
 * The point of scanning source at all is stated above: a source import needs no manifest edit to resolve.
 * So the source scan MUST see at least everything the manifest scan sees, or the check it exists to
 * perform inverts — an edge becomes easier to hide in code than in a manifest. It did not, twice, and both
 * were reproduced on a fixture where the plain form correctly failed with 4 violations:
 *
 *   DIGITS. The captured name was `[a-z][a-z-]*`, which rejects `0-9`, while `shortName` (which reads the
 *   MANIFEST) accepts any `@atlas/*`. `e2e` and `e2e-blackbox` are real ranked packages in the ring list.
 *   `@atlas/e2e` in a manifest was graphed and failed the gate; the SAME edge written as a source import
 *   scored exit 0, 0 violations. That asymmetry is precisely the smuggling shape, running backwards.
 *
 *   SUBPATHS. The specifier was matched WHOLE against the closing quote, so any deep import —
 *   `@atlas/adapter-io/dist/src/index.js` — matched nothing at all and the edge was invisible. The
 *   package identity is everything up to the first `/` after the scope; whatever follows is a file within
 *   the SAME package and cannot change which package is being coupled to.
 */
export function sourceImports(pkgsDir, pkgDir) {
  const out = { edges: new Set(), opaque: [] }
  const srcRoot = join(pkgsDir, pkgDir, "src")
  if (!existsSync(srcRoot)) return out
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(p)
        continue
      }
      if (!/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) continue
      // Strip comments FIRST. This codebase is comment-dense and routinely NAMES other packages in prose
      // ("`@atlas/contracts`-owned", "would invert the DAG"). Scanning raw text turns every such mention
      // into a phantom edge — an earlier revision of this scanner reported 68 violations, all false.
      //
      // The stripper is the SHARED, parser-backed one. The two-regex form that used to sit on this line
      // deleted real imports — see `lexing.mjs`; pinned by fixture in layer-guard.test.mjs.
      const src = stripComments(readFileSync(p, "utf8"), entry.name)
      // Only real specifier positions count. `[a-z0-9-]` and the `(?:\/…)?` tail: see DIGITS/SUBPATHS above.
      const SPECIFIER =
        /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]@atlas\/([a-z][a-z0-9-]*)(?:\/[^'"]*)?['"]/g
      for (const m of src.matchAll(SPECIFIER)) out.edges.add(m[1])
      // A dynamic import whose specifier is not a string literal is statically unresolvable. HEURISTIC, and
      // stated as one: a captured `:` means this is a TypeScript signature for a METHOD NAMED `import`
      // (`import(json: string): Cas`, which both portable.ts files declare), not a dynamic import — a real
      // specifier expression cannot carry a top-level colon. Without this exclusion the scan reports those
      // two interface members as unresolvable imports.
      for (const m of src.matchAll(/\bimport\s*\(\s*(?!['"`])([^)]{0,60})\)/g)) {
        if (m[1].includes(":")) continue
        out.opaque.push(`${pkgDir}/src/${p.slice(srcRoot.length + 1)}: import(${m[1].trim().slice(0, 40)})`)
      }
    }
  }
  walk(srcRoot)
  return out
}

/** The workspace graph as `{ graph: Map(pkg → deps[]), undeclared[], opaque[] }` — manifest ∪ source. */
export function workspaceGraph(pkgsDir) {
  const graph = new Map()
  const undeclared = []
  const opaque = []
  for (const dir of readdirSync(pkgsDir)) {
    const manifest = join(pkgsDir, dir, "package.json")
    if (!existsSync(manifest)) continue
    const pkg = JSON.parse(readFileSync(manifest, "utf8"))
    const declared = new Set(
      Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
        .map(shortName)
        .filter((d) => d !== null),
    )
    const imported = sourceImports(pkgsDir, dir)
    for (const dep of imported.edges) {
      if (dep !== dir && !declared.has(dep))
        undeclared.push(`@atlas/${dir} imports @atlas/${dep} but does not declare it`)
    }
    opaque.push(...imported.opaque)
    graph.set(
      dir,
      [...new Set([...declared, ...imported.edges])].filter((d) => d !== dir),
    )
  }
  return { graph, undeclared, opaque }
}
