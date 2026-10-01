// @atlas/index — src/build.ts  (INDEX-3: the mechanical, $0-LLM axis build)
//
// `build(tree, scipOutput)` derives the three axis-views + depends-on edge ledger purely from the file
// tree + recorded SCIP output — deterministic, 0 model calls, idempotent. An edge it cannot statically
// resolve (incl. every cross-language/FFI boundary) is declared `unresolved` (to: null), never guessed;
// identity is minted ONLY through the sealed kernel seam (no self-rolled hash).

import { id, asSubtreeHash } from "@atlas/kernel"
import type { Hash, SubtreeHash } from "@atlas/contracts"
import { foldNodeHash } from "./rollup.js"
import type { Axes, Axis, DepEdge, FileTree, IndexNode, ScipOutput } from "./types.js"

/** The mechanical, `$0`-LLM axis build (INDEX-3): derive every axis-view purely from the file tree +
 *  recorded SCIP output; deterministic, idempotent, unresolved edges declared (never guessed). */
export interface BuildApi {
  /** Derive all axis-views from the file tree + recorded SCIP output; deterministic, `$0`-LLM,
   *  idempotent (rebuild twice ⇒ identical trees). The SCIP binary is a black-box input (fixtures),
   *  NOT modeled here (method-tags-idx:38-39). (method-tags-idx:38; atlas-index:157-159) */
  build(tree: FileTree, scipOutput: ScipOutput): Axes
}

// Level vocabularies (atlas-index:54, 70). The build maps tree DEPTH to the level NAME along each rail;
// a depth past the vocabulary pins to the deepest name (no invented level).
const SPATIAL_LEVELS = ["repo", "crate", "module", "file", "item", "block"] as const
const TERRITORY_LEVELS = ["project", "territory", "region"] as const

/** The sub-file refinement separator (`file::item::block`, adapter-io/ast.ts `unitPath`; the descent that
 *  reads it is resolve.ts `descentSteps`). A node key nests on `::` as well as `/`, so a `::` in a key is
 *  a claim of real structural containment. */
const UNIT_SEP = "::"

/**
 * THE key-component escape — the reason a node key can be trusted as a structural ADDRESS.
 *
 * Node keys are joined by two whole separators (`/` between path components, `::` between refinement
 * units) and are SPLIT back apart on those separators by every consumer (resolve.ts `descentSteps`,
 * knowledge/write/router.ts `primaryAnchorId`, tools `deriveSubsumes`). That round trip is only injective
 * if no component can contain — or sit adjacent to — the delimiter. `:` is a perfectly legal POSIX
 * filename character and git tracks it, so without this escape a file named `x::alpha.ts` FABRICATES a
 * segment: `src/x::alpha.ts` and `src/x::beta.ts` "share" the ancestor `src/x`, a unit that does not
 * exist, and `primaryAnchorId` mints it — non-empty, so the degenerate-anchor refusal passes it through —
 * and `nodeKey` then collides with any fact honestly anchored at `src/x`. That is identity capture with
 * no hash weakness whatsoever, and it is cheap: two committed filenames.
 *
 * A single trailing `:` is just as fatal even without a doubled one, because the join reassociates:
 * `"a:" ‖ "b"` and `"a" ‖ ":b"` both render `a:::b`. So the escape covers EVERY `:`, not just `::`.
 * `%` must be escaped too, or the encoding stops being injective (`a%3Ab` and `a:b` would collide).
 * For a normal path (no `:`, no `%`) this is the IDENTITY function — no existing key moves.
 */
export function escapeKeyComponent(component: string): string {
  return component.replaceAll("%", "%25").replaceAll(":", "%3A")
}

/** The exact inverse of `escapeKeyComponent` (`unescape(escape(s)) === s` for every string) — so a key is
 *  a lossless encoding of the path/name it addresses, not a lossy sanitization. */
export function unescapeKeyComponent(component: string): string {
  return component.replaceAll(/%3A/g, ":").replaceAll(/%25/g, "%")
}

/** The parent context one level up: its RAW tree path (what the adapter minted its children against), its
 *  already-MINTED key, and whether it carries its own bytes (only a content-bearing node can have sub-file
 *  refinement children — a directory cannot). */
interface Parent {
  readonly path: string
  readonly key: string
  readonly content: string | undefined
}

/**
 * A refinement local (`function_declaration:0:computeArr`, minted by adapter-io/ast.ts `unitPath`) is
 * passed through UNCHANGED when it is well-formed, and escaped WHOLESALE when it is not. Well-formed =
 * carries no `::` and neither starts nor ends with `:`. The mint does not trust the adapter to have
 * escaped its own name component: an adapter defect must degrade to an ugly-but-honest key, never to a
 * forged segment boundary.
 */
function safeUnitLocal(local: string): string {
  const wellFormed = local.length > 0 && !local.includes(UNIT_SEP) && !local.startsWith(":") && !local.endsWith(":")
  return wellFormed ? local : escapeKeyComponent(local)
}

/**
 * THE node-key mint. A key is built STRUCTURALLY from its parent's key plus one escaped local segment —
 * never copied verbatim out of `FileTree.path` — so a delimiter inside a filename cannot fabricate
 * ancestry. Two shapes, and only two:
 *   - REFINEMENT (`parent.key ‖ '::' ‖ local`) — reserved for a sub-file unit, which is recognized by
 *     BOTH tests: the child extends the parent's raw path by `::`, AND the parent carries content. The
 *     content test is what stops a DIRECTORY named `a` from claiming the file `a::b.ts` as its unit.
 *   - PATH (`escape(c1) ‖ '/' ‖ escape(c2) ‖ …`) — everything else, each `/`-component escaped.
 * For any tree whose paths contain no `:` and no `%`, this returns exactly `node.path` — the previous
 * behaviour, byte for byte, so no existing subtreeHash moves.
 */
function mintKey(node: FileTree, parent: Parent | undefined): string {
  if (parent !== undefined && parent.content !== undefined && node.path.startsWith(parent.path + UNIT_SEP)) {
    return `${parent.key}${UNIT_SEP}${safeUnitLocal(node.path.slice(parent.path.length + UNIT_SEP.length))}`
  }
  return node.path.split("/").map(escapeKeyComponent).join("/")
}

/** subtreeHash via the sealed seam. Delegates to `foldNodeHash` — THE single rollup implementation
 *  (src/rollup.ts) — so a rebuild and an incremental re-hash cannot diverge. Every node commits to its OWN
 *  content AND to the NAMES of its children, never to a bare multiset of child hashes (atlas-index:40).
 *  The fold is keyed by the MINTED key (not the raw path) so a child's relative name is computed in the
 *  same namespace the children were minted in. */
function rollupHash(key: string, node: FileTree, children: readonly IndexNode[]): SubtreeHash {
  return foldNodeHash({ key, content: node.content, children })
}

/** Build one rooted axis hierarchy from the file tree along a level vocabulary. Deterministic + total. */
function hierarchy(node: FileTree, axis: Axis, levels: readonly string[], depth: number, parent?: Parent): IndexNode {
  const level = levels[Math.min(depth, levels.length - 1)] ?? levels[levels.length - 1] ?? ""
  const key = mintKey(node, parent)
  const self: Parent = { path: node.path, key, content: node.content }
  const children = node.children.map((c) => hierarchy(c, axis, levels, depth + 1, self))
  return { axis, level, key, subtreeHash: rollupHash(key, node, children), children, objects: [] }
}

/**
 * The ONE path→node-identity minting for a file (atlas-index:105). EXPORTED because it is the index's
 * source of truth for a file node's identity and consumers outside this package must REUSE it rather than
 * restate the formula: the dependency axis keys a file node by `nodeHashOfPath(p)` and carries
 * `subtreeHash = asSubtreeHash(nodeHashOfPath(p))` (see `dependencyAxis` below), which is exactly the leg
 * `genesis`'s `resolveSiteKey` looks a mined `StructRef` up by. A parallel copy of `id({file})` in an
 * adapter is a second source of truth for identity — the class of drift KERNEL-1 exists to forbid.
 */
export const nodeHashOfPath = (relativePath: string): Hash => id({ file: relativePath })

/** A stable per-document node hash (the dependency axis keys structural units by hash, atlas-index:105). */
const docHash = nodeHashOfPath

/** A canonical, order-independent key for one edge — used for dedup + deterministic sort. */
const edgeKey = (e: DepEdge): string => `${String(e.from)}\0${e.to === null ? "" : String(e.to)}\0${e.kind}`

/**
 * A SCIP symbol is DOCUMENT-SCOPED (unrelated to any same-named symbol in another document) iff it is a
 * `local` symbol per the SCIP grammar itself (`@c4312/scip` `scip_pb.d.ts`, mirroring the upstream
 * `scip.proto` doc-comment verbatim):
 *
 *   <symbol> ::= <scheme> ' ' <package> ' ' (<descriptor>)+ | 'local ' <local-id>
 *   "Local symbols MUST only be used for entities which are local to a Document."
 *
 * i.e. the ENTIRE symbol string for a local is the literal `'local '` (with the trailing space — part of
 * the grammar, not a separator we chose) followed by an arbitrary `<local-id>`; there is no scheme/package
 * prefix to disambiguate one document's `local 2` from another's. Confirmed against this repo's own
 * `.atlas/index.scip`: every occurrence matching `/^local/i` renders as exactly `local N` (never `Local N`,
 * `local:N`, or any other spelling) — so `startsWith('local ')` is the exact, spec-anchored predicate.
 */
export const isLocalSymbol = (symbol: string): boolean => symbol.startsWith("local ")

/**
 * CANON-AND-VERIFY (#189 cross-package): a reference into another in-repo package is recorded by
 * `scip-typescript` against that package's PUBLISHED TYPES descriptor while the DEFINITION lives at the
 * SOURCE descriptor. They are DISTINCT symbol strings, so a cross-package caller is invisible to the
 * src-form definition (its edge under-approximates to `unresolved`, and `reverseCallers`/the negation
 * door never see it). Two dist LAYOUTS occur in this monorepo (both handled), differing only by whether
 * `tsc` preserved the `src/` rootDir under `outDir`:
 *   - NESTED (`tsc` default, `dist/src/…`): ` dist/src/`X.d.ts`  ↔  ` src/`X.ts`     (11 of 12 packages)
 *   - FLAT   (declaration at dist root):    ` dist/`X.d.ts`      ↔  ` src/`X.ts`     (`@atlas/contracts`)
 * A THIRD emission — `tsc` also compiles `test/` (tsconfig `include: ["src","test"]`, no `rootDir`), so a
 * `dist/test/X.d.ts` descriptor exists. `(?:src/)?` strips only `src/`, so it canonicalises to `src/test/X.ts`
 * whose real source is `test/X.ts` — a WRONG candidate, but no package has a `src/test/` def, so it always
 * fails `defs.has` and stays a hole (fail-closed incompleteness, not unsoundness; test files are not
 * cross-package call targets, so recovering them buys nothing — left un-handled on purpose).
 * This rewrites the dist descriptor to its source form: strip a leading `dist/` (and its optional `src/`
 * segment), keep any intermediate directories, and swap the `.d.ts` file extension for `.ts`. Scheme,
 * package manager, package name, and version are BYTE-PRESERVED, so the rewrite can only ever name a
 * symbol in the SAME package.
 *
 * This is a CANDIDATE, never an assertion: it does a pure string rewrite and the CALLER must confirm the
 * result actually resolves (`defs.has(canon)`) before trusting it. A symbol with no `dist/…d.ts`
 * descriptor is returned UNCHANGED (so `defs.get(canon)` just re-misses and it stays a hole — fail-closed),
 * and any dist symbol whose source form is NOT defined in-index simply fails the `defs` check and stays a
 * hole too. The soundness comes from the VERIFY at the call site, not from this regex — a too-narrow match
 * only ever LOSES a recoverable edge (stays honest hole), never fabricates one. Idempotent; total; pure.
 *
 * MEASURED on this repo's `.atlas/index.scip` (2026-08-12, independently over EVERY unresolved reference
 * occurrence — NOT a regex-filtered subset, the self-confirmation trap the first cut fell into): 795/855
 * distinct `@atlas` dist-form references canonicalise onto a real in-index definition, recovering 13215
 * previously-`unresolved` reference occurrences across all 12 packages. The ~60 that stay holes are inner
 * type-literal members (`…typeLiteral22:field`) whose declaration-emit numbering differs from source —
 * correctly left as holes by the verify. External npm targets (`typescript`, `@types/node`) carry no
 * `@atlas/…dist/…d.ts` descriptor and stay holes.
 *
 * RESIDUAL ASSUMPTION (lucy cold-review 2026-08-12): soundness rests on the dist `.d.ts` descriptor path
 * mirroring the `src` `.ts` path. A bundler that FLATTENS several source files into one `.d.ts` could
 * canonicalise onto a real-but-WRONG `src` symbol that still passes `defs.has` — the one shape the verify
 * cannot catch. Holds for `tsc --declaration` per-file output (this repo); revisit for bundled declarations.
 */
export const canonicalizeSymbol = (symbol: string): string =>
  symbol.replace(/ dist\/(?:src\/)?((?:[^`]*\/)?`[^`]+)\.d\.ts`/, " src/$1.ts`")

/**
 * Derive the depends-on edge ledger from the SCIP occurrences alone. A `reference` whose symbol has an
 * in-index `definition` ⇒ a `resolved` edge to the defining document; a `reference` with NO in-index
 * definition (every cross-language / FFI target — unseeable by a single-language indexer) ⇒ an `unresolved`
 * edge with `to: null`. Edges are deduped + sorted so a rebuild is byte-identical. (SCN-INDEX-3e-1)
 *
 * A `local` symbol (`isLocalSymbol`) contributes NO edge, on either side (defs loop AND reference loop).
 * The dependency axis's endpoints are `docHash(doc.relativePath)` — its edges are BETWEEN DOCUMENTS. A
 * document-scoped symbol carries zero information about an inter-document dependency by construction: the
 * only edge it could faithfully produce is a self-edge `from === to`, which adds nothing to a dependency
 * graph. Left unexcluded, a GLOBAL `Map<symbol, Hash>` keyed on the raw SCIP symbol string joins unrelated
 * `local N` symbols across every document that happens to reuse the same small integer id, first-definition
 * -wins — fabricating a cross-document edge the SCIP data never asserted.
 */
function deriveEdges(scip: ScipOutput): DepEdge[] {
  const defs = new Map<string, Hash>()
  for (const doc of scip.documents) {
    const h = docHash(doc.relativePath)
    for (const occ of doc.occurrences) {
      if (occ.role === "definition" && !isLocalSymbol(occ.symbol) && !defs.has(occ.symbol)) defs.set(occ.symbol, h)
    }
  }
  const seen = new Map<string, DepEdge>()
  for (const doc of scip.documents) {
    const from = docHash(doc.relativePath)
    for (const occ of doc.occurrences) {
      if (occ.role !== "reference" || isLocalSymbol(occ.symbol)) continue
      // CANON-AND-VERIFY (#189): a same-package hit wins as-is; else try the src-form of a published-types
      // (`dist/…d.ts`) descriptor and take it ONLY if it resolves to a real in-index definition.
      const target = defs.get(occ.symbol) ?? defs.get(canonicalizeSymbol(occ.symbol))
      const edge: DepEdge =
        target !== undefined ? { from, to: target, kind: "resolved" } : { from, to: null, kind: "unresolved" }
      const k = edgeKey(edge)
      if (!seen.has(k)) seen.set(k, edge)
    }
  }
  return [...seen.values()].sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0))
}

/**
 * The dependency axis as a rooted view over the derived edges — one leaf per distinct participating node,
 * sorted; the root's subtreeHash folds the full edge ledger so a graph change re-keys the root.
 *
 * [NOT A FRESHNESS ORACLE] A leaf's `subtreeHash` here is `asSubtreeHash(h)` where `h` IS the leaf's key —
 * i.e. the node's IDENTITY (`id({file: path})`), a constant of the PATH that commits to no content. It is
 * shaped that way on purpose: it is the value `genesis`'s `resolveSiteKey` joins a mined `StructRef` back
 * to the skeleton by (see `nodeHashOfPath` above, and adapter-io/src/git-history.ts `fileRef`, which
 * REUSES that minting rather than restating it). The consequence must be stated where it can be read: a
 * dependency-axis leaf is INVARIANT under any change to the file's bytes, so it can never witness drift.
 * The freshness oracle therefore MUST NOT resolve an anchor here — grounding/src/drift.ts resolves over
 * the content-committing axes only, and refuses any node whose hash is its own key. If an anchor could be
 * resolved on this axis, an author could pick one and mint a fact that CAN NEVER DRIFT.
 *
 * This is not a local implementation quirk that happens to agree with the docs — it is the frozen
 * declaration in `docs/spec/atlas.md` §3.5 ("The dependency axis ADDRESSES; it does not COMMIT … the
 * axis is not a freshness oracle, and an anchor on it is not a grounding") and `docs/reference/
 * atlas-index.md` INDEX-17, both citing this exact function as the built mechanism (#191, closing the
 * shared root cause of #98/#189 — an unqualified §3.5 rule that had no stated exception).
 */
function dependencyAxis(edges: readonly DepEdge[]): IndexNode {
  const nodes = new Set<string>()
  for (const e of edges) {
    nodes.add(String(e.from))
    if (e.to !== null) nodes.add(String(e.to))
  }
  const children: IndexNode[] = [...nodes].sort().map((h) => ({
    axis: "dependency",
    level: "unit",
    key: h,
    subtreeHash: asSubtreeHash(h),
    children: [],
    objects: [],
  }))
  const subtreeHash = asSubtreeHash(id({ edges: edges.map(edgeKey), nodes: children.map((c) => c.key).sort() }))
  return { axis: "dependency", level: "root", key: "dependency", subtreeHash, children, objects: [] }
}

/** INDEX-3 build: the three axis-views + the honest edge ledger, $0-LLM and idempotent. */
export function build(tree: FileTree, scipOutput: ScipOutput): Axes {
  const edges = deriveEdges(scipOutput)
  return {
    spatial: hierarchy(tree, "spatial", SPATIAL_LEVELS, 0),
    territory: hierarchy(tree, "territory", TERRITORY_LEVELS, 0),
    dependency: dependencyAxis(edges),
    edges,
  }
}

/** The frozen `BuildApi` surface, wired to the pure `build` above. */
export const buildApi: BuildApi = { build }
