// @atlas/e2e-blackbox — test/adversarial-fixtures.ts  (fact fixtures the product doors CANNOT author)
//
// Every happy-path GROUNDED fact is now authored through the product `atlas draft` door (see
// test/support.ts — `draftFact` / `symbolAnchorKey`). What survives HERE is the complement: fact
// shapes the product doors REFUSE, or cannot compose by construction, so a black-box story that needs one as
// INPUT must fabricate it. Each is a deliberate hostile/degenerate payload the governed emit gate is meant
// to reject, or a grounding the single-anchor draft door cannot build:
//   - `ungroundedFact` — cites a subtreeHash NO index unit carries ⇒ the truth gate DRIFTS it (rejected).
//   - `subtreeHashOf` — reads the REAL folded-index subtreeHash of a path; the primitive the forged/stale-
//     hash relation fixtures and the s12 hand-built multi-entry grounding cite.
//   - `groundedSymbolFact` — a single `::` symbol-anchored fact, kept as a BUILDING BLOCK for s12's
//     multi-entry (symbol + secondary-file) grounding, which the single-anchor draft door cannot author.
//   - `groundedMultiSymbolFact` — a MANY-anchor grounding `nodeKey` refuses to mint (the degenerate-anchor
//     case); the door could not even construct the adversarial input.
//   - `groundedRelationFact` — a directed two-endpoint RELATION node (its own `relationKey` identity).
//   - `negationPayload` — a raw scoped-negation node as it ARRIVES at the abstention door (the door re-mints
//     id / grounding / edgeModel; only the identity triple + tier are honest here).
// Product LIBS are imported ONLY to construct these inputs; every EXECUTION and every ASSERTION in the
// stories stays pure black-box (subprocess / stdio). No product code touches the assertions.

import { build } from "@atlas/index"
import type { Axes, IndexNode } from "@atlas/index"
import { foldAstUnits, initAst, walkFileTree } from "@atlas/adapter-io"
import { nodeKey, relationKey } from "@atlas/knowledge"
import type { Candidate, GroundedFact, NegationNode, PredicateSlot, RelationKind, RelationNode } from "@atlas/knowledge"
import type { SubtreeHash, Tier } from "@atlas/contracts"

// WARM UP the opt-in AST grammar at MODULE LOAD (top-level await) so this in-process authoring helper folds
// the SAME `::` sub-file units the runtime does (F1). `composeRuntime` (driven by the spawned `atlas` bin,
// which awaits `initAst()`) now folds AST units into the index BEFORE `build`, which changes every parseable
// file node from a content-hash LEAF into a children-hash BRANCH. To author a fact whose grounding still
// re-derives FRESH against that folded index, `axesOf` below MUST fold identically — hence the warmup here.
// Because ESM finishes a module's top-level await before its importers evaluate, every story that imports
// this helper gets warm grammars before its `beforeAll` runs, with NO change to the story files themselves.
await initAst()

/** Build the SAME folded `Axes` the runtime composes over a repo (the fixture's SCIP is empty documents):
 *  `foldAstUnits(walkFileTree(repo))` → `build`, so a file node is a BRANCH over its `::` item/block units
 *  and a symbol path resolves. This is the identical transform `composeRuntime`/`assembleHandler` apply. */
function axesOf(repoPath: string): Axes {
  return build(foldAstUnits(walkFileTree(repoPath)), { documents: [] })
}

/** Brand a raw digest string as the drift-oracle `SubtreeHash` (runtime no-op — the brand is erased in
 *  JSON; the value written to the fact file is a plain string the emit gate re-derives against). */
const asSubtree = (h: string): SubtreeHash => h as unknown as SubtreeHash

/** Walk an axis hierarchy for the node whose `key` is `qualifiedPath`; return its `subtreeHash` (string). */
function findByKey(node: IndexNode, key: string): string | undefined {
  if (node.key === key) return String(node.subtreeHash)
  for (const child of node.children) {
    const hit = findByKey(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** The REAL `subtreeHash` the emit truth-gate will re-derive for `qualifiedPath` — computed by building the
 *  SAME `Axes` the runtime composes over the fixture repo. Throws if the path is not a real index unit
 *  (a genuine ceiling: only file/dir paths resolve — the index has no `::` symbol nodes). */
export function subtreeHashOf(repoPath: string, qualifiedPath: string): string {
  const axes = axesOf(repoPath)
  for (const root of [axes.spatial, axes.territory, axes.dependency]) {
    const hit = findByKey(root, qualifiedPath)
    if (hit !== undefined) return hit
  }
  throw new Error(`author: no index unit for '${qualifiedPath}' — cannot ground (index has no such node)`)
}

/** DFS for the `IndexNode` whose `key` equals `key` (a file path OR a `::` sub-file unit key). */
function findNode(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const child of node.children) {
    const hit = findNode(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** The declared NAME of a folded unit key — the trailing `:`-field of its last `::` segment
 *  (`file::<start>:<kind>:<name>` ⇒ `<name>`, cf. adapter-io/src/ast.ts `unitPath`). */
function unitLeafName(key: string): string {
  const seg = key.split("::").at(-1) ?? ""
  return seg.slice(seg.lastIndexOf(":") + 1)
}

/** The recipe for one grounded advisory fact anchored at a SUB-FILE symbol inside `filePath`. */
export interface SymbolFactSpec {
  readonly repoPath: string
  readonly filePath: string // the file the symbol lives in (a real fixture file)
  readonly symbolName: string // the declared name of a top-level item in that file (e.g. `foo`)
  readonly slot: PredicateSlot
  readonly claim: string
  readonly tier?: Tier // default 'T1'
  readonly scope?: string // default 'src'
}

/**
 * A serializable advisory `GroundedFact` grounded at a `::` SUB-FILE SYMBOL anchor (`kind: 'symbol'`). Its
 * computed `primaryAnchor` is the folded `::` unit path — a PROPER structural DESCENDANT of the file node —
 * so paired with a FILE-anchored fact sharing the same slot + exact claim, `deriveSubsumes` fires
 * `file ⊃ symbol` on read (F1). The cited `subtreeHash` is the REAL folded-index hash of the symbol unit,
 * so the emit truth-gate re-derives it FRESH. Throws if the named symbol is not a real folded index unit.
 */
export function groundedSymbolFact(spec: SymbolFactSpec): GroundedFact {
  // Default T1 — visible in the bounded read pack (tier≥T1); routes to full-ratify, driven under a token.
  const tier: Tier = spec.tier ?? "T1"
  const axes = axesOf(spec.repoPath)
  const fileNode = findNode(axes.spatial, spec.filePath)
  if (fileNode === undefined) throw new Error(`author: no file node '${spec.filePath}'`)
  const unit = fileNode.children.find((c) => unitLeafName(c.key) === spec.symbolName)
  if (unit === undefined) {
    throw new Error(`author: no symbol unit '${spec.symbolName}' under '${spec.filePath}' (index has no such AST node)`)
  }
  const grounding: GroundedFact["grounding"] = {
    entries: [
      {
        anchor: { kind: "symbol", qualifiedPath: unit.key, subtreeHash: asSubtree(String(unit.subtreeHash)) },
        path: spec.filePath,
      },
    ],
  }
  const candidate: Candidate = {
    claimText: spec.claim,
    claimNorm: spec.claim,
    slot: spec.slot,
    grounding,
    provenance: { source: "e2e-blackbox", trusted: true },
    tier,
  }
  return {
    kind: "advisory",
    id: nodeKey(candidate),
    tier,
    claimNorm: spec.claim,
    grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope: spec.scope ?? "src",
    predicateSlot: spec.slot,
  }
}

/** An UNGROUNDED fact: same shape, but the anchor cites a `subtreeHash` NO index unit carries, so the truth
 *  gate re-derivation FAILS (DRIFTED → NA → rejected). Used by S2 to prove grounded-or-rejected. */
export function ungroundedFact(claim: string, scope = "src"): GroundedFact {
  const grounding: GroundedFact["grounding"] = {
    entries: [
      {
        anchor: { kind: "file", qualifiedPath: "src/foo.ts", subtreeHash: asSubtree("deadbeefnotarealsubtreehash") },
        path: "src/foo.ts",
      },
    ],
  }
  return {
    kind: "advisory",
    id: "ungrounded-e2e-node" as unknown as GroundedFact["id"],
    tier: "T1",
    claimNorm: claim,
    grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope,
    predicateSlot: "invariant",
  }
}

/** The recipe for one advisory fact grounded at SEVERAL `::` sub-file symbols, possibly across files. */
export interface MultiSymbolFactSpec {
  readonly repoPath: string
  readonly sites: readonly (readonly [file: string, symbol: string])[] // ≥1 (file, top-level symbol) pairs
  readonly slot: PredicateSlot
  readonly claim: string
  readonly tier?: Tier // default 'T1'
  readonly scope?: string // default 'src'
}

/**
 * A serializable advisory `GroundedFact` grounded at MANY symbol anchors — the shape that exposed the
 * degenerate-anchor defect (SEAT ANCHOR). Every cited `subtreeHash` is the REAL folded-index hash, so the
 * emit truth-gate re-derives each site FRESH and the write is refused (or accepted) on IDENTITY grounds
 * alone, never on grounding.
 *
 * `id` IS AUTHORED DEFENSIVELY. The payload `id` is never used for routing — both write paths RE-MINT the
 * identity from the content — but the product's own `nodeKey` now REFUSES a grounding that names no single
 * structural unit, so an authoring helper that called it unguarded could not even construct the adversarial
 * input. The placeholder keeps the black-box story honest: what is emitted is exactly what a hostile author
 * could write by hand into a JSON file, and the door re-mints regardless.
 */
export function groundedMultiSymbolFact(spec: MultiSymbolFactSpec): GroundedFact {
  const tier: Tier = spec.tier ?? "T1"
  const axes = axesOf(spec.repoPath)
  const entries = spec.sites.map(([filePath, symbolName]) => {
    const fileNode = findNode(axes.spatial, filePath)
    if (fileNode === undefined) throw new Error(`author: no file node '${filePath}'`)
    const unit = fileNode.children.find((c) => unitLeafName(c.key) === symbolName)
    if (unit === undefined) throw new Error(`author: no symbol unit '${symbolName}' under '${filePath}'`)
    return {
      anchor: { kind: "symbol" as const, qualifiedPath: unit.key, subtreeHash: asSubtree(String(unit.subtreeHash)) },
      path: filePath,
    }
  })
  const grounding = { entries } as unknown as GroundedFact["grounding"]
  const candidate: Candidate = {
    claimText: spec.claim,
    claimNorm: spec.claim,
    slot: spec.slot,
    grounding,
    provenance: { source: "e2e-blackbox", trusted: true },
    tier,
  }
  let authoredId: GroundedFact["id"]
  try {
    authoredId = nodeKey(candidate)
  } catch {
    authoredId = "author-could-not-mint" as unknown as GroundedFact["id"]
  }
  return {
    kind: "advisory",
    id: authoredId,
    tier,
    claimNorm: spec.claim,
    grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope: spec.scope ?? "src",
    predicateSlot: spec.slot,
  }
}

/** The recipe for one grounded RELATION fact (ADR-0015 D2 / #99a). `fileA`/`fileB` are REAL fixture files —
 *  the two ENDPOINTS of the directed relation. They normally live in DIFFERENT directories (a relation is
 *  inherently cross-file); when they share no `::` ancestor the intrinsic `nodeKey`/`primaryAnchorId` path
 *  THROWS `DegenerateAnchorError` (the #103 wildcard fix) — which is exactly why a relation cannot reuse it
 *  and mints its own `relationKey` instead. */
export interface RelationFactSpec {
  readonly repoPath: string
  readonly fileA: string // endpointA — the directed SUBJECT (the scope-owned side, ADR-0015 §4a)
  readonly fileB: string // endpointB — the directed OBJECT
  readonly relationKind: RelationKind
  readonly tier?: Tier // default 'T1' — visible in the bounded read pack (tier≥T1)
  readonly scope?: string // default 'src' — the KNOW-11 authz scope (bound on endpointA)
}

/**
 * A serializable RELATION `GroundedFact` whose TWO grounding entries BOTH re-derive FRESH (each cites the
 * real folded-index `subtreeHash` of its endpoint file) and whose identity is the REAL
 * `relationKey(fileA, kind, fileB)` — collision-free over the ORDERED pair, minted WITHOUT
 * `deepestCommonUnit`. `endpointA`/`endpointB` are the location-free identity legs (survive a pure edit); the
 * grounding entries are the freshness legs (`driftDetect` AND-folds both, so the relation DRIFTS if EITHER
 * endpoint's bytes move). Directed: `(A, kind, B) ≠ (B, kind, A)`.
 */
export function groundedRelationFact(spec: RelationFactSpec): GroundedFact {
  const tier: Tier = spec.tier ?? "T1"
  const grounding: GroundedFact["grounding"] = {
    entries: [
      {
        anchor: {
          kind: "file",
          qualifiedPath: spec.fileA,
          subtreeHash: asSubtree(subtreeHashOf(spec.repoPath, spec.fileA)),
        },
        path: spec.fileA,
      },
      {
        anchor: {
          kind: "file",
          qualifiedPath: spec.fileB,
          subtreeHash: asSubtree(subtreeHashOf(spec.repoPath, spec.fileB)),
        },
        path: spec.fileB,
      },
    ],
  }
  const node: RelationNode = {
    kind: "relation",
    id: relationKey(spec.fileA, spec.relationKind, spec.fileB),
    tier,
    relationKind: spec.relationKind,
    endpointA: spec.fileA,
    endpointB: spec.fileB,
    grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
    scope: spec.scope ?? "src",
  }
  return node
}

/** The recipe for one SCOPED NEGATION payload (ADR-0015 D3 / #99b — "the honesty core"): the assertion
 *  `(¬relationKind, target, scope)` — "no `relationKind`-edge to the GLOBAL symbol `target` was found within
 *  the CLOSED directory `scope`". */
export interface NegationFactSpec {
  readonly target: string // the location-free GLOBAL SCIP symbol X the negative is ABOUT (¬∃·→X)
  readonly scope: string //  the CLOSED directory scope S the witness ranges over (its own authz scope)
  readonly relationKind?: RelationKind // default 'calls'
  readonly tier?: Tier // default 'T2' — advisory-class, grounded ⇒ auto-accepts (no ratifier consulted)
}

/**
 * A serializable raw `NegationNode` as it ARRIVES at the door. Unlike the advisory/relation authors above,
 * this one computes NOTHING from the index: the abstention DOOR (governed-emit-negation.ts) is the sole
 * authority that decides closure and CONSTRUCTS the §3 grounding, mints the `negationKey` id, and stamps the
 * `edgeModel` at admit — so `grounding`/`id`/`edgeModel` here are placeholders the door re-derives (exactly as
 * the door's own unit tests hand it an empty grounding). What the payload carries that MATTERS is the identity
 * triple `(relationKind, target, scope)` and the tier; the door proves or refuses the rest against the REAL
 * completeness feed it builds from the fixture's SCIP. This is the honest shape a user would write by hand.
 */
export function negationPayload(spec: NegationFactSpec): GroundedFact {
  const tier: Tier = spec.tier ?? "T2"
  const node: NegationNode = {
    kind: "negation",
    id: "author-placeholder-remint" as unknown as NegationNode["id"], // the door MINTS negationKey; never trusted
    tier,
    relationKind: spec.relationKind ?? "calls",
    target: spec.target,
    scope: spec.scope,
    grounding: { entries: [] }, // the door CONSTRUCTS the §3 directory grounding at admit
    edgeModel: "", // the door STAMPS edgeModelVersion() at admit
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  }
  return node
}
