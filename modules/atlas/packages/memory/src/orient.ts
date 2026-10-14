// @atlas/memory — src/orient.ts  (WP-6.24-b.MEM · MEM-6 + MEM-12c)
//
// MEM-6 (Orientation is derived & shared) + the MEM-12c incremental-fold slice. The second injected slab is
// DERIVED + SHARED, never a written memory (so it can't rot): `goal` from the ratified DEFINE artifact,
// `last/current/state` a FOLD over the event log — byte-identical across ALL members, `≤ ~250 tok`. Per
// MEM-12c a new turn folds only the newly-appended event-log TAIL, never a full replay. SEAM (sealed
// @atlas/kernel, KERNEL-1/5/10): fold/head reconstruction, `id`, and byte-identical `canonicalForm` go
// through the sealed seam alone. `define` is OPAQUE (`unknown`, `goal` read from a conventional field).

import { fold, head, id, canonicalForm, asNodeKey } from "@atlas/kernel"
import type { Node, Event, EventLog, AtlasState } from "@atlas/kernel"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { Orientation, OrientApi, MemoizeApi } from "./types.js"

// ── the two derived channels (fold targets) + the event model ───────────────────────────────────────────────

/** The two fold channels: `milestone` drives `last/current`, `state` drives the moving `state` line. */
export type OrientChannel = "milestone" | "state"

const MILESTONE_KEY: NodeKey = asNodeKey("orient@milestone")
const STATE_KEY: NodeKey = asNodeKey("orient@state")

const KEY_OF: Record<OrientChannel, NodeKey> = { milestone: MILESTONE_KEY, state: STATE_KEY }

/** `~250 tok` Orientation cap (MEM-6d, ratified pinned bound). Enforced fail-closed on injection. */
export const ORIENTATION_TOK_CAP = 250

/** A derived-channel event payload — a `≤ 1-line` milestone/state `label` (atlas-memory:50-53). */
export interface OrientEventPayload {
  readonly channel: OrientChannel
  readonly label: string
}

/**
 * Build a content-keyed kernel `Event` for a derived channel; identity is the SEALED kernel `id` seam
 * (KERNEL-1), and lineage rides `supersedes` (the KERNEL-10 supersedes-DAG) — never `seq`. Deterministic.
 */
export function orientEvent(channel: OrientChannel, label: string, supersedes: readonly Hash[] = []): Event {
  const payload: OrientEventPayload = { channel, label }
  const contentHash: Hash = id(payload)
  return { id: contentHash, seq: 0, nodeKey: KEY_OF[channel], contentHash, fresh: true, supersedes, payload }
}

// ── projection helpers (head + supersedes-DAG lineage — the sealed KERNEL ordering, never seq) ──────────────

/** The `≤ 1-line` label carried by a derived event; a malformed/absent payload projects to `''`. */
function labelOf(e: Event): string {
  const p = e.payload as Partial<OrientEventPayload> | null
  return p !== null && typeof p === "object" && typeof p.label === "string" ? p.label : ""
}

/** The predecessor label = the label of the entry the head SUPERSEDES within this node; `''` if outside. */
function predecessorLabel(node: Node, h: Event): string {
  for (const sh of h.supersedes) {
    const prev = node.entries.get(sh)
    if (prev !== undefined) return labelOf(prev)
  }
  return ""
}

/** The current label of a channel = the sealed `head` (max-by-contentHash among fresh, non-superseded). */
function currentOf(state: AtlasState, key: NodeKey): string {
  const node = state.get(key)
  if (node === undefined) return ""
  const h = head(node)
  return h === undefined ? "" : labelOf(h)
}

/** The milestone channel's `{ last, current }` — `current` = head, `last` = the head's superseded parent. */
function milestoneOf(state: AtlasState): { readonly last: string; readonly current: string } {
  const node = state.get(MILESTONE_KEY)
  if (node === undefined) return { last: "", current: "" }
  const h = head(node)
  if (h === undefined) return { last: "", current: "" }
  return { last: predecessorLabel(node, h), current: labelOf(h) }
}

/**
 * Read the current-milestone `goal` OPAQUELY from the ratified DEFINE artifact. DEFINE is opaque-by-design
 * (`unknown`, no frozen type at this layer); the `goal` is read from a conventional `goal` string field, and
 * an artifact carrying no readable goal projects to `''` — never a fabricated line, never a seat's memory.
 */
function readGoal(define: unknown): string {
  if (define !== null && typeof define === "object" && "goal" in define) {
    const g = (define as { readonly goal: unknown }).goal
    if (typeof g === "string") return g
  }
  return ""
}

// ── MEM-6: the Orientation assembler (goal from DEFINE, last/current/state as an event-log fold) ─────────────

/**
 * Assemble Orientation as a PURE function of `(DEFINE artifact, event log)` (MEM-6): `goal` from the
 * ratified DEFINE, `last/current/state` as a fold over the log via the sealed `fold`/`head` seam. No seat
 * input, so it is byte-identical across members and never stale. (`orient`.)
 */
export function orient(define: unknown, log: EventLog): Orientation {
  const state = fold(log)
  const { last, current } = milestoneOf(state)
  return { goal: readGoal(define), last, current, state: currentOf(state, STATE_KEY) }
}

/** The byte-identical injection form (MEM-6c) — via the SEALED kernel `canonicalForm` seam, no raw bytes. */
export function orientationBytes(o: Orientation): Uint8Array {
  return canonicalForm(o)
}

// ── MEM-6d: the ~250 tok cap (fail-closed, never injected over-cap) ──────────────────────────────────────────

/** Word-count token proxy (whitespace-delimited) — `''` is 0 tokens. */
function tok(s: string): number {
  const t = s.trim()
  return t === "" ? 0 : t.split(/\s+/).length
}

/** The injected Orientation's token size — the sum over `goal/last/current/state` (MEM-6d cap check). */
export function orientationTokens(o: Orientation): number {
  return tok(o.goal) + tok(o.last) + tok(o.current) + tok(o.state)
}

/**
 * Fail-closed cap guard (MEM-6d) — Orientation over `~250 tok` is REJECTED, never injected over-cap; an
 * Orientation within the cap is returned unchanged (a read-only assembly — the slab is never written).
 */
export function injectOrientation(o: Orientation): Orientation {
  const n = orientationTokens(o)
  if (n > ORIENTATION_TOK_CAP) {
    throw new Error(`Orientation cap exceeded: ${n} tok > ${ORIENTATION_TOK_CAP} (~250 tok)`)
  }
  return o
}

// ── MEM-6e: derived-only — never a written memory entry ──────────────────────────────────────────────────────

/**
 * Reject any attempt to persist Orientation as a written memory entry (MEM-6e). Orientation is DERIVED-ONLY
 * — assembled from `(DEFINE, log)` each turn — so persisting it as a per-member `project` (or any) written
 * entry is fail-closed rejected; a stored copy would go stale against a new log head. This function never
 * returns (it always throws) — there is no code path that writes Orientation.
 */
export function persistAsWrittenEntry(_o: Orientation): never {
  throw new Error(
    "Orientation is derived-only (MEM-6e): it MUST NOT be persisted as a written memory entry — it is " +
      "assembled from (DEFINE, log) each turn so it can never go stale",
  )
}

// ── MEM-12c: Orientation is an INCREMENTAL fold over the appended tail, never a full replay ───────────────────

/** An instrumented incremental fold = the folded Orientation + the count of tail entries actually folded. */
export interface OrientFold {
  readonly value: Orientation
  readonly folded: number // tail entries processed — the delta size, NEVER the whole-log size
}

/**
 * Fold Orientation INCREMENTALLY over ONLY the newly-appended `tail`, applied onto the prior Orientation
 * (MEM-12c) — structurally it CANNOT replay the whole log, because only the tail delta is passed. The
 * milestone tail's head is the new `current`; the head's superseded parent is the new `last` when that
 * parent is inside the tail, else `last` advances from the prior `current`. `goal` carries from `prev`
 * (the DEFINE-sourced goal is not in the log). `folded` counts exactly the tail entries visited.
 */
export function foldOrientationInstrumented(prev: Orientation, tail: EventLog): OrientFold {
  let folded = 0
  for (const _ev of tail.values()) folded++ // visit exactly the appended tail delta, never the full log
  const state = fold(tail)

  let last = prev.last
  let current = prev.current
  const mNode = state.get(MILESTONE_KEY)
  if (mNode !== undefined) {
    const h = head(mNode)
    if (h !== undefined) {
      const parent = predecessorLabel(mNode, h) // the superseded parent WITHIN the tail delta
      last = parent !== "" ? parent : prev.current // parent outside the tail ⇒ advance from prior current
      current = labelOf(h)
    }
  }

  let stateLine = prev.state
  const sNode = state.get(STATE_KEY)
  if (sNode !== undefined) {
    const h = head(sNode)
    if (h !== undefined) stateLine = labelOf(h)
  }

  return { value: { goal: prev.goal, last, current, state: stateLine }, folded }
}

/** Fold Orientation incrementally over only the appended `tail`, never a full replay (MEM-12c). Pure. */
export function foldOrientation(prev: Orientation, tail: EventLog): Orientation {
  return foldOrientationInstrumented(prev, tail).value
}

// ── frozen-oracle conformance (compile-time differential-vs-oracle) ────────────────────────────────────────

/** Bind the built surface to the FROZEN `OrientApi` (`orient`). */
export function makeOrientApi(): OrientApi {
  return { orient }
}

const _apiCheck: () => OrientApi = makeOrientApi
void _apiCheck

// The `foldOrientation` slice conforms to the FROZEN `MemoizeApi` (assembleAwareness is the
// sibling WP-6.24-a facet, NOT implemented here).
type MemoizeFoldSlice = Pick<MemoizeApi, "foldOrientation">
const _foldCheck: MemoizeFoldSlice = { foldOrientation }
void _foldCheck
