// @atlas/adapter-io — src/grounding-computer.ts  (WP-10.A1.ADAPTER — AUTHOR-1/3/4, ADR-0004)
//
// THE ONE GROUNDING COMPUTER (AUTHOR-1). This module owns the single derivation the whole authoring surface —
// and the `atlas-emit` truth-gate — stand on: the built `Axes` over `foldAstUnits(walkFileTree(repo))` plus
// the SCIP projection. `deriveGroundingAxes` is THAT derivation, and it is the ONLY place the fold→build
// composition lives on the grounding path: `composeRuntime` (the HEAD gate + this planner) and
// `createRevIndex` (the arbitrary-rev reconcile oracle) both route through it, so there is no second fold, no
// cached digest table, and no per-caller re-implementation (AUTHOR-1). A draft grounded HERE therefore re-
// derives against the gate's own oracle by construction (`@atlas/grounding` `resolveCurrent`, drift.ts).
//
// This module IMPLEMENTS the frozen `@atlas/tools` `GroundingComputer` PORT (owned there, consumed here —
// ARCH-2). It is a PLANNER surface: it READS the built index and returns; it persists NOTHING and carries no
// write authority (AUTHOR-2). It is NOT a member of `GOVERNANCE_SURFACE` or `WRITE_PATHS`.
//
// WARM-UP IS OWNED INSIDE THE SEAM (AUTHOR-1, last clause). `warmGroundingComputer(repoPath)` awaits
// `initAst()` before it walks + builds, so a COLD caller that performed no grammar warm-up still gets the
// `::` sub-file fold the runtime does — no caller-side set-up is required (retires the `author.ts:24-31`
// top-level `await initAst()` smell: the seam warms itself). `buildGroundingComputer` is the SYNC wrapper
// over an ALREADY-BUILT `Axes` — the shape `composeRuntime` uses, where the entrypoint bins warmed the
// grammar before the (sync) composition root ran; its precondition (warm grammars in the axes it is handed)
// is the composition root's, not the caller's.

import { build } from "@atlas/index"
import type { Axes, FileTree, IndexNode, ScipOutput } from "@atlas/index"
import { bindGate, isGrounded, driftDetect, resolveCurrent } from "@atlas/grounding"
import type { Hash, StructRef } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type {
  AnchorsOut,
  AnchorUnit,
  GroundingCandidate,
  GroundingComputer,
  LanguageHole,
  TruthGate,
} from "@atlas/tools"
import { foldAstUnits, initAst, isTsPath } from "./ast.js"
import { walkFileTree } from "./fs.js"
import { readScipOrEmpty } from "./scip.js"
import { headSha } from "./run-git.js"

/**
 * THE ONE GROUNDING DERIVATION (AUTHOR-1). Fold sub-file AST item/block units into the walked `FileTree`,
 * then `build` the content-addressed `Axes` the truth-gate re-derives freshness against. Every anchor
 * `subtreeHash` the product trusts is minted HERE — the emit gate (`buildGate(axes)` in `compose.ts`), the
 * anchor planner ({@link buildGroundingComputer}), and the arbitrary-rev reconcile oracle (`rev-index.ts`) all
 * route through this one function, so no two derivations can diverge. `fileTree` (the folded input) is returned
 * BESIDE the axes because the composition root threads it onward (DEDUP-COMPOSITION #241) — computed once here.
 *
 * `foldAstUnits` is a no-op until `initAst()` has been awaited (the module-level grammar singletons, `ast.ts`),
 * so a caller that has NOT warmed the grammar gets the same file/dir-only fold the runtime gives an un-warmed
 * process. {@link warmGroundingComputer} owns that warm-up on the planner's behalf.
 */
export function deriveGroundingAxes(
  rawTree: FileTree,
  scipOutput: ScipOutput,
): { readonly axes: Axes; readonly fileTree: FileTree } {
  const fileTree = foldAstUnits(rawTree)
  return { axes: build(fileTree, scipOutput), fileTree }
}

/** What the sync computer is composed over: the ONE built `Axes` (from {@link deriveGroundingAxes}), the RAW
 *  (un-folded) `FileTree` the axes were built from — the faithful file/dir census the hole declaration needs —
 *  and the `rev` the set was computed at (AUTHOR-3, reported on every `AnchorsOut`). */
export interface GroundingComputerConfig {
  readonly axes: Axes
  readonly rawTree: FileTree
  readonly rev: string
}

/** The POSIX path separator the index keys directories/files on (walkFileTree emits repo-relative POSIX). */
const SEP = "/"
/** The `::` refinement join a folded sub-file unit key carries (`file::item::block`, ast.ts `unitPath`). */
const UNIT_SEP = "::"

/** Normalize a query `path` to an index key: drop a leading `./`, a trailing `/`, and treat `''`/`.` as the
 *  repo root. Total — a bare string in, a key string out; no FS access, so it never throws. */
function normalizeQueryPath(path: string): string {
  let p = path.trim()
  if (p.startsWith("./")) p = p.slice(2)
  while (p.length > 1 && p.endsWith(SEP)) p = p.slice(0, -1)
  return p === "" ? "." : p
}

/** The file the unit lives in: the prefix up to the first `::` (a symbol/block anchor), else the key itself
 *  (a file/dir unit). Mirrors `StructRef.qualifiedPath`'s "FILE portion is the prefix up to the first `::`". */
function filePathOf(key: string): string {
  const i = key.indexOf(UNIT_SEP)
  return i < 0 ? key : key.slice(0, i)
}

/** The lowercased dotted extension of a path (`core/engine.rs` → `.rs`), or `''` when there is none. */
function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf(SEP) + 1)
  const dot = base.lastIndexOf(".")
  return dot <= 0 ? "" : base.slice(dot).toLowerCase()
}

/**
 * The honest floor of STRUCTURED source languages Atlas recognises but has NO configured tree-sitter grammar
 * for (AUTHOR-4 / A-D5). Membership here is what makes a grammar-less file DECLARE a hole rather than degrade
 * silently to a file-level unit — the distinction AUTHOR-4 demands between "a language with sub-file structure
 * we are blind to" (`.rs`, `.py`, …) and "a file that genuinely has no sub-file structure" (`.md`, config,
 * `.gitignore` — absent here, so NO hole is declared for them, which would be an overclaim in the other
 * direction). TypeScript is deliberately NOT here: it HAS a grammar (`ast.ts`), so a `.ts` file that folds to
 * file-level (a parse error) is a grammar GAP, not a language hole. This set GROWS as grammars are added or
 * more source languages are recognised — it is a floor, not a closed rule. `.rs` is the one the CAMPAIGN-10
 * fixture and the Atlas dogfood repo (185 `.rs` files, design/authoring.md §AUTH-4) exercise.
 */
const GRAMMARLESS_SOURCE: Readonly<Record<string, string>> = {
  ".rs": "Rust",
  ".py": "Python",
  ".go": "Go",
  ".java": "Java",
  ".rb": "Ruby",
  ".c": "C",
  ".h": "C",
  ".cc": "C++",
  ".cpp": "C++",
  ".hpp": "C++",
  ".cs": "C#",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".scala": "Scala",
  ".php": "PHP",
}

/** Classify an index key into the coarse `AnchorUnit.kind` grain (AUTHOR-3). A `::` key is a folded sub-file
 *  unit (`symbol`); otherwise the RAW file/dir census decides — a leaf-with-content is a `file`, a directory is
 *  a `dir`. Defaults to `file` for a key the census does not carry (never throws). */
function anchorKindOf(key: string, kinds: ReadonlyMap<string, "file" | "dir">): AnchorUnit["kind"] {
  if (key.includes(UNIT_SEP)) return "symbol"
  return kinds.get(key) ?? "file"
}

/** Classify an index key into the richer `StructRef.kind` (grounding anchor, 6-way). A `::` key is a `symbol`;
 *  a directory is `directory`; everything else is a `file`. Descriptive metadata only — the drift oracle is
 *  `subtreeHash` alone (GROUND-1), never this. */
function structKindOf(key: string, kinds: ReadonlyMap<string, "file" | "dir">): StructRef["kind"] {
  if (key.includes(UNIT_SEP)) return "symbol"
  return kinds.get(key) === "dir" ? "directory" : "file"
}

/** The RAW file/dir census keyed by index path (built from the UN-folded tree, so it carries no `::` unit and
 *  cannot mis-key a symbol as a file). The repo root (`.`) is omitted — it is never a groundable anchor. */
function censusOf(rawTree: FileTree): Map<string, "file" | "dir"> {
  const kinds = new Map<string, "file" | "dir">()
  const walk = (n: FileTree): void => {
    if (n.path !== ".") kinds.set(n.path, n.content !== undefined ? "file" : "dir")
    for (const c of n.children) walk(c)
  }
  walk(rawTree)
  return kinds
}

/** Find the index node whose `key` equals `key`, preorder over `root`'s subtree. Total: `undefined` if absent. */
function findByKey(root: IndexNode, key: string): IndexNode | undefined {
  if (root.key === key) return root
  for (const child of root.children) {
    const hit = findByKey(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** Collect every PROPER descendant of `node`, preorder (the deterministic ASCII-sorted sibling order `build`
 *  imposes — so the listing is order-stable across runs, SCN-AUTH-3f, and never reorders, SCN-AUTH-3b). */
function collectDescendants(node: IndexNode, into: IndexNode[]): void {
  for (const child of node.children) {
    into.push(child)
    collectDescendants(child, into)
  }
}

/**
 * Build the SYNC {@link GroundingComputer} over an ALREADY-BUILT `Axes` (from {@link deriveGroundingAxes}).
 * Both port capabilities read that one axes, so the planner and the gate are provably the same seam:
 *   - `anchorsUnder(path)` lists the groundable units the built index carries UNDER `path` — each with its
 *     `qualifiedPath`, `kind`, and current `subtreeHash` — plus every declared language hole, reporting the
 *     `rev` the set was computed at (AUTHOR-3/4). NEVER throws: an untracked / absent / unreadable `path`
 *     resolves to no node and returns the honest empty listing (no `reason` — the `anchors` leg supplies the
 *     floor reason, AUTHOR-3; a POPULATED listing carries NO reason, lucy note (a)).
 *   - `groundingFor(candidate)` computes the grounding anchor for the cited unit at the current rev — its
 *     `subtreeHash` is exactly the gate's drift oracle (`@atlas/grounding` `resolveCurrent`, drift.ts — the
 *     SAME function `driftDetect` re-derives with, not a mirror of it); an unresolvable anchor yields an empty
 *     `subtreeHash` (which the gate reads as DRIFTED — fail-closed, never a throw).
 * Precondition: the axes were built with warmed grammars (the composition root's obligation; see the header).
 */
export function buildGroundingComputer(cfg: GroundingComputerConfig): GroundingComputer {
  const { axes, rawTree, rev } = cfg
  const kinds = censusOf(rawTree)

  const anchorsUnder = (path: string): AnchorsOut => {
    const key = normalizeQueryPath(path)
    const node = findByKey(axes.spatial, key)
    if (node === undefined) {
      // Untracked / outside the built set / unreadable: the honest empty listing. The `anchors` leg attaches
      // the AUTHOR-3 reason; the computer names none (it cannot distinguish the causes from the built index
      // alone, and a wrong specific reason would be worse than the leg's honest floor).
      return { rev, units: [], holes: [] }
    }
    const descendants: IndexNode[] = []
    collectDescendants(node, descendants)
    const units: AnchorUnit[] = descendants.map((d) => ({
      qualifiedPath: d.key,
      kind: anchorKindOf(d.key, kinds),
      subtreeHash: String(d.subtreeHash),
      path: filePathOf(d.key),
    }))
    return { rev, units, holes: declaredHoles(units) }
  }

  const groundingFor = (candidate: GroundingCandidate): StructRef => {
    const subtreeHash = resolveCurrent(axes, candidate.anchor)
    return {
      kind: structKindOf(candidate.anchor, kinds),
      qualifiedPath: candidate.anchor,
      subtreeHash: subtreeHash ?? ("" as StructRef["subtreeHash"]),
    }
  }

  return { anchorsUnder, groundingFor }
}

/**
 * Adapt the REAL GROUND truth-gate (`bindGate({ isGrounded, driftDetect })`) into the tools `TruthGate`
 * surface. Housed HERE, beside the grounding computer, because BOTH re-derive against the SAME built `Axes`
 * (AUTHOR-1): the emit gate and the `anchors` planner are one seam, and `composeRuntime` binds this over the
 * very axes {@link deriveGroundingAxes} produced. The GROUND gate reads the candidate's incoming `Status`
 * verdict + re-derives freshness against `src = Axes`:
 *   - the incoming verdict is a `PredicateNode`'s `.status`, or `HOLDS` injected for an `AdvisoryNode`
 *     (which has no Status field) — an advisory is admitted iff it is grounded ∧ FRESH.
 *   - the `at` sha is IGNORED (vestigial): freshness is re-derived against the built-index `axes`, not a sha.
 * Downgrade-only + fail-closed: an ungrounded/DRIFTED node collapses to `NA`, never `HOLDS`.
 */
export function buildGate(axes: Axes): TruthGate {
  const real = bindGate({ isGrounded, driftDetect })
  return {
    gateHolds: (node: GroundedFact, _at: Hash) =>
      real.gateHolds(node.kind === "predicate" ? node.status : "HOLDS", node.grounding, axes),
  }
}

/**
 * Declare the language holes under a listing (AUTHOR-4). Census the FILE units by extension; for every
 * extension that is a KNOWN structured source language with no configured grammar ({@link GRAMMARLESS_SOURCE})
 * emit ONE hole naming the extension, the REAL file count under the path (SCN-AUTH-4b — never a constant), and
 * the reason. A `.ts`/`.tsx` file (grammar present) and a genuinely-unstructured file (`.md`, config) declare
 * NO hole. Deterministically sorted by extension so two runs are byte-identical (SCN-AUTH-3f).
 */
function declaredHoles(units: readonly AnchorUnit[]): LanguageHole[] {
  const counts = new Map<string, number>()
  for (const u of units) {
    if (u.kind !== "file") continue
    if (isTsPath(u.qualifiedPath)) continue // a configured grammar exists — not a language hole
    const ext = extOf(u.qualifiedPath)
    if (GRAMMARLESS_SOURCE[ext] === undefined) continue // not a structured source language — no overclaim
    counts.set(ext, (counts.get(ext) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([ext, fileCount]) => ({
      ext,
      fileCount,
      reason: `no configured ${GRAMMARLESS_SOURCE[ext]} grammar — symbol-level anchoring unavailable for '${ext}' files; the file-level anchor is returned (A-D5, AUTHOR-4)`,
    }))
}

/** The warmed, repo-scoped grounding computer bundle — the port PLUS the axes/fileTree/rev the composition
 *  root threads onward, so a caller of {@link warmGroundingComputer} needs no second walk/build. */
export interface WarmGroundingComputer {
  readonly computer: GroundingComputer
  readonly axes: Axes
  readonly fileTree: FileTree
  readonly rev: string
}

/** Where `composeRuntime` looks for the optional SCIP dump under a repo (mirrors `compose.ts` `SCIP_REL`). */
const SCIP_REL = ".atlas/index.scip"

/**
 * The SELF-WARMING seam entry (AUTHOR-1, last clause). Awaits `initAst()` — owning the grammar warm-up so no
 * caller must perform it — then walks the repo, reads the optional SCIP dump, and routes through the ONE
 * {@link deriveGroundingAxes} to build the computer. A COLD process reaches the same `::` sub-file fold the
 * warmed runtime does (SCN-AUTH-1c/1e). `rev` is the repo's HEAD sha (`''` on a non-git/absent repo — the
 * axes then carry only what `walkFileTree` could read, and `anchorsUnder` returns the honest empty listing).
 * TOTAL over its inputs: `walkFileTree`/`readScipOrEmpty`/`headSha` are each fail-closed (never throw).
 */
export async function warmGroundingComputer(repoPath: string): Promise<WarmGroundingComputer> {
  await initAst() // the seam owns the warm-up — a caller performs none (retires the author.ts:24-31 smell)
  const rawTree = walkFileTree(repoPath)
  const scipOutput = readScipOrEmpty(`${repoPath}/${SCIP_REL}`)
  const { axes, fileTree } = deriveGroundingAxes(rawTree, scipOutput)
  const rev = headSha(repoPath) ?? ""
  return { computer: buildGroundingComputer({ axes, rawTree, rev }), axes, fileTree, rev }
}
