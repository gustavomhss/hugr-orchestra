// @atlas/genesis — src/seed.ts  (WP-8.29.GEN · GEN-9 — seed the Awareness sources, never fabricated)
//
// A fresh brownfield move-in has no ratified DEFINE artifact, zero invariants (KNOW-6), an un-ratified T0 —
// so @atlas/memory Awareness (MEM-11) would be BLANK exactly when a worker needs it. Genesis CREATES the
// sources each facet rolls up from: `constitution` from the ratified `T0` manifest, `taste` at
// `CONVENTIONS.md@sha`, plus a `DEFINE` stub `mission` marked UNRATIFIED. A source-less facet renders the
// labeled `UN-SEEDED` sentinel — NEVER fabricated (MEM-11). Co-locates the frozen `MissionStub` / `SeedApi`;
// it REUSES the MEM-11 discipline and consumes the index source-locators via the injected `SeedDeps` seams.

import type { StructRef } from "@atlas/contracts"
import type { Awareness, AwarenessFacet } from "@atlas/memory"
import type { Ratified, Skeleton } from "./types.js"

/**
 * The `DEFINE` stub `mission` (GEN-9). On a brownfield move-in with no ratified DEFINE artifact, genesis
 * assembles an UNRATIFIED thesis stub so Awareness's `mission` facet is not blank. It MUST stay
 * `unratified: true` until a real DEFINE artifact is ratified. GENESIS-HOME.
 *
 * [PINNED — oracle-pin-map §genesis] `content` mirrors the now-frozen @atlas/memory `AwarenessFacet.content:
 * string` (the top-tier rendered line). The exact byte-stable render is a downstream format detail, but the
 * carrier type is settled as `string` by the upstream memory pin.
 */
export interface MissionStub {
  readonly content: string // the DEFINE stub thesis line — mirrors @atlas/memory AwarenessFacet.content
  readonly grounding: readonly StructRef[] // the node@sha the stub anchors to (grounded, GEN-4)
  readonly unratified: true // MUST stay unratified until a real DEFINE artifact exists (GEN-9)
}

export interface SeedApi {
  /** GEN-9 seed the Awareness sources. Assembles the @atlas/memory `Awareness` slab from the seeded
   *  skeleton + the S3-ratified facts: `mission` = the unratified DEFINE stub; `constitution` = the
   *  ratified `T0` manifest; `taste` = `CONVENTIONS.md@sha`. A source-less facet → `UN-SEEDED` (never
   *  fabricated, MEM-11). Reuses the MEM-11 reference; adds no new subsystem. */
  seed(skeleton: Skeleton, ratified: readonly Ratified[]): Awareness

  /** The S0 `DEFINE` stub `mission` on a fresh brownfield move-in (GEN-9) — marked UNRATIFIED. */
  mission(skeleton: Skeleton): MissionStub

  /** One facet's seed from its OWN source — absent source ⇒ the `UN-SEEDED` sentinel (never fabricated,
   *  MEM-11). Mirrors @atlas/memory `AwarenessApi.facet`.
   *
   *  [OPAQUE-BY-DESIGN — oracle-pin-map non-decisions] each facet's source is heterogeneous (DEFINE
   *  artifact / ratified T0 manifest / `CONVENTIONS.md@sha`) with no single frozen type at layer-0 →
   *  `unknown` by design, the WP treats it opaquely. NOT invented into a record. */
  facet(source: unknown): AwarenessFacet
}

/** The labeled `UN-SEEDED` sentinel (MEM-11 / GEN-9b) — the ONLY line an absent source may render. */
export const UN_SEEDED = "UN-SEEDED" as const

/**
 * The `taste` facet source (GEN-9): `CONVENTIONS.md@sha`. Genesis creates this source object from the
 * skeleton (via the injected index seam); an absent one ⇒ the `taste` facet renders `UN-SEEDED`.
 */
export interface ConventionsSource {
  readonly path: string // 'CONVENTIONS.md' (repo-relative)
  readonly anchor: StructRef // the `CONVENTIONS.md@sha` grounding anchor (the drift oracle)
}

/**
 * The injected index seams (card exclusions: "it only creates the sources"). Locating a file source and the
 * repo-root anchor is the index's job — CALLED, never defined here.
 */
export interface SeedDeps {
  /** Locate the `CONVENTIONS.md@sha` taste source in the skeleton — `undefined` when the repo has none. */
  locateConventions(skeleton: Skeleton): ConventionsSource | undefined
  /** The repo-root grounding anchor the mission DEFINE stub is anchored to (grounded, GEN-4). */
  rootAnchor(skeleton: Skeleton): StructRef
}

/** A `seeded` facet grounded to its source anchor(s) (MEM-11). */
function seededFacet(content: string, grounding: readonly StructRef[]): AwarenessFacet {
  return { content, grounding, state: "seeded" }
}

/** The labeled `UN-SEEDED` sentinel facet (GEN-9b/9c) — an absent source, never a fabricated line. */
function unseededFacet(why: string): AwarenessFacet {
  return { content: `${UN_SEEDED}: ${why}`, grounding: [], state: "UN-SEEDED" }
}

/** The `constitution` source (GEN-9): the ratified `T0` manifest. Absent T0 ⇒ `UN-SEEDED`. */
function constitutionFacet(ratified: readonly Ratified[]): AwarenessFacet {
  const t0 = ratified.filter((f) => f.tier === "T0")
  if (t0.length === 0) return unseededFacet("constitution — no ratified T0 manifest yet")
  const grounding = t0.flatMap((f) => f.grounding.entries.map((e) => e.anchor))
  return seededFacet(`constitution: ${t0.length} ratified T0 invariant(s)`, grounding)
}

/** The `taste` source (GEN-9): `CONVENTIONS.md@sha`. Absent ⇒ `UN-SEEDED` (never a fabricated source). */
function tasteFacet(conventions: ConventionsSource | undefined): AwarenessFacet {
  if (conventions === undefined) return unseededFacet("taste — no CONVENTIONS.md in the repo")
  return seededFacet(`taste: ${conventions.path}@sha`, [conventions.anchor])
}

/**
 * GEN-9 — assemble the Awareness slab from the created sources. `constitution` ← the ratified `T0`
 * manifest; `taste` ← `CONVENTIONS.md@sha`; `mission` is UN-SEEDED because its source is a RATIFIED DEFINE
 * artifact and only the unratified stub exists (never fabricated from the stub, GEN-9b/9c). `terrain` /
 * `ontology` have no genesis-created source (EPIC-24-a / other) ⇒ `UN-SEEDED`. Never fabricates a facet.
 */
export function seedAwareness(skeleton: Skeleton, ratified: readonly Ratified[], deps: SeedDeps): Awareness {
  return {
    mission: unseededFacet("mission — no ratified DEFINE artifact (stub is unratified)"),
    constitution: constitutionFacet(ratified),
    terrain: unseededFacet("terrain — no genesis-seeded territory rollup"),
    ontology: unseededFacet("ontology — no genesis-seeded definition source"),
    taste: tasteFacet(deps.locateConventions(skeleton)),
  }
}

/**
 * GEN-9 — the S0 `DEFINE` stub `mission`, marked UNRATIFIED. Assembled so a downstream reader knows a stub
 * exists; it MUST stay `unratified: true` until a real DEFINE artifact is ratified. Grounded to the repo
 * root (GEN-4). It carries NO `ratified` field — it never presents as ratified.
 */
export function missionStub(skeleton: Skeleton, deps: SeedDeps): MissionStub {
  return {
    content: "mission (DEFINE stub — pending a ratified DEFINE artifact)",
    grounding: [deps.rootAnchor(skeleton)],
    unratified: true,
  }
}

/**
 * GEN-9 — one facet's rollup from ITS OWN opaque source (mirrors @atlas/memory `AwarenessApi.facet`). An
 * absent / unrecognized source ⇒ the `UN-SEEDED` sentinel (never fabricated). A `ConventionsSource` ⇒ the
 * grounded `taste` line.
 */
export function facetOf(source: unknown): AwarenessFacet {
  if (isConventions(source)) return tasteFacet(source)
  return unseededFacet("source absent — no self-model line fabricated")
}

/** Structural guard for a `ConventionsSource` opaque input (no hashing, no fabrication). */
function isConventions(source: unknown): source is ConventionsSource {
  return (
    source !== null &&
    typeof source === "object" &&
    "path" in source &&
    "anchor" in source &&
    typeof (source as { path: unknown }).path === "string"
  )
}

/**
 * Bind the seeding surface to the frozen `SeedApi` (above) with the injected index seams captured in
 * the closure: `seed(skeleton, ratified)` assembles Awareness; `mission(skeleton)` the unratified stub;
 * `facet(source)` one opaque facet rollup. The signatures are EXACTLY the frozen surface.
 */
export function makeSeed(deps: SeedDeps): SeedApi {
  return {
    seed: (skeleton: Skeleton, ratified: readonly Ratified[]): Awareness => seedAwareness(skeleton, ratified, deps),
    mission: (skeleton: Skeleton): MissionStub => missionStub(skeleton, deps),
    facet: (source: unknown): AwarenessFacet => facetOf(source),
  }
}

// differential-vs-oracle (compile-time): `makeSeed` conforms to the frozen SeedApi surface.
const _seed: (deps: SeedDeps) => SeedApi = makeSeed
void _seed
