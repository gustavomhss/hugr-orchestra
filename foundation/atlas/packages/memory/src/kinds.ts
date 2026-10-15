// @atlas/memory — src/kinds.ts  (WP-6.23.MEM · MEM-2)
//
// The kind partition. Memory and Knowledge share the ONE Atlas, yet a Memory entry MUST NOT route into the
// Knowledge partition (or vice versa) — 0 conflations (MEM-2). `partition(entry)` computes an entry's TRUE
// `AtlasKind` (a STRUCTURAL discriminant, no hashing) and `put` rejects any write whose claimed kind disagrees.

import type { InjectionKind } from "@atlas/contracts"
import type { MemberId, MemoryEntry, MemoryRecord } from "./types.js"
import { memoryKindOf } from "./template.js"

// ── frozen kind-partition surface, co-located here (was ref/kinds.ts) ──────────────────────────────────────

/**
 * The store-partition discriminant (MEM-2) — Memory vs Knowledge over the ONE Atlas. This is a DISTINCT
 * axis from `MemoryKind` (task|pr|project|logbook): `AtlasKind` decides WHICH kind of the Atlas a write
 * belongs to; `MemoryKind` sub-types a Memory entry.
 */
export type AtlasKind = "memory" | "knowledge"

/**
 * The CLOSED vocabulary of INJECTED memory surfaces — the memory-owned subset of the contracts-owned
 * `InjectionKind`. Transcribed as an `Extract` over the frozen union (atlas-memory §3.1 injects exactly
 * Awareness · Orientation · Rules(=projectMem)); IMPORTED + narrowed, NEVER forked.
 *
 * [FLAG — memory-only kinds NOT in the injection vocab] The CONSULTABLE memory kinds `task` / `pr` /
 * `logbook` are deliberately ABSENT from `InjectionKind` (MEM-4/8: never auto-injected). They are memory
 * kinds with NO injection surface — flagged so no future edit adds them to the injected drop-order.
 */
export type MemInjectionKind = Extract<InjectionKind, "awareness" | "orientation" | "projectMem">

/** The FROZEN kind-partition API (MEM-2) — implemented by the free functions below. */
export interface KindsApi {
  /** Route a write on the `AtlasKind` discriminant into the matching partition of the ONE store; a
   *  memory→knowledge or knowledge→memory store is REJECTED (MEM-2). Reuses KERNEL-3 `store.ts`.
   *  (method-tags-mem:32)
   *
   *  [PINNED — updated-store return] no post-write store projection is frozen; the minimal honest shape
   *  the reference implies is the `MemoryRecord` actually written (owner-scoped, kind-partitioned) — the
   *  knowledge partition is out of this package's surface.
   *
   *  [AMENDED 2026-08-30 — the OWNER-DEFINE park is CLOSED] `owner` is now an argument. The signature was
   *  `put(kind, entry)` and the matched-partition branch THREW, because a `MemoryRecord` needs an `owner`
   *  and there was nowhere honest to get one; fabricating it was correctly refused. Ratified in
   *  `reference/atlas-memory.md` §Decisions D1: the owner is the composition root's already-resolved
   *  `actor`. This package does not resolve it and does not interpret it — it RECEIVES it, which is why
   *  the parameter is here and not an import. */
  put(kind: AtlasKind, entry: MemoryEntry, owner: MemberId): MemoryRecord

  /** The partition an entry belongs to; the reference asserts `partition(entry) == entry.kind` for every
   *  write (0 conflation — MEM-2). (method-tags-mem:32) */
  partition(entry: MemoryEntry): AtlasKind
}

/**
 * Raised when a write's claimed `AtlasKind` disagrees with the entry's true partition — the MEM-2 gate
 * rejects it fail-closed (never stored on the wrong side of the Memory/Knowledge boundary).
 */
export class KindConflationError extends Error {
  readonly claimed: AtlasKind
  readonly actual: AtlasKind
  constructor(claimed: AtlasKind, actual: AtlasKind) {
    super(
      `MEM-2 kind conflation: write claimed AtlasKind '${claimed}' but the entry's true partition is ` +
        `'${actual}' — rejected (0 Memory↔Knowledge conflation)`,
    )
    this.name = "KindConflationError"
    this.claimed = claimed
    this.actual = actual
  }
}

/**
 * The partition an entry belongs to (MEM-2). A Knowledge `GroundedFact` (`AdvisoryNode | PredicateNode`,
 * @atlas/knowledge) carries a top-level `kind` discriminant of `'advisory' | 'predicate'`; NO `MemoryEntry`
 * shape (project / task / pr / logbook) has a top-level `kind` field (the Memory kind lives on the
 * `MemoryRecord` envelope, not the entry). That asymmetry is the partition oracle — structural, not hashed.
 */
export function partition(entry: MemoryEntry): AtlasKind {
  const disc = (entry as { readonly kind?: unknown }).kind
  if (disc === "advisory" || disc === "predicate") return "knowledge"
  return "memory"
}

/**
 * Route a write on the `AtlasKind` discriminant (MEM-2). A memory→knowledge or knowledge→memory write is
 * REJECTED fail-closed: `partition(entry)` MUST equal the claimed `kind`.
 *
 * [OWNER-DEFINE-parked — matched-partition write projection] on a MATCHED kind the reference's return is a
 * `MemoryRecord`, but `put` receives NO `owner` and the reference freezes NO owner-source (oracle-pin-map:
 * memory "kinds put-return genuinely open"). No acceptance golden exercises the matched branch (both MEM-2
 * goldens are rejections), so rather than fabricate an `owner` the matched write projection is fail-closed
 * — NOT invented. When the owner-source is ratified, the matched branch materializes the record.
 */
/**
 * Raised when a write carries no owner. Fail-closed on purpose: the composition root resolves `actor` as
 * `ATLAS_ACTOR ?? gitUserEmail(repo) ?? ''`, so an EMPTY string is a reachable value, and an empty owner
 * would mint a record that `injectFor` hands to every caller whose actor is also empty. An unowned memory
 * is not a memory — it is a leak with a scoping key that matches by accident.
 */
export class UnownedWriteError extends Error {
  constructor() {
    super(
      "MEM-1 put: the write carries no owner (empty `MemberId`) — rejected. Memory is scoped BY owner, so " +
        "an unowned record would be injected to every caller resolving the same empty actor.",
    )
    this.name = "UnownedWriteError"
  }
}

export function put(kind: AtlasKind, entry: MemoryEntry, owner: MemberId): MemoryRecord {
  const actual = partition(entry)
  if (actual !== kind) throw new KindConflationError(kind, actual)
  // BOTH discriminants are DERIVED here and neither is announced by the payload: `partition` decides the
  // Memory-vs-Knowledge axis, `memoryKindOf` decides which of the four templates judges the write. It
  // throws `UndeterminedKindError` on no match or a tie — never a guessed type.
  const memoryKind = memoryKindOf(entry)
  if (owner === "") throw new UnownedWriteError()
  return { owner, kind: memoryKind, entry }
}

// differential-vs-oracle (compile-time): the free functions conform EXACTLY to the FROZEN `KindsApi`.
const _kinds: KindsApi = { put, partition }
void _kinds
