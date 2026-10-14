// @atlas/adapter-io — src/orientation-store.ts  (the DURABLE Orientation event log — CAMPAIGN-11 W3)
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// Nothing in `packages/*/src` calls `createDurableOrientation` yet; W7 composes the slab and W8 exposes it.
// Declared in `harness/gates/reference-model-guard.mjs` rather than pre-wired — see `memory-store.ts` for
// why a door wired early to clear that gate is the stub the gate exists to refuse.
//
// ── WHY THIS IS A SECOND LOG AND NOT A SECOND PARTITION OF THE FIRST ─────────────────────────────────────
// `memory.jsonl` holds `MemoryRecord`s — owner-scoped, per-seat, injected only to their owner. Orientation
// is the opposite kind of thing: MEM-6 says it is DERIVED and SHARED, byte-identical across every member,
// and never a written memory, precisely so it cannot rot. Its events are milestone/state labels about the
// RUN, owned by nobody. Putting them in the per-seat log would give them an owner they do not have and put
// `injectFor`'s scoping predicate between a member and a slab that is supposed to be identical for
// everyone. Two logs, one primitive.
//
// ── WHY IT TRAVELS ───────────────────────────────────────────────────────────────────────────────────────
// MEM-6 requires the slab to be byte-identical across all members. Members work in different clones, so a
// log that stayed local would fold to a different Orientation per machine — the invariant would be false by
// construction. Tracking the file is what makes the guarantee reachable at all.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────────────────────────────────
// It does not source `define`. `orient(define, log)` reads `goal` from a conventional field on an OPAQUE
// artifact, and this repository has no ratified DEFINE artifact — `genesis/src/seed.ts` says so where it
// renders `mission` as `UN-SEEDED` for the same reason. So `define` stays a caller-supplied parameter here
// and `goal` reads as empty until one exists. Inventing a file convention for it would be authoring the
// artifact rather than reading it, which is the inversion this campaign has already refused once.

import { join } from "node:path"
import type { Hash } from "@atlas/contracts"
import type { EventLog } from "@atlas/kernel"
import { orient, orientEvent } from "@atlas/memory"
import { id as objectId } from "@atlas/kernel"
import type { Orientation, OrientChannel } from "@atlas/memory"
import { createDurableLog } from "./durable-log.js"

/** The tracked log's path under a repo root. */
export const orientationLogPath = (repoPath: string): string => join(repoPath, ".atlas", "orientation.jsonl")

/** What a read found — the folded event log and the lines it refused. */
export interface OrientationRead {
  readonly log: EventLog
  /** Lines that did not parse, or whose stored `id` is not their content hash. Never silently discarded. */
  readonly rejected: number
}

export interface DurableOrientation {
  readonly path: string
  /** Fold the tracked log. Total — a missing file is an empty log, not an error. */
  read(): OrientationRead
  /** Append one derived-channel event. Identity is the sealed kernel seam; lineage rides `supersedes`. */
  append(channel: OrientChannel, label: string, supersedes?: readonly Hash[]): void
  /**
   * Assemble the slab from the durable log. `define` is opaque and caller-supplied for the reason in the
   * header; with none, `goal` is empty and the fold still carries `last` / `current` / `state`.
   */
  orientation(define?: unknown): Orientation
}

export function createDurableOrientation(repoPath: string): DurableOrientation {
  // `orientEvent` keys an event on its PAYLOAD hash (`id === contentHash === id(payload)`) and chains its
  // supersedes-DAG on `contentHash`, so the memory log's whole-event `isContentKeyed` would reject every
  // line this store writes. The predicate is therefore the payload one — and `durable-log.ts`'s `LineKeyed`
  // doc states exactly what that narrower check does and does not catch, rather than letting the difference
  // pass as if the two logs were equally defended.
  const log = createDurableLog(orientationLogPath(repoPath), (ev) => objectId(ev.payload) === ev.id)

  return {
    path: log.path,
    read: (): OrientationRead => log.read(),
    append(channel: OrientChannel, label: string, supersedes: readonly Hash[] = []): void {
      log.append(orientEvent(channel, label, supersedes))
    },
    orientation(define?: unknown): Orientation {
      return orient(define, log.read().log)
    },
  }
}
