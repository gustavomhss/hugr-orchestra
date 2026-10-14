// @atlas/adapter-io — src/index-adapter.ts  (ADAPT-INDEX-1: the index-backing adapter)
//
// Satisfies the two frozen `@atlas/tools` ports — `MoveInIndex` (→ tools/init.ts) and `QueryIndex`
// (→ tools/query.ts) — by driving `@atlas/index` (`build`/`resolve`/depgraph reverse-closure) over the
// frozen FS + SCIP outputs. PURE DELEGATION: it introduces NO ranking, NO resolution, NO caching of its own.
// The ONLY non-delegated values are the `owner:''`/`globs` projection on a raw territory (init's move-in
// shape). Every resolve / reverse-closure runs PER call — never memoized — so the resolution spy (SCN-5b)
// proves every resolution originated inside `@atlas/index`, 0 computed here (SCN-5a/5b teeth).

import type { Hash, NodeKey } from "@atlas/contracts"
import type { MoveInIndex, QueryIndex } from "@atlas/tools"
import { pathSegments } from "@atlas/index"
import type {
  Axes,
  AxisForest,
  DepEdge,
  DepgraphApi,
  FileTree,
  IndexNode,
  ResolveApi,
  ScipOutput,
  SymbolReverseApi,
} from "@atlas/index"

/**
 * The injected drive surface (PRE-DECIDED — exact, for SCN-5b spyability). Every `@atlas/index` entry point
 * the adapter drives is injected so a test can wrap `createResolve` with a call-spy. `nodeHashOfPath` is the
 * sealed-kernel path→node hash `(p) => id({ file: p })` — the SAME keying `build` uses (build.ts:42).
 */
export interface IndexAdapterDeps {
  readonly fileTree: FileTree
  readonly scipOutput: ScipOutput
  readonly build: (t: FileTree, s: ScipOutput) => Axes
  readonly createResolve: (forest: AxisForest) => ResolveApi // ← SCN-5b spy target
  readonly createDepgraph: (edges: readonly DepEdge[]) => DepgraphApi
  /** #99b N0 — the SYMBOL-level reverse-caller view over the SAME SCIP occurrences `build`/`deriveEdges`
   *  read (one granularity below `createDepgraph`). Injected here alongside `createDepgraph` so the negation
   *  door (N2) consumes it off the SAME assembled index surface, never re-deriving a second edge model. */
  readonly createSymbolReverse: (scip: ScipOutput) => SymbolReverseApi
  readonly nodeHashOfPath: (path: string) => Hash // = (p) => id({ file: p })
}

/** The index surface `createIndexAdapter` assembles, WIDENED (additively) with the #99b N0 symbol-reverse
 *  view so the negation door (N2) reaches `reverseCallers`/`holeSources` off the SAME live adapter the
 *  depgraph rides. The two frozen tools ports are untouched — this only ADDS a sibling accessor. */
export interface IndexAdapterSurface {
  /** The #99b N0 symbol-level reverse-caller view, built ONCE at construction from the same `scipOutput`
   *  the axes are (a live seam; N2 will call `reverseCallers`/`holeSources` on it). */
  symbolReverse(): SymbolReverseApi
}

/** The one explicit cast helper: `Hash` and `NodeKey` are same-string DISTINCT brands (contracts/hash.ts).
 *  The reverse closure is keyed by `Hash`; the blast-radius port is keyed by `NodeKey` — one cast, applied
 *  identically on both the adapter side and the in-test oracle side (SCN-5a-1). */
const asNodeKeys = (hs: readonly Hash[]): readonly NodeKey[] => hs as unknown as readonly NodeKey[]

/**
 * Does `path` name the repository ROOT — i.e. the whole tree?
 *
 * `@atlas/index`'s `resolve` descends from the root by one step per path segment, so the root itself is the
 * one node no key can name (`'.'` would have to match a CHILD called `.`). Every conventional spelling of
 * "here" — `.`, `./`, `''`, `/` — normalises to a segment list that is empty or made only of `.`, and those
 * are exactly the paths that mean the root. Anything else is a real descent and goes through `resolve`.
 */
const isRepoRoot = (path: string): boolean => typeof path === "string" && pathSegments(path).every((s) => s === ".")

/** The sub-file refinement separator (`file::item::block`, ./ast.ts `unitPath`; minted by @atlas/index
 *  `build.ts`, which escapes every literal `:` in a real filename to `%3A` — so a `::` in a child key
 *  beyond its parent's is unambiguously a REFINEMENT and never part of a path component). */
const UNIT_SEP = "::"

/** A node's PATH children — its directory/file children, with sub-file AST refinements excluded.
 *  A territory is a file or a directory; `lexical_declaration:0:greet` is neither, and surfacing one as a
 *  move-in territory would put a governance zone on half a line of code. */
const pathChildren = (node: IndexNode): readonly IndexNode[] =>
  node.children.filter((c) => !c.key.startsWith(`${node.key}${UNIT_SEP}`))

/** The move-in projection of ONE structural unit — `{name, owner, globs}`. The `owner:''` + single glob are
 *  the ONLY non-delegated values in this module (init.ts assigns the tier; the walk never carries one). */
const asTerritory = (node: IndexNode): { name: string; owner: string; globs: string[] } => ({
  name: node.key,
  owner: "",
  globs: [`${node.key}/**`],
})

/**
 * Build the index-backing adapter over the injected drive surface. `Axes` is built ONCE at construction
 * (the structural build is $0-LLM + idempotent); resolve / reverse-closure run PER call and are NEVER
 * memoized (the 5a/5b teeth). Returns the union of the two frozen ports.
 */
export function createIndexAdapter(deps: IndexAdapterDeps): MoveInIndex & QueryIndex & IndexAdapterSurface {
  const axes = deps.build(deps.fileTree, deps.scipOutput)
  // #99b N0 — the symbol-reverse view, built ONCE at construction from the SAME `scipOutput` the axes are (a
  // real production call in every wired handler, not a dormant reference model; #99a's lesson). Deterministic
  // + pure like `build`, so a single construction-time build is byte-identical to a per-call rebuild.
  const symbolReverseView = deps.createSymbolReverse(deps.scipOutput)

  /** The three-axis view the resolver walks (the SAME forest `cover` resolves over). */
  const forest = (): AxisForest => ({
    spatial: axes.spatial,
    territory: axes.territory,
    dependency: axes.dependency,
  })

  return {
    // MoveInIndex — the territories structurally derived from the territory axis AT `path`. The move-in
    // shape is `{name, owner, globs}`; the tier is assigned LATER by init.ts (never carried here).
    //
    // ── THE PATH IS READ (it used to be discarded) ────────────────────────────────────────────────────
    // This method took `_path` and returned `axes.territory.children` — the repository's TOP-LEVEL
    // territories — for every argument. Measured back-to-back in one repo state, `atlas init .`,
    // `atlas init src` and `atlas init README.md` printed an IDENTICAL five-territory block, and
    // `atlas init no/such/path` reported a full successful move-in of a path that does not exist. The
    // argument was published, accepted, and inert: `atlas init <path>` told the user it had walked what
    // they named while it walked something else.
    //
    // Honoured, rather than dropped from the surface, because the path is genuinely meaningful — it already
    // selected the blast radius on the very next line, and `atlas init <subtree>` is the whole point of the
    // command on a big repo. Resolution is DELEGATED to `@atlas/index` exactly like `cover` (this facet
    // computes no descent of its own); the ROOT is the one node `resolve` cannot name (see `isRepoRoot`),
    // so it is taken from the axis directly — a read, not a resolution.
    //
    // The reported units are the resolved node's CHILDREN, or the node ITSELF when it is a leaf: `.` yields
    // the top-level territories exactly as before, `src` yields what lives under `src`, and `README.md`
    // yields itself. A path that resolves to NOTHING throws — the handler renders that as a structured
    // rejected verdict (TOOLS-2), which is the same fail-closed answer `cover` already gives a scope no
    // territory covers. Returning an empty list instead would be indistinguishable from an empty repo, and
    // "a failure that reads as a genuinely empty result" is the specific defect this module must not have.
    territories(path: string) {
      const atRoot = isRepoRoot(path)
      const node = atRoot ? axes.territory : deps.createResolve(forest()).resolve("territory", path)
      if (node === undefined) {
        throw new Error(
          `no-such-path: no structural unit at '${path}' — atlas init walks a path that exists in the ` +
            `repository tree, spelled repo-relative (\`.\` for the whole repo, \`src\`, \`src/lib.ts\`)`,
        )
      }
      // At the ROOT the territories are its children and NOTHING else — an empty tree has no territories,
      // and naming the root itself would invent a `.` territory nobody authored. BELOW the root a leaf IS
      // its own territory: `atlas init README.md` names one real unit, and reporting nothing for it would
      // be the same silent-empty answer the `undefined` case above refuses. "Leaf" is measured in PATH
      // children, so `atlas init src/greet.ts` reports the FILE rather than the `::` AST units folded
      // under it — a territory is a file or a directory, never half a line of code.
      const kids = pathChildren(node)
      return (atRoot || kids.length > 0 ? kids : [node]).map(asTerritory)
    },

    // MoveInIndex — the reverse-dep reachability set (blast radius). A FRESH depgraph closure every call:
    // the closure originates entirely in `@atlas/index`, cast Hash[] → NodeKey[] at the sealed seam.
    blastRadius(path: string) {
      const closure = deps.createDepgraph(axes.edges).reverseClosure(deps.nodeHashOfPath(path)).closure
      return asNodeKeys(closure)
    },

    // QueryIndex — resolve a scope to its covering territory skeleton through `@atlas/index`. A FRESH
    // `createResolve(...).resolve(...)` every call (SCN-5b teeth). Fail-closed on a miss (query.ts:29): the
    // handler wrapper converts the throw to a rejected Verdict. invariants/stale are the raw pre-governance
    // read — the tier≥T1 bound + drift live in tools/query.ts, not here.
    cover(scope: string) {
      const node = deps.createResolve(forest()).resolve("territory", scope)
      if (node === undefined) throw new Error(`cover: no covering territory for scope ${scope}`)
      return {
        territory: node.key,
        axisHash: node.subtreeHash as unknown as Hash,
        invariants: [],
        stale: false,
      }
    },

    // #99b N0 — the SYMBOL-level reverse-caller seam, off the SAME assembled surface `blastRadius` rides.
    // The negation door (N2) will call `reverseCallers(target)`/`holeSources()` on it to decide `underApprox`;
    // N0 only exposes the live view (out of scope to build the door here).
    symbolReverse() {
      return symbolReverseView
    },
  }
}
