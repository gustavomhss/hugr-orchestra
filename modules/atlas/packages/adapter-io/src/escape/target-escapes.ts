// @atlas/adapter-io — src/escape/target-escapes.ts  (ADR-0016 M2b — the `targetEscapes` closure leg)
//
// Builds the `escape(X)` leg the negation door's v2 gate consumes (`NegationEmitDeps.targetEscapes`). It reads
// RAW SCIP occurrences (with RANGES) via `deserializeSCIP` — the frozen `readScip`/`readScipOrEmpty` in this
// package PROJECT RANGES AWAY, so we must deserialize the dump ourselves — joins each reference occurrence's
// range to a tree-sitter node (`descendantForPosition`), and classifies it with the SHIPPED language-blind
// `tsEscapeClassifier` to decide, PER CANONICAL SYMBOL, whether any reference sits in a non-safe position. The
// classifier is driven DIRECTLY (not via a generic aggregation wrapper) because this leg needs two things a
// `Set`-returning aggregate cannot give: WITNESS SITES for the durable abstention record, and a FAIL-CLOSED
// verdict on an un-locatable node (see the loop below). The result is a `Map<canonicalSymbol, witnessSites[]>`
// computed ONCE; `targetEscapes(X)` is then a pure lookup — canonicalize X the SAME way and return its
// witnesses (or `[]` ⇒ X does not escape).
//
// This is a faithful port of `harness/probes/escape-ts-oracle-agree.mjs`'s SCIP-range ⋈ tree-sitter join.
//
// SOUNDNESS RAILS (violating any is a false-admit — the whole point of the gate):
//   · CANONICALIZE every symbol (occurrences AND the query target) before keying — an un-canonicalized
//     cross-package `dist/*.d.ts` ref never unifies with its source definition, so a real escape in another
//     package becomes invisible ⇒ a false "non-escaping". Both sides go through `@atlas/index
//     canonicalizeSymbol` (the classifier's caller contract — a raw occurrence ⋈ tree-sitter join keyed on
//     the CANONICAL src-form symbol).
//   · FAIL-CLOSED: an occurrence we cannot LOCATE (no range, or `descendantForPosition` returns null) is
//     treated as ESCAPING (a witness), never as safe; a TS doc we cannot READ/PARSE makes every symbol it
//     references ESCAPING. The shipped engine treats an un-locatable node as SAFE (it costs recall to be
//     sound the other way); here we cannot afford that, so the null-node case is added ON TOP of the engine.
//   · Symbols NOT in the returned map are non-escaping ⇒ `[]` — an honest "scanned, found every reference of
//     X in a safe position (or X has no reference at all)".

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { deserializeSCIP } from "@c4312/scip"
import { canonicalizeSymbol, isLocalSymbol } from "@atlas/index"
import { astWarmed, isTsPath, parseTsDoc } from "../ast.js"
import { decodeScipCached } from "../scip.js"
import { tsEscapeClassifier } from "./classifier.js"

/** The SCIP `symbolRoles` bit for a DEFINITION occurrence (`@c4312/scip` `SymbolRole.Definition`, mirrored
 *  as the literal the probe uses so this module reads raw occurrences the same way). */
const DEF_ROLE = 1

/** The ONE indexer whose symbol scheme `canonicalizeSymbol` (the dist→src `.d.ts` regex, #189) is proven on,
 *  and whose escape⋈oracle agreement was measured ~0-unsound. ADR-0016 item 2 gates enablement per indexer:
 *  on any OTHER indexer a cross-package escaping ref may not canonicalize onto its source symbol ⇒ a false
 *  non-escape ⇒ a false-admit. So the leg is built ONLY for this indexer; otherwise `undefined` (fallback). */
const SUPPORTED_INDEXER = "scip-typescript"

/** The descriptor NAME a SCIP symbol ends in — the single trailing top-level descriptor's identifier, or
 *  `undefined` for a compound/anonymous symbol. Ported from `escape-ts-oracle-agree.mjs` `scipName`. Used ONLY
 *  as a STALE-RANGE guard: the tree-sitter node a (possibly stale) SCIP range resolves to must carry this exact
 *  text, else the range no longer points at the reference and the classify verdict is meaningless. */
function scipName(symbol: string): string | undefined {
  const m = symbol.match(/^scip-typescript npm (\S+) (\S+) (.+)$/)
  if (m === null) return undefined
  const seg = m[3]!.replace(/`/g, "").split("/")
  const i = seg.findIndex((s) => /\.tsx?$/.test(s))
  if (i === -1 || i + 1 >= seg.length) return undefined
  const after = seg.slice(i + 1)
  if (after.length !== 1) return undefined
  const name = after[0]!.replace(/\(\)\.?$/, "").replace(/[#.]$/, "")
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : undefined
}

export interface TargetEscapesConfig {
  /** Absolute path to the `.atlas/index.scip` dump (RAW occurrences with ranges are read from it here). */
  readonly scipPath: string
  /** Repo root — each SCIP doc's source is read at `join(repoPath, doc.relativePath)` to be parsed. */
  readonly repoPath: string
}

/** Read the raw SCIP index at `scipPath`, or `undefined` when it is missing / not a regular file / corrupt —
 *  the SAME degrade `readScipOrEmpty` applies, but keeping the RANGES the frozen reader throws away.
 *
 *  DEDUP-COMPOSITION (#241): rides `scip.ts`'s `decodeScipCached` — the SAME memoized (path, mtime, size)
 *  decode `readScip`/`readScipIndexerName` share — instead of its own independent `deserializeSCIP` call.
 *  This leg used to be a THIRD full decode of the same dump every `composeRuntime`/`assembleHandler` pass
 *  (measured ~2.8s on this repo's dump, the largest single phase); the device-symlink `.isFile()` guard and
 *  the missing/corrupt degrade are unchanged — `decodeScipCached` throws in exactly the same three cases
 *  this function used to catch. */
function readRawScip(scipPath: string): ReturnType<typeof deserializeSCIP> | undefined {
  try {
    return decodeScipCached(scipPath)
  } catch {
    return undefined
  }
}

/** Append `site` to `witnesses[symbol]`, creating the bucket on first use. */
function witness(map: Map<string, string[]>, symbol: string, site: string): void {
  const bucket = map.get(symbol)
  if (bucket === undefined) map.set(symbol, [site])
  else bucket.push(site)
}

/**
 * Build the `targetEscapes` leg, or `undefined` when it cannot be constructed SOUNDLY (AST grammars not warmed,
 * or the SCIP dump is absent/unreadable). `undefined` ⇒ the caller wires NEITHER v2 leg and the door falls back
 * to the sound `holeSources() ∩ S` blanket — never a silent unsound empty map.
 */
export function buildTargetEscapes(config: TargetEscapesConfig): ((target: string) => readonly string[]) | undefined {
  if (!astWarmed()) return undefined // an un-warmed process parses nothing ⇒ an unsound empty map — degrade.
  const idx = readRawScip(config.scipPath)
  if (idx === undefined) return undefined // no index ⇒ no escape data (the door's phantom guard abstains anyway).
  // ADR-0016 item 2 — enable ONLY for the indexer `canonicalizeSymbol` is proven on. A different indexer ⇒
  // `undefined` ⇒ NEITHER v2 leg wired ⇒ the door falls back to the sound blanket (never a false non-escape
  // from an un-canonicalizable cross-package ref). This is the per-indexer canon-completeness gate, mechanized.
  if (idx.metadata?.toolInfo?.name !== SUPPORTED_INDEXER) return undefined

  const witnesses = new Map<string, string[]>() // canonical escaping symbol → witness sites (relpath:line:col)

  for (const doc of idx.documents) {
    const relp = doc.relativePath
    if (!isTsPath(relp)) continue // a non-TS doc carries no reference to a TS target (different symbol scheme).
    // Reference occurrences of NON-local symbols (a `local ` symbol is document-scoped, out of a global-target
    // negation — mirrors `symbol-reverse.ts`/`deriveEdges`), keyed by their CANONICAL (src-form) symbol.
    const refs = doc.occurrences.filter((o) => (o.symbolRoles & DEF_ROLE) === 0 && !isLocalSymbol(o.symbol))
    if (refs.length === 0) continue

    let content: string | undefined
    try {
      content = readFileSync(join(config.repoPath, relp), "utf8")
    } catch {
      content = undefined
    }
    const parsed = content === undefined ? undefined : parseTsDoc(relp, content)
    if (parsed === undefined) {
      // FAIL-CLOSED: a TS doc we cannot read/parse — every symbol it references is treated as ESCAPING.
      for (const o of refs) witness(witnesses, canonicalizeSymbol(o.symbol), `${relp}:unreadable`)
      continue
    }

    try {
      // The SCIP-range ⋈ tree-sitter join, per occurrence: `descendantForPosition` → `tsEscapeClassifier.isSafe`,
      // the shipped classifier's ONE per-language piece. Driven directly (no generic aggregation wrapper) for
      // two reasons a `Set`-returning aggregate cannot serve: it must yield WITNESS SITES (the durable
      // abstention record needs them), and it must FAIL-CLOSED on an un-locatable node (a null node read as
      // SAFE would cost soundness — which a false-admit gate cannot afford). A symbol lands in `witnesses` iff
      // ANY of its refs is non-safe OR un-locatable.
      for (const o of refs) {
        const sym = canonicalizeSymbol(o.symbol)
        const range = o.range ?? []
        if (range.length < 2) {
          witness(witnesses, sym, `${relp}:norange`) // no position ⇒ cannot classify ⇒ ESCAPING (fail-closed).
          continue
        }
        const node = parsed.root.descendantForPosition({ row: range[0]!, column: range[1]! })
        // STALE-RANGE GUARD (finding #5): the source bytes are read at the CURRENT worktree while the ranges
        // come from `.atlas/index.scip`, which may lag. If the node the range resolves to does NOT carry the
        // reference's own descriptor NAME, the range no longer points at the reference and the classify verdict
        // would be meaningless ⇒ fail-closed ESCAPING. (Skipped when the name is a compound/anonymous symbol
        // `scipName` cannot extract — there the node-null + classifier legs still apply.)
        const expectedName = scipName(o.symbol)
        const staleRange = node !== null && expectedName !== undefined && node.text !== expectedName
        if (node === null || staleRange || !tsEscapeClassifier.isSafe(node)) {
          witness(witnesses, sym, `${relp}:${range[0]! + 1}:${range[1]! + 1}`)
        }
      }
    } finally {
      parsed.dispose()
    }
  }

  return (target: string): readonly string[] => {
    const bucket = witnesses.get(canonicalizeSymbol(target))
    return bucket === undefined ? [] : [...bucket].sort()
  }
}
