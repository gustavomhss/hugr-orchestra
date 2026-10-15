// @atlas/adapter-io — src/memory-verdicts.ts  (WP-11.W8 — the SHARED memory READ-door verdict builders)
//
// The SHARED `Verdict` builders for the four CAMPAIGN-11 memory read doors that join `READ_SURFACE`
// (`atlas-memory-recall` / `atlas-memory-header` / `atlas-memory-awareness` / `atlas-memory-orientation`).
// They live HERE, beside `author-verdicts.ts` (which does the same job for `anchors`/`slots`/`draft`/
// `check`/`doctor`), because BOTH transports must drive the SAME body for byte-identical SCHEMA + VERDICT
// parity — the CLI cannot own them without the MCP server importing @atlas/cli (a layer the ring forbids).
//
// Each is TOTAL and READ-ONLY: none opens a write path (writes go through `atlas-memory-emit`,
// `GOVERNANCE_SURFACE`). `recall` is MEM-4b's ONE explicit-consult path — an unqualified query answers `[]`
// (never a throw), so there is no missing-arg case to fail closed on; `header`/`awareness`/`orientation`
// take no input at all (a THUNK the composition root closes over its own repo/actor).

import type { Awareness, MemoryRecord, Orientation, TurnHeader } from "@atlas/memory"
import type { Guidance, Verdict } from "@atlas/tools"

// ── recall (MEM-4b) ─────────────────────────────────────────────────────────────────────────────────────

const RECALL_INVARIANT =
  "MEM-4b: atlas-memory-recall is the ONE handler that returns consultable memory (task/pr/logbook), and ONLY in response to an explicit query — an unqualified query (no owner/kind/taskId/prId selector) answers the empty set, never a throw; task/pr/logbook never auto-inject on a running turn (see atlas-memory-header)"

/** Did `query` carry at least one of the four selectors `asRecallFilter` (@atlas/memory) recognises? A
 *  narrower re-check of the SAME fields, kept here ONLY to pick the right `next:` sentence — never a second
 *  filtering decision (`recall` itself is the ONE place a record is admitted or dropped). */
function isQualified(query: unknown): boolean {
  if (typeof query !== "object" || query === null) return false
  const q = query as Record<string, unknown>
  return (
    typeof q["owner"] === "string" ||
    q["kind"] === "task" ||
    q["kind"] === "pr" ||
    q["kind"] === "project" ||
    q["kind"] === "logbook" ||
    typeof q["taskId"] === "string" ||
    typeof q["prId"] === "string"
  )
}

/** The `next:` sentence, honest about WHY a result is empty — an unqualified query and a qualified-but-empty
 *  one are two different facts, and the WRONG one was reported here until this was measured (a real
 *  `--kind logbook` recall against an empty log printed "recall is explicit… pass a selector" — advice the
 *  caller had already followed). */
function recallNext(records: readonly MemoryRecord[], query: unknown): string {
  if (records.length === 0) {
    return isQualified(query)
      ? "no matching records for this query — the durable log holds nothing that matches yet"
      : "no matching records — recall is explicit (MEM-4b): pass at least one of owner/kind/taskId/prId"
  }
  return `${records.length} matching record(s) — task/pr/logbook memory is never auto-injected; this is the sole general read path for it (the MEM-13 re-spawn push is separate)`
}

/**
 * The SHARED recall verdict builder — identical `query` over the SAME `recall` door yields a
 * byte-identical `Verdict`, so the CLI and the MCP transport cannot diverge. TOTAL: `recall` itself never
 * throws (an unrecognised query narrows to `{}` and matches nothing), so this never fails closed on input.
 */
export function memoryRecallVerdict(
  recall: (query: unknown) => readonly MemoryRecord[],
  query: unknown,
): Verdict<readonly MemoryRecord[]> {
  const data = recall(query)
  const guidance: Guidance = { next: recallNext(data, query), invariant: RECALL_INVARIANT }
  return { ok: true, guidance, data }
}

// ── header (MEM-1/4/7) ──────────────────────────────────────────────────────────────────────────────────

const HEADER_INVARIANT =
  "MEM-1/4/7: atlas-memory-header is the running-turn header for the composed actor — awareness + orientation pass through unchanged (shared, derived elsewhere), rules is the seat's OWN top project entries by effective frecency; task/pr/logbook are structurally excluded (no field on TurnHeader) — MEM-4"

/**
 * The SHARED turn-header verdict builder — a THUNK the composition root closes over its own repo + actor,
 * so the CLI and the MCP transport read the SAME durable state. TOTAL: the composed thunk itself never
 * throws (a fresh/empty log folds to an empty header, never an error).
 */
export function memoryHeaderVerdict(header: () => TurnHeader): Verdict<TurnHeader> {
  const data = header()
  const guidance: Guidance = {
    next: `${data.rules.length} project rule(s) injected this turn — recall task/pr/logbook explicitly with atlas-memory-recall`,
    invariant: HEADER_INVARIANT,
  }
  return { ok: true, guidance, data }
}

// ── awareness (MEM-11/11g/12) ───────────────────────────────────────────────────────────────────────────

const AWARENESS_INVARIANT =
  "MEM-11/12: atlas-memory-awareness is the SHARED, byte-identical-across-members Awareness slab — assembled fresh from the real Atlas root each read (taste + constitution from real bytes on disk; mission/terrain/ontology render UN-SEEDED when no ratified source exists — never fabricated)"

/** The SHARED awareness verdict builder — a THUNK the composition root closes over its own repo. TOTAL:
 *  `rollup` over a real root never throws (an absent facet renders UN-SEEDED, not an error). */
export function memoryAwarenessVerdict(awareness: () => Awareness): Verdict<Awareness> {
  const data = awareness()
  const guidance: Guidance = {
    next: "the SHARED slab — byte-identical for every seat reading the same repo state; UN-SEEDED facets have no ratified source yet",
    invariant: AWARENESS_INVARIANT,
  }
  return { ok: true, guidance, data }
}

// ── orientation (MEM-6) ─────────────────────────────────────────────────────────────────────────────────

const ORIENTATION_INVARIANT =
  "MEM-6: atlas-memory-orientation is the DERIVED, SHARED, byte-identical-across-members Orientation slab — milestone/state labels about the RUN, owned by nobody, folded from the tracked orientation log; never a written memory, so it cannot rot"

/** The SHARED orientation verdict builder — a THUNK the composition root closes over its own repo. TOTAL:
 *  a missing/empty tracked log folds to an empty Orientation, never an error. */
export function memoryOrientationVerdict(orientation: () => Orientation): Verdict<Orientation> {
  const data = orientation()
  const guidance: Guidance = {
    next: "the SHARED, derived slab — byte-identical for every member; goal reads empty until a ratified DEFINE artifact exists",
    invariant: ORIENTATION_INVARIANT,
  }
  return { ok: true, guidance, data }
}
