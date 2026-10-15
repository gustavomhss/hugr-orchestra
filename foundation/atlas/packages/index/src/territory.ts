// @atlas/index — src/territory.ts  (WP-2.9-a.INDEX — territory-assignment facet, INDEX-14)
//
// `assign(path, manifest)` resolves a path to EXACTLY one owner+tier from the hashed manifest by longest
// literal path-match then declaration order — deterministic, byte-identical, `$0`-LLM (pure glob, no model
// call). A no-glob path is an `uncovered` VERDICT (never a silent owner), defaulting to `deny` when
// T0-adjacent; the frozen `TerritoryAssignment = {owner, tier}` is WIDENED here to the `Assignment` union.

import type { Tier } from "@atlas/contracts"
import type { Manifest } from "./types.js"

/**
 * The single owner+tier a path resolves to (atlas-index:77-78; the `assign` return, method-tags-idx:115).
 *   - `owner` — the resolved territory owner. Reference type is `seat` (a nominal seat id); the ratified
 *     contracts membership carries it as `string` (see @atlas/contracts `Territory` FLAG) — so `string`.
 *   - `tier`  — the criticality tier (human-ratified, `Tier` from contracts).
 *
 * [FLAG — `uncovered`/deny verdict not modeled in this minimal return] atlas-index:92-94 requires a
 * no-glob path to resolve to an `uncovered` verdict (T0-adjacent ⇒ default deny), NOT an owner+tier.
 * The task's frozen surface is `assign(...): { owner, tier }`, so the `uncovered`/deny verdict is NOT
 * added to this shape — the impl below WIDENS it to `Assignment` per this flag.
 */
export interface TerritoryAssignment {
  readonly owner: string
  readonly tier: Tier
}

export interface TerritoryApi {
  /** Assign a path to its single owner+tier from the hashed manifest; longest-path-match then
   *  declaration-order tiebreak; deterministic, `$0`-LLM (INDEX-14). (atlas-index:77-78;
   *  method-tags-idx:115) */
  assign(path: string, manifest: Manifest): TerritoryAssignment
}

/** An uncovered path's default access verdict: `deny` when T0-adjacent, else `open` (INDEX-14e). */
export type Verdict = "deny" | "open"

/** The widened `assign` result (ref FLAG: widen the {owner,tier} return to carry the uncovered verdict). */
export type Assignment =
  | { readonly kind: "assigned"; readonly owner: string; readonly tier: Tier }
  | { readonly kind: "uncovered"; readonly verdict: Verdict }

// Assignment is pure glob matching + declaration order — it NEVER consults a model (INDEX-14f). This
// counter is the SCN-INDEX-14f-1 witness: statically 0 (there is no model call site on the assign path).
const ASSIGN_MODEL_CALLS = 0
export const assignModelCalls = (): number => ASSIGN_MODEL_CALLS

const firstStar = (glob: string): number => {
  const i = glob.indexOf("*")
  return i === -1 ? glob.length : i
}

/** The length of a glob's literal (wildcard-free) prefix — the specificity metric for longest-path-match. */
export const globLiteralPrefixLen = (glob: string): number => firstStar(glob)

const RE_SPECIAL = "\\^$.|?*+()[]{}"
const escapeRe = (c: string): string => (RE_SPECIAL.includes(c) ? `\\${c}` : c)

const globToRegExp = (glob: string): RegExp => {
  let re = ""
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*"
        i++
      } else {
        re += "[^/]*"
      }
    } else {
      re += escapeRe(c)
    }
  }
  return new RegExp(`^${re}$`)
}

/** Does `path` match `glob`? `**` spans path separators, `*` a single segment. */
export const pathMatchesGlob = (path: string, glob: string): boolean => globToRegExp(glob).test(path)

const dirname = (p: string): string => {
  const i = p.lastIndexOf("/")
  return i === -1 ? "" : p.slice(0, i)
}

/** The governance zone (region/parent) a glob roots — the T0-adjacency unit (atlas-index:70-72, 92-94). */
export const globZone = (glob: string): string => {
  const lp = glob.slice(0, firstStar(glob))
  return lp.endsWith("/") ? lp.slice(0, -1) : dirname(lp)
}

const isT0Adjacent = (path: string, manifest: Manifest): boolean => {
  const dir = dirname(path)
  return manifest.territories.some(
    (t) =>
      t.tier === "T0" &&
      t.globs.some((g) => {
        const z = globZone(g)
        return dir === z || (z !== "" && dir.startsWith(`${z}/`))
      }),
  )
}

/**
 * Assign a path to its single owner+tier from the hashed manifest (INDEX-14). Overlap: longest literal
 * path-match wins; manifest declaration order is the sole tiebreak (earliest wins). No glob → `uncovered`
 * (T0-adjacent ⇒ `deny`). Deterministic, byte-identical across rebuilds, `$0`-LLM.
 */
export function assign(path: string, manifest: Manifest): Assignment {
  let best: { owner: string; tier: Tier; prefix: number; decl: number } | null = null
  let decl = 0
  for (const t of manifest.territories) {
    for (const glob of t.globs) {
      const d = decl++
      if (!pathMatchesGlob(path, glob)) continue
      const prefix = globLiteralPrefixLen(glob)
      if (best === null || prefix > best.prefix || (prefix === best.prefix && d < best.decl)) {
        best = { owner: t.owner, tier: t.tier, prefix, decl: d }
      }
    }
  }
  if (best !== null) return { kind: "assigned", owner: best.owner, tier: best.tier }
  return { kind: "uncovered", verdict: isT0Adjacent(path, manifest) ? "deny" : "open" }
}
