// @atlas/memory — src/inject.ts  (WP-6.23.MEM · MEM-1 + MEM-4)
//
// The injection composer. MEM-1 · injection-SCOPING (NOT confidentiality): a member's turn-header injects
// ONLY that member's own Memory — `injectFor(store, seat) = { e ∈ store | e.owner === seat }`, 0 cross-seat
// (a scoping predicate over a SHARED git-native store, NOT access-control — `readRepoBytes` witnesses the
// disclaimer). MEM-4 · consultable is never free: `task`/`pr`/`logbook` NEVER auto-inject on a running turn;
// they return SOLELY via an explicit `recall` (the MEM-13 re-spawn push lives in respawn.ts). The shared
// Awareness / Orientation slabs are CONSUMED (bound once at `makeInject`), never authored here.

import type { Budget } from "@atlas/contracts"
import type { OwnPack, Pack, Poke } from "@atlas/retrieval"
import type {
  Awareness,
  Orientation,
  MemberId,
  MemoryKind,
  MemoryRecord,
  MemoryStore,
  ProjectMemoryEntry,
} from "./types.js"

// ── frozen injection surface, co-located here (was ref/inject.ts) ──────────────────────────────────────────

/**
 * The injected turn-header — the THREE slabs (atlas-memory:27-66). `awareness` + `orientation` are shared
 * + DERIVED (never rot); `rules` is the member's own written `ProjectMemoryEntry[]` (the only written
 * project memory). This is the ONLY memory injected on a running turn — consultable kinds are excluded
 * (MEM-4).
 */
export interface TurnHeader {
  readonly awareness: Awareness // slab 1 — derived rollup (MEM-11)
  readonly orientation: Orientation // slab 2 — derived fold (MEM-6)
  readonly rules: readonly ProjectMemoryEntry[] // slab 3 — the member's own written rules, scope-matched
}

/**
 * A co-injected retrieval surface (the `own` / `pack` / `poke` `InjectionKind`s). Owned by
 * @atlas/retrieval, IMPORTED here (the allowed memory→retrieval edge), NEVER redefined.
 */
export type RetrievalSurface = OwnPack | Pack | Poke

/**
 * The full per-seat auto-injection payload: the memory header + the co-injected retrieval surfaces, under
 * the shared per-`InjectionKind` `Budget` ceiling.
 *
 * [PINNED — cap-application shape not frozen] The reference freezes the SLABS + the drop-order vocabulary
 * (`Budget` per `InjectionKind`), not a concrete post-cap payload record; `budgets` carries the honest
 * per-surface ledger, `retrieval` the surfaces retrieval owns — no invented merged shape.
 */
export interface InjectionPayload {
  readonly header: TurnHeader
  readonly retrieval: readonly RetrievalSurface[] // [FLAG] retrieval-owned surfaces, co-injected under budget
  readonly budgets: readonly Budget[] // per-InjectionKind cap + hit-rate — the drop-order ledger
}

export interface InjectApi {
  /** Owner-scoped filter: a member's own Memory ONLY — `{ e ∈ store | e.owner == seat }`, 0 cross-seat
   *  (MEM-1, injection-SCOPING not access-control). Pure + total. (method-tags-mem:25) */
  injectFor(store: MemoryStore, seat: MemberId): readonly MemoryRecord[]

  /** Assemble the running-turn header (the three slabs) for a seat; the CONSULTABLE kinds
   *  (`task`/`pr`/`logbook`) are EXCLUDED (running-turn header ∩ consultable == ∅ — MEM-4).
   *  (method-tags-mem:46) */
  assembleHeader(store: MemoryStore, seat: MemberId): TurnHeader

  /** Compose the full budget-capped auto-injection payload: the memory header + co-injected retrieval
   *  surfaces (own/pack/poke) under the shared `InjectionKind` ceiling. The memory→retrieval edge. */
  compose(store: MemoryStore, seat: MemberId, surfaces: readonly RetrievalSurface[]): InjectionPayload

  /** The ONLY path that returns consultable `task` / `pr` / `logbook` memory — an explicit
   *  `memory-recall`, never auto-injected on a running turn (MEM-4). (method-tags-mem:46)
   *
   *  [OPAQUE-BY-DESIGN — `query` shape not frozen] `memory-recall` is queried by taskId / prId / date / territory;
   *  no concrete query record is frozen → `unknown`, NOT invented. */
  recall(query: unknown): readonly MemoryRecord[]
}

// ── MEM-1: owner-scoped injection (a SCOPING predicate, not access-control) ───────────────────────────────

/**
 * MEM-1 — a member's own Memory ONLY: `{ e ∈ store | e.owner === seat }`, 0 cross-seat entries. Pure +
 * total. This is the SCOPING primitive the running-turn header is built from — NOT a redaction of the
 * shared store and NOT confidentiality (see `readRepoBytes`).
 */
export function injectFor(store: MemoryStore, seat: MemberId): readonly MemoryRecord[] {
  return store.filter((r) => r.owner === seat)
}

/**
 * MEM-1b — scoping is NOT access-control. Memory is git-native plaintext in the one repo, so any repo
 * reader reads EVERY seat's bytes; the read is reader-AGNOSTIC (the `reader` arg is only the vantage the
 * golden names). A future impl that per-seat-encrypted/gated Memory would drop foreign entries here — that
 * would add a confidentiality property the design explicitly disclaims. Readability is the design.
 */
export function readRepoBytes(store: MemoryStore, _reader: MemberId): MemoryStore {
  return store
}

// ── MEM-4: the running-turn header excludes consultable kinds ─────────────────────────────────────────────

/** The seat's OWN `project` memory — the ONLY written slab, owner-scoped (MEM-1). `task`/`pr`/`logbook`
 *  are structurally absent, giving `header ∩ {task,pr,logbook} = ∅` (MEM-4). The frecency top-N / cap
 *  (MEM-3/7, WP-6.25-a) composes ON TOP of this owner-scoped set and is out of this facet. */
function ownProjectRules(store: MemoryStore, seat: MemberId): readonly ProjectMemoryEntry[] {
  return injectFor(store, seat)
    .filter((r) => r.kind === "project")
    .map((r) => r.entry as ProjectMemoryEntry)
}

/**
 * MEM-4 — assemble the running-turn header (the three slabs): shared `awareness` + `orientation` (bound at
 * construction, byte-identical) + the seat's own `rules`. The consultable kinds are EXCLUDED by
 * construction — `rules` is `project`-only — so no `task`/`pr`/`logbook` ever auto-injects.
 */
export function assembleHeader(
  store: MemoryStore,
  seat: MemberId,
  awareness: Awareness,
  orientation: Orientation,
): TurnHeader {
  return { awareness, orientation, rules: ownProjectRules(store, seat) }
}

/**
 * The full budget-capped auto-injection payload: the memory header + the co-injected retrieval surfaces
 * (own/pack/poke — the ALLOWED memory→retrieval edge, passed through). The cap-application shape is
 * PINNED-not-frozen (`InjectionPayload`), so no drop-order policy is invented — `budgets` is the honest empty
 * ledger until a cap policy is frozen (MEM-3/WP-6.25-a).
 */
export function compose(
  store: MemoryStore,
  seat: MemberId,
  surfaces: readonly RetrievalSurface[],
  awareness: Awareness,
  orientation: Orientation,
): InjectionPayload {
  return {
    header: assembleHeader(store, seat, awareness, orientation),
    retrieval: surfaces,
    budgets: [],
  }
}

// ── MEM-4 · the single explicit-recall handler (D2 CLI-floor) ─────────────────────────────────────────────

/** The runtime narrowing of the OPAQUE `recall` query (`InjectApi` pins `query: unknown` — it is queried
 *  by owner / kind / taskId / prId, no concrete record frozen). Narrowed defensively behind `unknown`. */
interface RecallFilter {
  readonly owner?: MemberId
  readonly kind?: MemoryKind
  readonly taskId?: string
  readonly prId?: string
}

function asRecallFilter(query: unknown): RecallFilter {
  if (typeof query !== "object" || query === null) return {}
  const q = query as Record<string, unknown>
  const f: { owner?: MemberId; kind?: MemoryKind; taskId?: string; prId?: string } = {}
  if (typeof q.owner === "string") f.owner = q.owner
  if (q.kind === "task" || q.kind === "pr" || q.kind === "project" || q.kind === "logbook") f.kind = q.kind
  if (typeof q.taskId === "string") f.taskId = q.taskId
  if (typeof q.prId === "string") f.prId = q.prId
  return f
}

function matchesRecall(r: MemoryRecord, f: RecallFilter): boolean {
  if (f.owner !== undefined && r.owner !== f.owner) return false
  if (f.kind !== undefined && r.kind !== f.kind) return false
  const e = r.entry as unknown as Record<string, unknown>
  if (f.taskId !== undefined && e.taskId !== f.taskId) return false
  if (f.prId !== undefined && e.prId !== f.prId) return false
  return true
}

/**
 * MEM-4b — the ONE handler that returns consultable memory, and ONLY in response to an explicit
 * `memory-recall` (D2 CLI-floor: one pure, Read-only, transport-agnostic handler). An unqualified query
 * (no recognizable selector) surfaces NOTHING — recall is explicit. `task`/`pr`/`logbook` never reach a
 * running-turn header, so this is their sole general read path (the MEM-13 re-spawn push is separate).
 */
export function recall(store: MemoryStore, query: unknown): readonly MemoryRecord[] {
  const f = asRecallFilter(query)
  if (f.owner === undefined && f.kind === undefined && f.taskId === undefined && f.prId === undefined) {
    return []
  }
  return store.filter((r) => matchesRecall(r, f))
}

// ── the frozen-`InjectApi` binding (shared slabs bound once, byte-identical) ───────────────────────────────

/**
 * Bind the injection surface to the FROZEN `InjectApi`. The shared Awareness / Orientation
 * slabs and the store are bound once (per root-state) — `recall` closes over the store since its frozen
 * signature carries no store arg. The pure methods honor their explicit `store` arg.
 */
export function makeInject(store: MemoryStore, awareness: Awareness, orientation: Orientation): InjectApi {
  return {
    injectFor: (s, seat) => injectFor(s, seat),
    assembleHeader: (s, seat) => assembleHeader(s, seat, awareness, orientation),
    compose: (s, seat, surfaces) => compose(s, seat, surfaces, awareness, orientation),
    recall: (query) => recall(store, query),
  }
}

// differential-vs-oracle (compile-time): the built surface conforms EXACTLY to the FROZEN `InjectApi`.
const _inject: (s: MemoryStore, a: Awareness, o: Orientation) => InjectApi = makeInject
void _inject
