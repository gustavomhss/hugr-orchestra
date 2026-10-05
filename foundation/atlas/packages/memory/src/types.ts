// @atlas/memory — src/types.ts  (frozen data model + co-located slab interfaces; zero runtime)
//
// Layer 6 Memory-kind shared model: the four templated entry types + the store envelope, plus the
// co-located Awareness / Orientation / Memoize slab interfaces (each consumed by ≥2 src files, so housed
// here beside the shared model rather than in one impl). Memory shares the ONE Atlas with Knowledge but is
// a DISTINCT kind, never conflated (MEM-2). The injection vocabulary (Pack/PackInvariant/InjectionKind/
// Budget) is @atlas/contracts-owned — re-exported here, NEVER redefined. [LEAD-RATIFIED] memory→retrieval
// is the ALLOWED edge (the RET⟷MEM cycle is broken by memory importing retrieval, NOT the reverse).

import type { StructRef, Hash } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { EventLog, Node } from "@atlas/kernel"

// Re-export the contracts-owned injection vocabulary so consumers can pull the whole dialect from the
// bare package root. Owned by @atlas/contracts — re-exported, NOT redefined.
export type { InjectionKind, Budget, Pack, PackInvariant } from "@atlas/contracts"

/**
 * A member identity — a seat (`charlie` / `lucy` / `jimmy` / …) OR the orchestrator. Every member owns
 * its own private, decaying Memory (atlas-memory:7-11). [PINNED —no member-id brand frozen] The
 * reference names members by seat-string; no contracts brand exists, so transcribed as `string`, NOT
 * invented as a new brand. Flagged for a `MemberId` brand to be sourced if one is ratified.
 */
export type MemberId = string

/**
 * The four Memory types (atlas-memory:17-25). The load-bearing axis is HOW each is accessed:
 * `project` is INJECTED (never queried); `task` / `pr` / `logbook` are CONSULTABLE (never auto-injected —
 * MEM-4). `logbook` is orchestrator-only (v0). This is the per-ENTRY discriminant; the store-partition
 * discriminant (Memory vs Knowledge, MEM-2) is `AtlasKind` in kinds.ts — a distinct axis.
 */
export type MemoryKind = "task" | "pr" | "project" | "logbook"

/**
 * A grounding / provenance pointer (atlas-memory:76, 104; spec/memory:104). The reference names this
 * `Ref` — "a path@subtreeHash / PR / commit pointer".
 *
 * [PINNED —`Ref` not frozen as a concrete type in contracts] @atlas/contracts freezes only `StructRef`
 * (the `path@subtreeHash` grounding-anchor leg). The PR / commit / ADR-URL leg has no frozen shape, so it
 * is transcribed as the underlying `string` (the same discipline retrieval applied to `Path = string`).
 * `Ref` is thus the honest superset: a structured grounding anchor OR a bare pointer string. NOT invented
 * as a new exported brand; flagged for a `Ref` type to be sourced if one is ratified.
 */
export type Ref = StructRef | string

/**
 * `project` memory — the STRICTEST template because it is INJECTED on every turn (atlas-memory:72-80,
 * spec/memory:101-106). Transcribed EXACTLY from atlas-memory:72-80.
 *   - `rule`      — ONE imperative line ("always X" / "never Y"). No narrative.
 *   - `scope`     — when it applies (path glob / tool / phase) — makes it role-relevant.
 *   - `grounding` — OPTIONAL pointer that earns the rule its place.
 *   - `frecency`  — the ranking key: a single TIME-DECAYED score of logged CITED hits (MEM-7).
 *
 * [FLAG — `frecency` supersedes the spec's `hits`] The canonical reference (atlas-memory:76-79, MEM-7)
 * stores `frecency: number` (one decayed score), REPLACING the older spec/memory:105 `hits: number` +
 * separate window. Transcribed as `frecency` per the drift-checked canonical reference.
 */
export interface ProjectMemoryEntry {
  readonly rule: string
  readonly scope: string
  readonly grounding?: Ref // OPTIONAL pointer (path@subtreeHash / PR / commit) — earns the rule its place
  readonly frecency: number // [FLAG] one time-decayed cited-hit score (MEM-7), supersedes spec `hits`
}

/**
 * `task` memory — richer, consultable (atlas-memory:87, spec/memory:119). Transcribed EXACTLY:
 *   `TaskMemoryEntry = { taskId, attempted[], failedWith[], stoppedAt, lesson, ref? }`.
 * The `{ attempted, failedWith, stoppedAt, lesson }` subset is the CLOSING FOLD auto-recalled at re-spawn
 * (MEM-13, see respawn.ts).
 *
 * [PINNED —element types] The reference lists `attempted[]` / `failedWith[]` as arrays with no element
 * type; transcribed as `readonly string[]` (structured terse lines under the per-entry char cap), NOT a
 * concrete record. `taskId` / `stoppedAt` / `lesson` transcribed as `string`.
 */
export interface TaskMemoryEntry {
  readonly taskId: string
  readonly attempted: readonly string[] // [PINNED] element type not frozen — terse lines
  readonly failedWith: readonly string[] // [PINNED] element type not frozen — terse lines
  readonly stoppedAt: string
  readonly lesson: string
  readonly ref?: Ref
}

/**
 * `pr` memory — richer, consultable (atlas-memory:88, spec/memory:120). Transcribed EXACTLY:
 *   `PrMemoryEntry = { prId, decisions[], reviewOutcomes[], knowledgeDelta[], ref? }`.
 *
 * [FLAG — `knowledgeDelta` typed to knowledge `GroundedFact`] The reference leaves `knowledgeDelta[]`
 * untyped ("the knowledge-delta it produced", atlas-memory:20). That delta IS the shared-Knowledge change
 * the PR produced — knowledge facts — so it is transcribed as `readonly GroundedFact[]` per the declared
 * @atlas/knowledge seam (same discipline retrieval used for `gotchas`). Flagged for the reference to
 * freeze the field type.
 *
 * [PINNED —`decisions` / `reviewOutcomes` element types] no element type frozen → `readonly string[]`.
 */
export interface PrMemoryEntry {
  readonly prId: string
  readonly decisions: readonly string[] // [PINNED] element type not frozen — terse lines
  readonly reviewOutcomes: readonly string[] // [PINNED] element type not frozen — terse lines
  readonly knowledgeDelta: readonly GroundedFact[] // [FLAG] the Knowledge delta — knowledge facts
  readonly ref?: Ref
}

/**
 * `logbook` — the orchestrator's decision journal (atlas-memory:96-104, spec/memory:133-143). Transcribed
 * EXACTLY. Fixed index fields + one prose block per FIXED section (never a free-form dump — MEM-5/8).
 * Consultable, never injected; append-only; a later entry supersedes by LINK, never by rewriting history.
 *
 * [PINNED —`at` type] the timestamp/ordering key has no frozen type; transcribed as `string` (an
 * ISO/label), NOT a wall-clock brand (MEM-7/frecency decay is ledger-driven, not wall-clock).
 * The five prose sections are `string` (prose confined WITHIN its fixed section — MEM-8).
 */
export interface LogbookEntry {
  readonly prId: string
  readonly at: string // [PINNED] ordering/timestamp key — no frozen type
  readonly territories: readonly string[] // structured index field — keeps it navigable
  readonly shipped: string // prose within section
  readonly decisions: string // prose within section — the key decisions AND WHY (the core)
  readonly tradeoffs: string // prose within section
  readonly risks: string // prose within section
  readonly openThreads: string // prose within section
  readonly links: readonly Ref[] // PR, ratified facts, ADRs, superseded prior entries
}

/** The templated-write union — every Memory write fills exactly one of these (MEM-5). */
export type MemoryEntry = ProjectMemoryEntry | TaskMemoryEntry | PrMemoryEntry | LogbookEntry

/**
 * The owner-tagged store envelope over the ONE Atlas store. `owner` is the frozen scoping key MEM-1's
 * `injectFor` filters on; `kind` is the MEM-2 partition discriminant; `entry` is the templated payload.
 *
 * [PINNED —full envelope not frozen] The reference gives no concrete store record beyond the
 * owner-scoped, kind-partitioned entry (Memory is a git-native projection over the CAS/log — MEM-9/10).
 * Additional legs (archived flag, version pointer) ride the versioned record, not frozen here → the
 * envelope carries only the three grounded fields; extra state is NOT invented.
 */
export interface MemoryRecord {
  readonly owner: MemberId // MEM-1 scoping key — `injectFor` filters by owner
  readonly kind: MemoryKind // MEM-2 discriminant
  readonly entry: MemoryEntry
}

/** The member's Memory as a flat owner-scoped collection over the single store (MEM-9/10 git-native). */
export type MemoryStore = readonly MemoryRecord[]

// ── co-located slab interfaces (was ref/orient.ts · ref/awareness.ts · ref/memoize.ts) ────────────────────
// These carry zero runtime; they live with the shared model because each is consumed by ≥2 src files:
// Orientation by orient.ts + inject.ts, Awareness by awareness.ts + inject.ts, MemoizeApi/Memoized by
// awareness.ts + orient.ts. Housing them here keeps the impl files free of impl→impl type imports.

/**
 * The Orientation slab (MEM-6, atlas-memory:50-53). `{ goal, last, current, state }`, each `≤ 1 line` —
 * "where the project is NOW": DERIVED + SHARED, never a written memory (so it can never rot), byte-
 * identical across ALL members, `≤ ~250 tok`. `goal` is assembled from the ratified DEFINE artifact;
 * `last/current/state` are a FOLD over the event log (reuses KERNEL-5 `fold.ts`).
 */
export interface Orientation {
  readonly goal: string // from the ratified DEFINE artifact
  readonly last: string // fold over the event log
  readonly current: string // fold over the event log
  readonly state: string // fold over the event log
}

export interface OrientApi {
  /** Assemble Orientation as a PURE function of (DEFINE artifact, event log): `goal` from DEFINE,
   *  `last/current/state` as a fold over the log — no per-seat input, so byte-identical across members and
   *  never stale (MEM-6). Reuses KERNEL-5 `fold.ts`. (method-tags-mem:60)
   *
   *  [OPAQUE-BY-DESIGN — `define` type] the ratified DEFINE artifact has no frozen type at this layer (it is a
   *  genesis GEN-9 artifact); transcribed as `unknown` rather than invented/imported. Flagged. */
  orient(define: unknown, log: EventLog): Orientation
}

/**
 * A facet's derivation state (MEM-11). `seeded` = derived from a present, drift-clean source; `UN-SEEDED`
 * = source absent → the labeled sentinel (never fabricated); `drifted` = source moved → the facet is
 * SERVE-FLAGGED (flagged, not served stale).
 */
export type FacetState = "seeded" | "UN-SEEDED" | "drifted"

/**
 * One Awareness facet — a top-tier rollup grounded to its Atlas source(s) (MEM-11).
 *
 * [PINNED — rendered `content` format not frozen] transcribed as `string` (the top-tier derived line
 * under cap); the exact byte-stable render is a WP concern, NOT invented.
 * `grounding` is the `node@sha` anchor set the facet rolls up from — transcribed as the frozen
 * `StructRef` grounding anchor (`path@subtreeHash`, the drift oracle).
 */
export interface AwarenessFacet {
  readonly content: string // [PINNED] top-tier rendered rollup under ~400 tok — exact format not frozen
  readonly grounding: readonly StructRef[] // the node@sha anchors — grounded + drift-checked
  readonly state: FacetState // seeded / UN-SEEDED sentinel / drift flag
}

/**
 * The Awareness slab (MEM-11, atlas-memory:39-45). The project's standing self-model: a DERIVED ROLLUP of
 * the Atlas root (never a hand-written blob, so it can't rot). Five facets, byte-identical across members,
 * `≤ ~400 tok`.
 *   - `mission`      — the enduring thesis. Source: ratified DEFINE artifact (GEN-9).
 *   - `constitution` — the non-negotiable laws. Source: highest-tier invariant set (T0 manifest).
 *   - `terrain`      — the territory map + owners + which are T0. Source: territory-axis top rollup.
 *   - `ontology`     — the core vocabulary. Source: `slot='definition'` nodes curated by walt (DEFINE).
 *   - `taste`        — what "good"/"rejected" looks like here. Source: `CONVENTIONS.md@sha` + gate config.
 */
export interface Awareness {
  readonly mission: AwarenessFacet
  readonly constitution: AwarenessFacet
  readonly terrain: AwarenessFacet
  readonly ontology: AwarenessFacet
  readonly taste: AwarenessFacet
}

export interface AwarenessApi {
  /** Assemble Awareness as a PURE rollup of the Atlas root — deterministic (same root ⇒ byte-identical
   *  across seats and re-runs), top-tier under `≤ ~400 tok`, tail pull-reachable (MEM-11).
   *  (method-tags-mem:95) */
  rollup(root: Node): Awareness

  /** A single facet's rollup from ITS OWN source — absent source ⇒ `UN-SEEDED`, moved source ⇒ drift-flag
   *  (served flagged, not stale) (MEM-11).
   *
   *  [OPAQUE-BY-DESIGN — `source` type] each facet's source differs (DEFINE artifact / T0 manifest / territory-axis
   *  top / `slot='definition'` nodes / `CONVENTIONS.md@sha`) and has no single frozen type; transcribed as
   *  `unknown` rather than invented. Flagged. */
  facet(source: unknown): AwarenessFacet
}

/**
 * The instrumented assembly receipt (MEM-12) — the correctness oracle. Memoized assembly: each Awareness
 * facet is CACHED on ITS OWN source subtree hash (not the always-moving root key), so an unchanged root
 * costs 0 re-rolls + 0 drift-checks. On a cache hit BOTH counters are `0`; a re-roll increments ONLY for
 * the moved facet. A call-counter correctness check (NOT a timing/latency measure — Refuse-to-model).
 */
export interface AssemblyReceipt {
  readonly key: Hash // the memo key — the composed briefing's content hash
  readonly reRolls: number // facet re-rolls performed (0 on a cache hit)
  readonly driftChecks: number // per-node@sha drift-checks performed (0 on a cache hit)
}

/** A memoized assembly = the byte-stable output + its instrumented receipt. */
export interface Memoized<T> {
  readonly value: T
  readonly receipt: AssemblyReceipt
}

export interface MemoizeApi {
  /** Assemble Awareness ONCE per root-state, shared across seats, with each facet cached on ITS OWN
   *  source subtree hash — 0 re-rolls + 0 drift-checks on an unchanged root (cache hit), a re-roll only
   *  for a moved facet (MEM-12). (method-tags-mem:102) */
  assembleAwareness(root: Node): Memoized<Awareness>

  /** Fold Orientation INCREMENTALLY over only the newly-appended event-log `tail`, never a whole-log
   *  replay (MEM-12). Pure. (method-tags-mem:102) */
  foldOrientation(prev: Orientation, tail: EventLog): Orientation
}
