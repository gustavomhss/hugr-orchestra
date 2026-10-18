// @atlas/adapter-io — src/unit-source.ts  (#182 S2: the SourceReader that returns the UNIT, not the file)
//
// `createFileSourceReader` (prompt.ts) resolves `filePathOf(site)` and reads the WHOLE FILE. Pointed at a
// `symbol`/`block` site it shows the model an entire module and calls it the unit, so a claim true of the
// file gets attributed to the symbol. That was stated honestly in `prompt.ts`'s own prose and was the
// blocker on emitting sub-file sites at all.
//
// THE GUARANTEE IS STRUCTURAL, NOT DOCUMENTED. This reader cannot return more than the unit, because the
// unit's bytes are the only thing it ever holds: it re-runs `foldAstUnits` — the SAME function, on the
// SAME file bytes — and hands back the `content` of the node whose `path` IS `site.qualifiedPath`. Same
// function + same input ⇒ the same slice `subtreeHash` was folded over. There is no widening branch to
// forget, and no docstring doing the work.
//
// IT DOES NOT OPEN A SECOND DOOR ONTO THE FILESYSTEM. The bytes come from the injected file reader — in
// production `createFileSourceReader`, with all three of its checks intact (textual escape, kernel-identity
// containment, and the fd-pinned `O_NOFOLLOW` read). This module adds a SLICE and nothing else; it does no
// IO of its own, so every path/symlink/device refusal keeps firing exactly as before and cannot be
// bypassed by putting `::` on the end of a path.
//
// FAIL-CLOSED, and each refusal is distinguishable at the point it is taken:
//   · the file cannot be read            ⇒ `null` (the injected reader already decided)
//   · the fold produces no such unit key ⇒ `null` — NEVER the file's bytes as a substitute, which is what
//     "fall back to the file" would mean: showing the model 400 lines and telling it they are one function.
//   · the grammar is not warmed          ⇒ the fold is a total no-op ⇒ no unit ⇒ `null`
// `createPromptFactory.build` turns `null` into the existing `source-unreadable` refusal, so a run reports
// "we never showed the model the unit" rather than proposing against the wrong bytes.
//
// COST. One parse per READ, not per repo: a whole-tree fold would be a second ~10-second walk in every
// worker of the proposer pool, whereas the file this site lives in is a few kilobytes and is parsed once
// per site the budget actually buys. The per-file parse result is memoized on the reader instance, so a
// file whose units are visited N times is parsed once.

import type { StructRef } from "@atlas/contracts"
import type { FileTree } from "@atlas/index"
import { foldAstUnits } from "./ast.js"
import { createFileSourceReader } from "./prompt.js"
import type { RelatedUnit, SiblingReader, SourceReader } from "./prompt.js"

/** The FILE portion of a `qualifiedPath` — the prefix up to the FIRST `::` (contracts/struct.ts). Split on
 *  the first separator only: the `::` chain continues into item/block locals. */
function filePathOf(qualifiedPath: string): string {
  const at = qualifiedPath.indexOf("::")
  return at === -1 ? qualifiedPath : qualifiedPath.slice(0, at)
}

/** Every node of a folded single-file tree, indexed by its `path`. First-wins, so the map is a function of
 *  the SET of nodes rather than of the walk order. */
function nodesByPath(tree: FileTree): ReadonlyMap<string, FileTree> {
  const out = new Map<string, FileTree>()
  const walk = (n: FileTree): void => {
    if (!out.has(n.path)) out.set(n.path, n)
    for (const c of n.children) walk(c)
  }
  walk(tree)
  return out
}

/**
 * A `SourceReader` that serves the anchored UNIT's bytes for a `::` site and the whole file otherwise.
 *
 * `read` for a bare path is byte-identical to the injected reader's — arm FILE (#182 S4) therefore sees
 * exactly the bytes master's reader served, and that is why one binary can run both arms.
 *
 * `deps.file` exists so a test can drive the slicing without a repository on disk; production passes
 * nothing and gets the secured `createFileSourceReader(repoPath)`.
 */
export function createUnitSourceReader(repoPath: string, deps: { readonly file?: SourceReader } = {}): SourceReader {
  const file = deps.file ?? createFileSourceReader(repoPath)
  const unitsOf = makeUnitsOf(file)

  return {
    read(site: StructRef): string | null {
      const path = filePathOf(site.qualifiedPath)
      if (path === site.qualifiedPath) return file.read(site) // a whole-file anchor: unchanged behaviour
      const units = unitsOf(site, path)
      if (units === null) return null //                        the file itself was refused
      return units.get(site.qualifiedPath)?.content ?? null //  NO fallback to the file — that is the point
    },
  }
}

/** The memoized per-file fold both readers share (never a duplicated primitive). `path → the folded node
 *  index of THAT file, or `null` when the file itself could not be read`; memoized per reader instance (one
 *  mine pass / one pool worker), never module-global. The FILE request narrows the site to its file and
 *  CARRIES THROUGH the same `subtreeHash` — never a fabricated one, since the injected reader consults
 *  `qualifiedPath` alone (inventing a hash here would put a false value on the wire for no reason). */
function makeUnitsOf(file: SourceReader): (site: StructRef, path: string) => ReadonlyMap<string, FileTree> | null {
  const folded = new Map<string, ReadonlyMap<string, FileTree> | null>()
  return (site, path) => {
    const hit = folded.get(path)
    if (hit !== undefined) return hit
    const src = file.read({ kind: "file", qualifiedPath: path, subtreeHash: site.subtreeHash })
    const built = src === null ? null : nodesByPath(foldAstUnits({ path, children: [], content: src }))
    folded.set(path, built)
    return built
  }
}

/** The identifier grammar for the same-file sibling BFS — a JS/TS identifier token. Used to decide which
 *  OTHER same-file units a unit's bytes reference by name. Deliberately over-inclusive (it will match a
 *  method name that merely coincides with a sibling's leaf); over-inclusion widens CONTEXT the model reads
 *  and never touches the grounding anchor, so the failure direction is "shows one context unit too many",
 *  not "grounds against the wrong bytes". */
const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g

/** The symbol chain of a unit path — everything after the FIRST `::` (the `<file>::` prefix removed). The
 *  human name shown to the model as a `<related-unit name>`. */
function unitChainOf(qualifiedPath: string): string {
  const at = qualifiedPath.indexOf("::")
  return at === -1 ? qualifiedPath : qualifiedPath.slice(at + 2)
}

/** The leaf IDENTIFIER of a unit chain — the trailing `:`-segment (`function_declaration:0:createInit` ⇒
 *  `createInit`). This is the token another unit would mention to reference it. */
function leafIdentOf(chain: string): string {
  const segs = chain.split(":")
  return segs[segs.length - 1] ?? chain
}

/**
 * A `SiblingReader` that resolves the minimal same-file CONTEXT set a target unit references (the ENRICH
 * fix, A4-LEVER.md `a4-enrich-fix.json`): an identifier BFS over the SAME file's folded units, seeded by the
 * target and its parent chain, expanding to any sibling whose leaf identifier appears in an included unit's
 * bytes, transitively, capped at `cap` (default 8). Same file only — no cross-file IO, no retrieval
 * dependency; it reuses the exact memoized fold `createUnitSourceReader` uses, so the whole-tree parse is
 * never re-run and the bytes come through the same secured `createFileSourceReader`.
 *
 * WHY THIS IS SOUND FOR GROUNDING: the returned units are CONTEXT for the proposer only. The caller
 * (`createPromptFactory`) shows them to the model but grounds the fact — and mints its evidence span —
 * against the TARGET unit alone. So enrichment lifts PRECISION (a fact whose truth needs a sibling's
 * bytes/type is derivable instead of guessed, #201) without moving the anchor (KNOW-15g: secondary context
 * feeds the proposer, never identity).
 *
 * TOTAL: a whole-file site, an unresolvable file, or a target the fold does not contain all yield `[]` — the
 * caller then renders no related context and the enriched prompt degrades to the bare anchored-unit prompt.
 */
export function createUnitSiblingReader(
  repoPath: string,
  deps: { readonly file?: SourceReader } = {},
  cap = 8,
): SiblingReader {
  const file = deps.file ?? createFileSourceReader(repoPath)
  const unitsOf = makeUnitsOf(file)

  return {
    readSiblings(site: StructRef): readonly RelatedUnit[] {
      const path = filePathOf(site.qualifiedPath)
      if (path === site.qualifiedPath) return [] // a whole-file anchor has no sub-file siblings
      const units = unitsOf(site, path)
      if (units === null || !units.has(site.qualifiedPath)) return [] // file refused / target not folded

      // Index the file's sub-file units by their symbol chain → bytes. The file root is excluded (it is the
      // container, not a sibling); a unit with no content is skipped (nothing to show, nothing to scan).
      const byChain = new Map<string, string>()
      for (const [qp, node] of units) {
        if (qp !== path && node.content !== undefined) byChain.set(unitChainOf(qp), node.content)
      }

      const targetChain = unitChainOf(site.qualifiedPath)
      // Seeds: the target plus every ancestor prefix of its `::` chain (a nested unit's context includes its
      // enclosing declaration). Mirrors `bin/enrich-anchor.mjs`.
      const seeds: string[] = [targetChain]
      const parts = targetChain.split("::")
      for (let i = 1; i < parts.length; i++) seeds.push(parts.slice(0, i).join("::"))

      const included = new Map<string, string>()
      const queue = [...seeds]
      while (queue.length > 0 && included.size < cap) {
        const name = queue.shift()!
        const content = byChain.get(name)
        if (content === undefined || included.has(name)) continue
        included.set(name, content)
        const idents = new Set(content.match(IDENT_RE) ?? [])
        for (const [chain] of byChain) {
          if (!included.has(chain) && idents.has(leafIdentOf(chain))) queue.push(chain)
        }
      }
      included.delete(targetChain) // the target is the anchored unit, shown separately — never its own context

      return [...included].map(([chain, content]) => ({ name: chain, content }))
    },
  }
}
