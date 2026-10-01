// @atlas/memory — src/respawn.ts  (WP-3.5-b.MEM · MEM-10 + MEM-13)
//
// MEM-10 (Versioned & nothing dies) + MEM-13 (Recall fires at re-spawn). MEM-10a: every memory TYPE of every
// member TRAVELS at each commit/PR/branch/fork (a fork inherits the whole log by content-keyed set-union,
// grow-only), modelled as the SEALED @atlas/kernel insert-only event log (KERNEL-4/9), identity via the
// kernel `id`/`eventId` seam ALONE. MEM-10b: a run is re-spawnable SOLELY from that versioned record.
// MEM-13: at re-spawn a seat is PUSHED its OWN prior `task`/`pr` closing fold for the unit it is RESUMING —
// a push at spawn, off the ARCHIVED fold, scoped to own+resumed only. The PERSIST Checkpoint substrate is
// consumed as a seam fixture (see the test) — no upward package dependency introduced here.

import { id, eventId, createLog, combine } from "@atlas/kernel"
import type { Event, EventLog } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { MemberId, MemoryKind, MemoryRecord, MemoryStore, TaskMemoryEntry } from "./types.js"

// ── frozen re-spawn surface, co-located here (was ref/respawn.ts) ──────────────────────────────────────────

/**
 * The closing fold auto-recalled at re-spawn (MEM-13) — the retry-relevant subset of a `task` entry.
 * Transcribed as the `{ attempted, failedWith, stoppedAt, lesson }` projection of `TaskMemoryEntry`
 * (atlas-memory:19, 127). (`pr` folds carry the analogous decisions/outcomes subset of `PrMemoryEntry`.)
 */
export type ClosingFold = Pick<TaskMemoryEntry, "attempted" | "failedWith" | "stoppedAt" | "lesson">

/**
 * The unit a seat is resuming (a `task` / `pr` it previously touched — MEM-13).
 *
 * [PINNED — unit identity type] the reference names "the unit it is resuming" with no frozen id type;
 * transcribed as `{ kind, id }` over the two resumable kinds — `id` is `string`, NOT invented as a brand.
 */
export interface ResumeUnit {
  readonly kind: "task" | "pr" // the resumable Memory kinds (project/logbook are not resumed folds)
  readonly id: string // [PINNED] taskId / prId — no frozen brand
}

export interface RespawnApi {
  /** Push the seat's OWN archived closing fold for the resumed unit, ONCE at spawn — deterministic off
   *  the archived record, scoped to own + resumed only, fires at SPAWN (not on a running turn — MEM-13).
   *  Reuses MEM-10's versioned archive. Pure + deterministic. (method-tags-mem:109) */
  spawnRecall(seat: MemberId, unit: ResumeUnit): ClosingFold
}

// ── MEM-10a: the versioned record (SEALED kernel insert-only content-keyed log) ──────────────────────────

/**
 * Wrap a `MemoryRecord` as a content-keyed kernel `Event` (a KERNEL-4 insert-only log entry). Identity is
 * the SEALED kernel `id`/`eventId` over the record — NEVER a hand-rolled digest (KERNEL-1 seam). `seq` is a
 * local ordering hint pinned out of the id preimage (KERNEL-9); the record rides as the opaque `payload`.
 */
function toEvent(rec: MemoryRecord): Event {
  const contentHash: Hash = id(rec)
  const content = {
    seq: 0,
    contentHash,
    fresh: true,
    supersedes: [] as readonly Hash[],
    payload: rec,
  }
  return { ...content, id: eventId(content) }
}

/**
 * MEM-10a — version a member's Memory as the SEALED kernel insert-only, content-keyed log. Every record of
 * every type (incl. the orchestrator's `logbook`) is admitted exactly once by content id (first-write-wins,
 * grow-only). Because it is the ONE git-native log, no type is siphoned into a non-versioned side-store.
 */
export function versioned(store: MemoryStore): EventLog {
  const log = createLog()
  let snapshot: EventLog = new Map()
  for (const rec of store) snapshot = log.append(toEvent(rec))
  return snapshot
}

/**
 * MEM-10a — git-native carry at a commit / PR / branch / fork: the successor INHERITS the whole versioned
 * log by content-keyed set-union (KERNEL-9). Grow-only + idempotent ⇒ nothing is dropped on the fork and
 * `|log|` is monotone (non-decreasing) across the carry. The fork of a broken impl that kept a type in a
 * non-versioned side-store would lose that type here — this carry keeps every record.
 */
export function carry(base: EventLog, incoming: EventLog = base): EventLog {
  return combine(base, incoming)
}

/** The set of memory TYPES present in a versioned record — witnesses that every type TRAVELS (MEM-10a). */
export function typesIn(log: EventLog): ReadonlySet<MemoryKind> {
  return new Set([...log.values()].map((ev) => (ev.payload as MemoryRecord).kind))
}

// ── MEM-10b: a run re-spawnable SOLELY from the versioned record ─────────────────────────────────────────

/**
 * MEM-10b — rebuild a member's Memory store SOLELY from the versioned record. A total, deterministic pure
 * function of the log alone: it reads ZERO mutable in-memory snapshot, so an ephemeral agent's run
 * re-spawns identically after a process restart from the git-tracked record. (The insertion order of the
 * kernel log is preserved by the `Map`, so two re-spawns yield an identical store.)
 */
export function respawnFromRecord(log: EventLog): MemoryStore {
  return [...log.values()].map((ev) => ev.payload as MemoryRecord)
}

// ── MEM-13: recall pushed at re-spawn off the archived fold ──────────────────────────────────────────────

/**
 * One archived closing fold in MEM-10's versioned record, keyed to the seat that owns it and the unit it
 * closes — the source MEM-13's spawn push reads from. Keeping the archive as pre-projected folds keeps the
 * spawn push a pure, kind-agnostic lookup that is deterministic off the archived record.
 */
export interface ArchivedFold {
  readonly owner: MemberId
  readonly unit: ResumeUnit
  readonly fold: ClosingFold
}

/** The closing-fold archive — MEM-10's versioned-record archive projected for MEM-13 recall. */
export type FoldArchive = readonly ArchivedFold[]

/**
 * The PINNED `task` closing-fold projection — the `{ attempted, failedWith, stoppedAt, lesson }` `Pick` of a
 * `TaskMemoryEntry` (the `ClosingFold` projection; atlas-memory:19,127). This is the retry-relevant subset
 * auto-recalled at re-spawn; a fold no re-spawn ever recalls is dead weight, so it is load-bearing.
 */
export function taskClosingFold(t: TaskMemoryEntry): ClosingFold {
  return {
    attempted: t.attempted,
    failedWith: t.failedWith,
    stoppedAt: t.stoppedAt,
    lesson: t.lesson,
  }
}

/** Archive a seat's closed `task` as its resumable closing fold (MEM-10 versioned-record archive entry). */
export function archiveTaskFold(owner: MemberId, t: TaskMemoryEntry): ArchivedFold {
  return { owner, unit: { kind: "task", id: t.taskId }, fold: taskClosingFold(t) }
}

/**
 * Derive the MEM-13 recall source from MEM-10's versioned record: project each archived `task` record into
 * its closing fold. (`pr` folds carry the analogous `PrMemoryEntry` subset; that projection is owned by the
 * held-out `pr` path and is NOT invented here — the `task` visible golden is the only projection realized.)
 */
export function foldArchiveFromRecord(log: EventLog): FoldArchive {
  return respawnFromRecord(log)
    .filter((r) => r.kind === "task")
    .map((r) => archiveTaskFold(r.owner, r.entry as TaskMemoryEntry))
}

/** A deep, immutable copy of a closing fold — so a spawn push can never alias mutable archive state. */
function copyFold(f: ClosingFold): ClosingFold {
  return {
    attempted: [...f.attempted],
    failedWith: [...f.failedWith],
    stoppedAt: f.stoppedAt,
    lesson: f.lesson,
  }
}

/**
 * MEM-13 — build the re-spawn recall over a seat's own archived folds. `spawnRecall(seat, unit)` PUSHES the
 * seat's OWN prior closing fold for the RESUMED unit at spawn (a push, not a discretionary pull): it filters
 * the archive to `owner === seat` AND the exact resumed `unit` (kind + id), so a foreign seat's fold and
 * general consultable memory are never surfaced (MEM-13b; MEM-4 still bars general auto-injection). It is
 * deterministic off the archived record — a structural copy, no live/mutable read — so two spawns push the
 * identical fold (MEM-13c). A re-spawn onto a unit with no own archived fold is a fail-closed integrity error.
 */
export function makeRespawn(archive: FoldArchive): RespawnApi {
  return {
    spawnRecall(seat: MemberId, unit: ResumeUnit): ClosingFold {
      const own = archive.find((a) => a.owner === seat && a.unit.kind === unit.kind && a.unit.id === unit.id)
      if (own === undefined) {
        throw new Error(`re-spawn recall: no own archived ${unit.kind} fold for '${unit.id}' (seat '${seat}')`)
      }
      return copyFold(own.fold)
    },
  }
}

// differential-vs-oracle (compile-time): the built surface conforms to the FROZEN `RespawnApi`
// (the frozen `RespawnApi`) — `spawnRecall(seat: MemberId, unit: ResumeUnit): ClosingFold` matches exactly. No
// discretionary-pull / general-consultable member is added to the surface (MEM-13 / MEM-4).
const _apiCheck: (a: FoldArchive) => RespawnApi = makeRespawn
void _apiCheck
