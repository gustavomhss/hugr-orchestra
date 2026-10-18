// @atlas/persist — src/reinvoke.ts  (WP-3.5-b.PERSIST — PERSIST-7 / 10b)
//
// Re-invoke = idempotent redispatch + faithful replay — NEVER deterministic resume. `redispatch(record)`
// reproduces the seat PURELY from git state (same brief → same seat via the SEALED kernel `id` seam), reading
// ZERO non-git state; `replay(cp)` re-feeds the RECORDED `Checkpoint` I/O (DISTINCT from the raw transcript).

import { id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { Checkpoint } from "./types.js"

/** The audit view produced by replaying a recorded `Checkpoint`. The view shape is the owning WP's to
 *  pin (SIG-TBD), so the frozen surface keeps it opaque. (atlas-persist:106) */
export type TranscriptView = unknown

/** Re-invoke surface (PERSIST-7 / 10b): idempotent redispatch (same brief → same seat) + faithful replay
 *  of recorded I/O — NEVER a deterministic resume. `Seat`/`record` are orchestrator-owned, kept
 *  `unknown`. (atlas-persist:105-106) */
export interface ReinvokeApi {
  redispatch(record: unknown): unknown
  replay(cp: Checkpoint): TranscriptView
}

// ── idempotent redispatch (REQ-PERSIST-7-a / 10b-b) ─────────────────────────────────────────────────────

/** The canonical seat brief extracted from a git-versioned record: the record's own `seatBrief` when it
 *  carries one, a bare string brief as-is, else the whole record. Pure over its input — no external read. */
function briefOf(record: unknown): unknown {
  if (typeof record === "string") return record
  if (typeof record === "object" && record !== null && "seatBrief" in record) {
    return (record as { seatBrief: unknown }).seatBrief
  }
  return record
}

/**
 * Idempotent redispatch: the seat identity is the content hash of the brief over the SEALED kernel `id`
 * seam — the same brief maps to the same seat (A-18) on any machine / user / clone / fork, from git-tracked
 * state ALONE. Deterministic over the record ⇒ 0 non-git state is read. The returned `Seat` is
 * orchestrator-owned, so the surface keeps it `unknown` (ReinvokeApi, above). This is NOT a deterministic
 * resume — nothing here continues an agent from where it stopped. (REQ-PERSIST-7-a / 10b-b)
 */
export function redispatch(record: unknown): unknown {
  const seatId: Hash = id({ kind: "Seat", brief: briefOf(record) })
  return { kind: "Seat", seatId }
}

// ── faithful replay (REQ-PERSIST-10b-c / 10b-d) ─────────────────────────────────────────────────────────

/**
 * The audit view produced by replaying a recorded `Checkpoint` (PERSIST-10b, atlas-persist:106). PINNED
 * from THIS WP's acceptance — the frozen `TranscriptView` (above) deliberately delegates the shape to the
 * owning WP (§SIG-TBD/OWNER-DEFINE), and SCN-PERSIST-10b-c-1 grounds it: the view re-feeds the RECORDED seat
 * brief + LLM outputs + tool I/O faithfully. `source: 'recording'` witnesses the I/O was re-fed from the
 * checkpoint, NEVER re-invoked from the live model (the golden's teeth). Assignable to the opaque
 * `TranscriptView = unknown` — the frozen interface is consumed, never widened.
 */
export interface ReplayView {
  readonly source: "recording"
  readonly seatBrief: string
  readonly llmOutputs: readonly string[]
  readonly toolIO: readonly string[]
}

/**
 * Faithful replay: re-feed the recorded LLM/tool I/O straight from the structured `Checkpoint` substrate —
 * the replay reproduces the record, never consulting the live model (REQ-PERSIST-10b-c). The substrate is
 * the `Checkpoint` (seatBrief + llmOutputs + toolIO), DISTINCT from the raw transcript large object
 * (REQ-PERSIST-10b-d). Pure over its input ⇒ reads 0 non-git state (REQ-PERSIST-7-b).
 */
export function replay(cp: Checkpoint): ReplayView {
  return {
    source: "recording",
    seatBrief: cp.seatBrief,
    llmOutputs: [...cp.llmOutputs],
    toolIO: [...cp.toolIO],
  }
}

// differential-vs-oracle (compile-time): the impl conforms to the co-located frozen `ReinvokeApi` —
// `redispatch(record: unknown): unknown` matches exactly, and `replay`'s `ReplayView` is assignable to the
// opaque `TranscriptView` (`unknown`). No `resume` member exists on the surface (PERSIST-10b-a).
const _apiCheck: ReinvokeApi = { redispatch, replay }
void _apiCheck
