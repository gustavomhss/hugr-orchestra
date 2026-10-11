// @atlas/memory — src/awareness.ts  (WP-6.24-a.MEM · MEM-11 + MEM-12a/b)
//
// MEM-11 (Awareness is a derived rollup, not a blob) + the MEM-12a/b memoization slice. The injected
// Awareness (mission / constitution / terrain / ontology / taste) is a PURE derivation of the Atlas root:
// each facet is GROUNDED (`node@sha`) + drift-checked, carries only the TOP tier under `≤ ~400 tok`, is
// BYTE-IDENTICAL across members, and an ABSENT source renders a labeled `UN-SEEDED` sentinel (never
// fabricated). Assembly is memoized per-facet on the source's own subtree hash so a root bump that moved
// nothing costs 0 re-rolls / 0 drift-checks (instrumented counter, NOT timing). SEAM (sealed @atlas/kernel,
// KERNEL-1): identity + byte-identical serialization go through `id` / `canonicalForm` ALONE.

import { id, canonicalForm, asNodeKey } from "@atlas/kernel"
import type { Node, Event } from "@atlas/kernel"
import type { Hash, StructRef } from "@atlas/contracts"
import type {
  Awareness,
  AwarenessApi,
  AwarenessFacet,
  Memoized,
  AssemblyReceipt,
  MemoizeApi,
  MemberId,
} from "./types.js"

// ── the five facets + the root-source model ───────────────────────────────────────────────────────────────

/** The five Awareness facets (atlas-memory:39-45), in a fixed deterministic order (byte-stable). */
export type FacetName = "mission" | "constitution" | "terrain" | "ontology" | "taste"
export const FACET_ORDER: readonly FacetName[] = ["mission", "constitution", "terrain", "ontology", "taste"]

/** `~400 tok` Awareness cap (MEM-11, ratified pinned bound). Enforced fail-closed on assembly. */
export const AWARENESS_TOK_CAP = 400

/** The `UN-SEEDED` sentinel label (MEM-11) — the ONLY line an absent source may render. */
export const UN_SEEDED = "UN-SEEDED"

/**
 * One walt-curated ontology candidate node. Only `slot === 'definition'` nodes curated by the DEFINE
 * persona (walt) source the `ontology` facet (MEM-11d); a member's non-definition fact is filtered out.
 */
export interface DefinitionNode {
  readonly slot: string // 'definition' | other
  readonly curatedBy: string // 'walt' (DEFINE persona)
  readonly text: string
}

/**
 * A present facet source in the Atlas root. `tiers` are ordered TOP-FIRST — only `tiers[0]` is injected,
 * the tail stays pull-reachable (`pullTail`). `grounding` is the `node@sha` anchor set (the drift oracle).
 * `ontology` carries `definitions` instead of `tiers`.
 */
export interface FacetEntry {
  readonly facet: FacetName
  readonly grounding: readonly StructRef[]
  readonly tiers?: readonly string[]
  readonly definitions?: readonly DefinitionNode[]
}

/** A facet source as supplied to `atlasRoot` (the `facet` discriminant is added by the builder). */
export type FacetInput = Omit<FacetEntry, "facet">

/** The root's per-facet sources. An ABSENT facet (omitted) renders `UN-SEEDED` (never fabricated). */
export interface RootFacets {
  readonly mission?: FacetInput
  readonly constitution?: FacetInput
  readonly terrain?: FacetInput
  readonly ontology?: FacetInput
  readonly taste?: FacetInput
}

// ── root construction (the Atlas root as a sealed-kernel content-addressed Node) ────────────────────────────

/** Wrap a payload as a content-keyed kernel `Event`; identity is the SEALED kernel `id` seam (KERNEL-1). */
function mkEvent(payload: unknown): Event {
  const contentHash: Hash = id(payload)
  return { id: contentHash, seq: 0, contentHash, fresh: true, supersedes: [], payload }
}

/**
 * Build the Atlas root as a kernel `Node` carrying the five facet sources as content-addressed entries.
 * `opts.bump` injects an unrelated marker entry — it moves the root identity (`rId‖rState` bumps) WITHOUT
 * moving any facet source, the exact MEM-12a condition (a root bump that missed nothing). Deterministic.
 */
export function atlasRoot(facets: RootFacets, opts?: { readonly bump?: string }): Node {
  const entries = new Map<Hash, Event>()
  for (const name of FACET_ORDER) {
    const input = facets[name]
    if (input === undefined) continue
    const payload: FacetEntry = { facet: name, ...input }
    entries.set(id(payload), mkEvent(payload))
  }
  if (opts?.bump !== undefined) {
    const marker = { marker: opts.bump }
    entries.set(id(marker), mkEvent(marker))
  }
  return { nodeKey: asNodeKey("atlas@root"), entries }
}

/** Read the five facet sources back out of a root `Node` (marker entries are ignored). */
function facetsOf(root: Node): Partial<Record<FacetName, FacetEntry>> {
  const out: Partial<Record<FacetName, FacetEntry>> = {}
  for (const ev of root.entries.values()) {
    const p = ev.payload as Partial<FacetEntry> | null
    if (p !== null && typeof p === "object" && typeof p.facet === "string") {
      out[p.facet] = p as FacetEntry
    }
  }
  return out
}

// ── per-facet rollup (top tier only, grounded, UN-SEEDED on absence) ─────────────────────────────────────────

/** The top (injected) tier of a facet — the first tier, or the first walt-curated definition for ontology. */
function topTier(name: FacetName, entry: FacetEntry): string | undefined {
  if (name === "ontology") {
    return definitions(entry)[0]?.text
  }
  return (entry.tiers ?? [])[0]
}

/** The walt-curated `slot='definition'` nodes only — a member's non-definition fact is filtered out. */
function definitions(entry: FacetEntry): readonly DefinitionNode[] {
  return (entry.definitions ?? []).filter((d) => d.slot === "definition" && d.curatedBy === "walt")
}

/** The labeled `UN-SEEDED` sentinel facet (MEM-11e/11i) — an absent source, never a fabricated line. */
function unseeded(name: FacetName): AwarenessFacet {
  return {
    content: `${UN_SEEDED} (${name}): source absent — no self-model line fabricated`,
    grounding: [],
    state: "UN-SEEDED",
  }
}

/**
 * Roll one facet up from ITS OWN source. Absent (or a present source with no derivable top tier) ⇒
 * `UN-SEEDED`. A present source ⇒ the top-tier rollup grounded to its `node@sha`; `moved` (its source
 * subtree hash changed vs the cache) ⇒ served `drifted` (flagged, re-grounded), never silently stale.
 */
function rollFacet(name: FacetName, entry: FacetEntry | undefined, moved: boolean): AwarenessFacet {
  if (entry === undefined) return unseeded(name)
  const top = topTier(name, entry)
  if (top === undefined) return unseeded(name)
  return { content: top, grounding: entry.grounding, state: moved ? "drifted" : "seeded" }
}

/** The truncated tail beyond the injected top tier — kept PULL-REACHABLE (MEM-11h), never dropped. */
export function pullTail(root: Node, name: FacetName): readonly string[] {
  const entry = facetsOf(root)[name]
  if (entry === undefined) return []
  if (name === "ontology")
    return definitions(entry)
      .slice(1)
      .map((d) => d.text)
  return (entry.tiers ?? []).slice(1)
}

// ── the whole-slab rollup + cap ──────────────────────────────────────────────────────────────────────────

/** Word-count token proxy (whitespace-delimited) summed over the five facet contents. */
function tok(s: string): number {
  const t = s.trim()
  return t === "" ? 0 : t.split(/\s+/).length
}

/** The injected Awareness's token size — the sum over the five facets (MEM-11c cap check). */
export function awarenessTokens(a: Awareness): number {
  return FACET_ORDER.reduce((n, name) => n + tok(a[name].content), 0)
}

/** Fail-closed cap guard (MEM-11c) — Awareness over `~400 tok` is rejected, never injected over-cap. */
function guardCap(a: Awareness): void {
  const n = awarenessTokens(a)
  if (n > AWARENESS_TOK_CAP) {
    throw new Error(`Awareness cap exceeded: ${n} tok > ${AWARENESS_TOK_CAP} (top-tier truncation failed)`)
  }
}

function assembleFacets(
  facets: Partial<Record<FacetName, FacetEntry>>,
  movedOf: (name: FacetName) => boolean,
): Awareness {
  const out = {} as Record<FacetName, AwarenessFacet>
  for (const name of FACET_ORDER) out[name] = rollFacet(name, facets[name], movedOf(name))
  return out as Awareness
}

/**
 * Assemble Awareness as a PURE rollup of the Atlas root (MEM-11) — a deterministic function of the root
 * ALONE (no seat input), so it is byte-identical across seats and re-runs; top tier only, under the
 * `≤ ~400 tok` cap; absent sources render `UN-SEEDED`. (`rollup`.)
 */
export function rollup(root: Node): Awareness {
  const a = assembleFacets(facetsOf(root), () => false)
  guardCap(a)
  return a
}

/** The byte-identical injection form (MEM-11g) — via the SEALED kernel `canonicalForm` seam, no raw bytes. */
export function awarenessBytes(a: Awareness): Uint8Array {
  return canonicalForm(a)
}

/** A single facet's rollup from its OWN opaque source (`facet`); absent ⇒ `UN-SEEDED`. */
export function facetOf(source: unknown): AwarenessFacet {
  if (source !== null && typeof source === "object" && "facet" in source) {
    const e = source as FacetEntry
    return rollFacet(e.facet, e, false)
  }
  return { content: `${UN_SEEDED}: source absent — no self-model line fabricated`, grounding: [], state: "UN-SEEDED" }
}

// ── MEM-12a/b: memoized assembly (per-facet source-hash cache; once per root-state, shared) ─────────────────

/** A wave's single shared assembly (MEM-12b) — `assemblies` counts the REAL assemble calls (1 per wave). */
export interface WaveAssembly {
  readonly awareness: Awareness
  readonly receipt: AssemblyReceipt
  readonly assemblies: number
  readonly seats: readonly MemberId[]
}

/** The memoized Awareness assembler (MEM-12). Holds a per-facet cache keyed on the facet's OWN source hash. */
export interface AwarenessMemo {
  /** Assemble once per root-state; 0 re-rolls / 0 drift-checks when no facet source moved (MEM-12a). */
  assemble(root: Node): Memoized<Awareness>
  /** One shared assembly for the whole wave — never re-rolled per seat (MEM-12b). */
  assembleForWave(seats: readonly MemberId[], root: Node): WaveAssembly
}

/** The cache key for a facet source's subtree hash — its OWN `node@sha`, NOT the root `rId‖rState`. */
function sourceKey(entry: FacetEntry | undefined): string {
  if (entry === undefined) return "ABSENT"
  const anchor = entry.grounding[0]
  return anchor !== undefined ? anchor.subtreeHash : id(entry)
}

/**
 * Build a memoized Awareness assembler (MEM-12a/b). Each facet is cached keyed on ITS OWN source subtree
 * hash: a root bump that moved no facet is 5 cache hits ⇒ `reRolls = 0`, `driftChecks = 0` (a facet
 * re-rolls, and is drift-checked, ONLY when its own source moved — and a moved-with-prior facet is served
 * `drifted`). `assembleForWave` calls `assemble` ONCE for the whole wave (byte-identical by MEM-11), so the
 * measured `assemblies` counter is 1, never one-per-seat.
 */
export function makeAwarenessMemo(): AwarenessMemo {
  const cache = new Map<FacetName, { readonly key: string; readonly facet: AwarenessFacet }>()
  let assembleCount = 0

  function assemble(root: Node): Memoized<Awareness> {
    assembleCount++
    const facets = facetsOf(root)
    let reRolls = 0
    let driftChecks = 0
    const out = {} as Record<FacetName, AwarenessFacet>
    for (const name of FACET_ORDER) {
      const entry = facets[name]
      const key = sourceKey(entry)
      const hit = cache.get(name)
      if (hit !== undefined && hit.key === key) {
        out[name] = hit.facet // cache hit: no re-roll, no per-node@sha drift-check
        continue
      }
      driftChecks++ // the source subtree hash was compared (a drift-check ran)
      reRolls++ // and the facet re-rolled
      const moved = hit !== undefined // a prior, DIFFERENT hash ⇒ the source moved ⇒ served drifted
      const facet = rollFacet(name, entry, moved)
      cache.set(name, { key, facet })
      out[name] = facet
    }
    const value = out as Awareness
    guardCap(value)
    return { value, receipt: { key: id(value), reRolls, driftChecks } }
  }

  function assembleForWave(seats: readonly MemberId[], root: Node): WaveAssembly {
    const before = assembleCount
    const { value, receipt } = assemble(root) // ONE assembly, shared across every seat
    return { awareness: value, receipt, assemblies: assembleCount - before, seats }
  }

  return { assemble, assembleForWave }
}

// ── frozen-oracle conformance (compile-time differential-vs-oracle) ────────────────────────────────────────

/** Bind the built surface to the FROZEN `AwarenessApi` (`rollup` + `facet`). */
export function makeAwarenessApi(): AwarenessApi {
  return { rollup, facet: facetOf }
}

const _apiCheck: () => AwarenessApi = makeAwarenessApi
void _apiCheck

// The memo conforms to the `assembleAwareness` slice of the FROZEN `MemoizeApi`
// (foldOrientation is the sibling WP-6.24-b facet, NOT implemented here).
type MemoizeAwarenessSlice = Pick<MemoizeApi, "assembleAwareness">
const _memoCheck: (m: AwarenessMemo) => MemoizeAwarenessSlice = (m) => ({
  assembleAwareness: (root: Node): Memoized<Awareness> => m.assemble(root),
})
void _memoCheck
