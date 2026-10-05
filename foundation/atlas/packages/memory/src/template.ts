// @atlas/memory — src/template.ts  (WP-6.25-b.MEM · MEM-5)
//
// The templated-write gate, fail-closed (MEM-5). Every Memory write fills its per-type template — the four
// frozen entry types (types.ts) — or is REJECTED fail-closed: a missing required field NEVER persists (0
// free prose), and prose spilling OUTSIDE a type's fixed template keys is likewise rejected. The template is
// a FIXED field skeleton (structured, never a prose blob), so this file is the per-type VALIDATOR + the
// canonical STRUCTURED render (a `key=<json>` block over the template keys in fixed order, byte-stable).

import type { MemoryEntry, MemoryKind } from "./types.js"

// ── frozen templated-write surface, co-located here (was ref/template.ts) ──────────────────────────────────

/**
 * The fail-closed validation verdict (MEM-5). `valid:false` rejects the write — no invalid entry persists.
 *
 * [PINNED —error payload not frozen] the reference freezes "rejected fail-closed on any missing
 * field / over cap / out-of-section prose", not a concrete error shape; `reasons` is the honest minimum
 * (the failed checks), NOT an invented diagnostic record.
 */
export interface TemplateVerdict {
  readonly valid: boolean
  readonly reasons: readonly string[] // failed checks (missing field / over cap / out-of-section) — empty iff valid
}

export interface TemplateApi {
  /** Validate a write against its per-type required-field set + section bounds; rejects fail-closed on
   *  any missing field / over cap / out-of-section prose (MEM-5). Pure + total. (method-tags-mem:53) */
  validate(kind: MemoryKind, entry: MemoryEntry): TemplateVerdict

  /** The canonical STRUCTURED render of a templated entry — never a prose blob, byte-stable for equal
   *  input (the driftless discipline mirrored from the pack/invariant render).
   *
   *  [PINNED —exact render format not frozen] The reference pins "structured, never prose" but freezes
   *  no concrete serialization; transcribed as `string` (a canonical structured line/block), NOT an
   *  invented layout. */
  render(kind: MemoryKind, entry: MemoryEntry): string
}

// re-export the entry vocabulary the tests build fixtures over (barrel wired at SEAL — test imports src).
export type {
  MemoryEntry,
  MemoryKind,
  LogbookEntry,
  TaskMemoryEntry,
  PrMemoryEntry,
  ProjectMemoryEntry,
  MemoryRecord,
  MemoryStore,
  MemberId,
  Ref,
} from "./types.js"

// ── the per-type templates (the frozen entry field skeletons — types.ts) ──────────────────────────────────

/** The REQUIRED fields per Memory type — a write missing any is rejected fail-closed (MEM-5). */
const REQUIRED: Record<MemoryKind, readonly string[]> = {
  project: ["rule", "scope", "frecency"],
  task: ["taskId", "attempted", "failedWith", "stoppedAt", "lesson"],
  pr: ["prId", "decisions", "reviewOutcomes", "knowledgeDelta"],
  logbook: ["prId", "at", "territories", "shipped", "decisions", "tradeoffs", "risks", "openThreads", "links"],
}

/** The OPTIONAL fields per type — present in the template, never required. */
const OPTIONAL: Record<MemoryKind, readonly string[]> = {
  project: ["grounding"],
  task: ["ref"],
  pr: ["ref"],
  logbook: [],
}

/** The full closed key set of a type's template = required ∪ optional. A key outside it is out-of-section. */
function templateKeys(kind: MemoryKind): ReadonlySet<string> {
  return new Set([...REQUIRED[kind], ...OPTIONAL[kind]])
}

// ── the DERIVED MemoryKind (ARCH-9 applied one layer down) ───────────────────────────────────────────────

/** The four types, in a fixed order so an ambiguous entry reports its candidates deterministically. */
const KINDS: readonly MemoryKind[] = ["project", "task", "pr", "logbook"]

/**
 * Raised when an entry's shape does not identify exactly one template — no candidate, or more than one.
 * Fail-closed: an entry the discriminator cannot name is never written under a guessed type.
 */
export class UndeterminedKindError extends Error {
  readonly candidates: readonly MemoryKind[]
  constructor(candidates: readonly MemoryKind[]) {
    super(
      candidates.length === 0
        ? "MEM-5 kind derivation: no template matches this entry (it satisfies no type\u2019s required keys, " +
            "or carries keys outside every template) \u2014 rejected, never written under a guessed type"
        : `MEM-5 kind derivation: entry matches MORE THAN ONE template (${candidates.join(", ")}) — the ` +
            "templates are no longer mutually exclusive, so the derivation is not sound; rejected",
    )
    this.name = "UndeterminedKindError"
    this.candidates = candidates
  }
}

/**
 * Derive an entry's `MemoryKind` from its SHAPE — the unique type whose required keys are all present and
 * whose template contains every key the entry carries.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A CONVENIENCE. `validate(kind, entry)` takes the type as a PARAMETER,
 * so before this the caller chose which template judged their own write. That is the confused deputy the
 * architecture reference forbids by name at the governance doors (ARCH-9: *"a gate-selecting field is
 * derived, never chosen"*), one layer down and in the same shape — `kind` selects `REQUIRED[kind]`, which
 * IS the gate. A caller could claim `project` for a logbook payload and be judged against three keys
 * instead of nine. `partition()` already derives the Memory-vs-Knowledge axis; this closes the other one,
 * so `put` now derives BOTH discriminants and the payload announces neither.
 *
 * SOUNDNESS IS CHECKED, NOT ASSUMED. The derivation is sound only while the four templates are mutually
 * exclusive under this predicate. That is a property of the data, not a wish, so a tie is an ERROR rather
 * than a first-match win: if a future template makes two types simultaneously satisfiable, this fails
 * loudly instead of silently picking the one that happens to be listed first.
 *
 * Pure + total over any input — an untemplated value is inspected behind `Record<string, unknown>` and
 * yields the no-candidate error, never a throw from property access.
 */
export function memoryKindOf(entry: MemoryEntry): MemoryKind {
  // `Object.keys(null)` THROWS a TypeError, so totality is not free here — an explicit non-object guard is
  // what makes the sentence above true. A test asserted the null case and passed on the WRONG throw.
  if (entry === null || typeof entry !== "object") throw new UndeterminedKindError([])
  const rec = entry as unknown as Record<string, unknown>
  const keys = Object.keys(rec)
  const candidates = KINDS.filter((k) => {
    if (REQUIRED[k].some((r) => rec[r] === undefined)) return false
    const allowed = templateKeys(k)
    return keys.every((key) => allowed.has(key))
  })
  if (candidates.length !== 1) throw new UndeterminedKindError(candidates)
  return candidates[0] as MemoryKind
}

// ── MEM-5: the fail-closed validator ─────────────────────────────────────────────────────────────────────

// ── MEM-5: the per-field TYPE skeleton (the third check — see `validate`'s header) ───────────────────────

/**
 * The shapes this validator can decide. Each maps to one predicate in `matchesFieldType`; there is no
 * `any` member and no escape hatch, so adding a template field forces a decision about its type.
 *   - `string` / `finite-number` — a primitive. `finite-number` excludes `NaN` and `±Infinity` on purpose:
 *     `frecency` is a RANKING KEY, and the read door multiplies it (`stored * DECAY^age`,
 *     `adapter-io/src/memory-read.ts`), where a non-finite value propagates silently instead of failing.
 *   - `string[]` — an array whose every element is a string (an empty array satisfies it).
 *   - `ref` / `ref[]` — the `Ref = StructRef | string` union of types.ts, checked STRUCTURALLY (below).
 *   - `object[]` — an array of non-null objects. See the STATED BOUND on `knowledgeDelta`.
 */
type FieldType = "string" | "finite-number" | "string[]" | "ref" | "ref[]" | "object[]"

/** The frozen `kind`s of a `StructRef` (@atlas/contracts `struct.ts`), transcribed — not widened. */
const STRUCT_REF_KINDS: ReadonlySet<string> = new Set(["symbol", "block", "file", "repo", "project", "directory"])

/**
 * `Ref = StructRef | string` (types.ts). A bare pointer string satisfies it; so does a StructRef-shaped
 * object — `kind` from the frozen set, `qualifiedPath` a string, `subtreeHash` a string (the hash is a
 * branded string at the contracts layer; this validator checks the carrier, never re-derives the brand).
 * Anything else — a number, `null`, an array, an object missing a leg — is NOT a `Ref`.
 */
function isRef(v: unknown): boolean {
  if (typeof v === "string") return true
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false
  const r = v as Record<string, unknown>
  return (
    typeof r["kind"] === "string" &&
    STRUCT_REF_KINDS.has(r["kind"]) &&
    typeof r["qualifiedPath"] === "string" &&
    typeof r["subtreeHash"] === "string"
  )
}

/** The one predicate per `FieldType`. Total over any input — nothing here throws on a hostile value. */
function matchesFieldType(t: FieldType, v: unknown): boolean {
  switch (t) {
    case "string":
      return typeof v === "string"
    case "finite-number":
      return typeof v === "number" && Number.isFinite(v)
    case "string[]":
      return Array.isArray(v) && v.every((e) => typeof e === "string")
    case "ref":
      return isRef(v)
    case "ref[]":
      return Array.isArray(v) && v.every((e) => isRef(e))
    case "object[]":
      return Array.isArray(v) && v.every((e) => e !== null && typeof e === "object" && !Array.isArray(e))
  }
}

/**
 * The declared type of EVERY key in every template — required and optional alike, transcribed field by
 * field from the four frozen interfaces in types.ts. Keyed by kind, so the type checked is the one the
 * DERIVED kind selected, never one the payload asked for (the same ARCH-9 discipline `memoryKindOf` states).
 *
 * [STATED BOUND — `knowledgeDelta` is checked as `object[]`, not as `GroundedFact[]`.] `PrMemoryEntry`
 * types that field as `readonly GroundedFact[]`, a @atlas/knowledge structure with its own admission door
 * (`atlas-emit`) and its own ratifier. Re-deriving that judgement here would put a SECOND, weaker copy of
 * the knowledge contract inside the memory template — the thing this repository calls a second oracle. So
 * this gate decides exactly what it can decide from the template alone (the field is an array of objects,
 * never a string or a number), and says so, rather than implying a depth of checking it does not perform.
 * The same bound applies to `links: readonly Ref[]`, which IS fully decidable and therefore IS decided.
 */
const FIELD_TYPES: Record<MemoryKind, Readonly<Record<string, FieldType>>> = {
  project: { rule: "string", scope: "string", grounding: "ref", frecency: "finite-number" },
  task: {
    taskId: "string",
    attempted: "string[]",
    failedWith: "string[]",
    stoppedAt: "string",
    lesson: "string",
    ref: "ref",
  },
  pr: {
    prId: "string",
    decisions: "string[]",
    reviewOutcomes: "string[]",
    knowledgeDelta: "object[]",
    ref: "ref",
  },
  logbook: {
    prId: "string",
    at: "string",
    territories: "string[]",
    shipped: "string",
    decisions: "string",
    tradeoffs: "string",
    risks: "string",
    openThreads: "string",
    links: "ref[]",
  },
}

/**
 * Every template key carries a declared type, and every declared type names a real template key. Checked
 * HERE rather than trusted, because the two tables are maintained by hand and a key added to `REQUIRED`
 * without a `FIELD_TYPES` row would silently go UNTYPED — a hole with exactly the shape of the one this
 * table exists to close. A drift makes the module fail to load, so it cannot ship half-applied.
 */
for (const kind of KINDS) {
  const declared = new Set(Object.keys(FIELD_TYPES[kind]))
  for (const key of templateKeys(kind)) {
    if (!declared.has(key)) throw new Error(`template.ts: '${kind}.${key}' has no declared FIELD_TYPES row`)
  }
  for (const key of declared) {
    if (!templateKeys(kind).has(key)) throw new Error(`template.ts: FIELD_TYPES '${kind}.${key}' is not a template key`)
  }
}

/**
 * MEM-5 — validate a write against its per-type template. REJECT fail-closed on (a) any missing required
 * field, (b) any key OUTSIDE the fixed template (the logbook's out-of-section free-form prose), or (c) any
 * present key whose VALUE does not match the type its template declares. Pure + total — an untemplated
 * write is inspected defensively behind `Record<string, unknown>`; nothing throws.
 *
 * ── WHY (c) EXISTS, AND WHY ITS ABSENCE WAS NOT COSMETIC (measured, PR #293's M-axis) ─────────────────────
 * Before this, `validate` decided PRESENCE and KEY-MEMBERSHIP and nothing else. TypeScript did not cover
 * the gap: the one production caller of this gate is `adapter-io/src/memory-emit.ts`, whose CLI leg parses
 * ARBITRARY USER JSON and asserts it into `MemoryEntry` — a compile-time claim over a runtime value nobody
 * checked. The measured consequence, run against the shipped binary rather than a fixture: an entry with
 * `frecency: "999"` was ADMITTED, reached disk, and — because `stored * DECAY_PER_WAVE ** age` COERCES a
 * numeric string — was RANKED in the per-seat turn header alongside real rules. A non-numeric string in the
 * same field yields `NaN`, which compares false against the eviction floor and disappears without a word.
 *
 * ── AND WHY IT MAKES `template-invalid` REACHABLE AT ALL ─────────────────────────────────────────────────
 * `memoryKindOf` filters candidate templates by EXACTLY conditions (a) and (b). So while those were also
 * the whole of `validate`, every entry that could fail this gate had already failed derivation one gate
 * earlier: `template-invalid` was a DECLARED refusal that no input could reach, while the write door went
 * on advertising the name to users in its own guidance. Type checking is the first condition `validate`
 * decides that derivation does not, which is what gives gate 2 a non-empty domain. That property is
 * asserted end-to-end, not assumed — see the reachability test in `packages/memory/test`.
 */
export function validate(kind: MemoryKind, entry: MemoryEntry): TemplateVerdict {
  // `Object.keys(null)` throws, and this gate is documented as total; the same explicit non-object guard
  // `memoryKindOf` carries is what makes that sentence true when `validate` is called directly.
  if (entry === null || typeof entry !== "object") {
    return { valid: false, reasons: ["not an object: a template cannot be filled by a non-object value"] }
  }
  const rec = entry as unknown as Record<string, unknown>
  const reasons: string[] = []

  for (const key of REQUIRED[kind]) {
    if (rec[key] === undefined) reasons.push(`missing field: ${key}`)
  }
  const allowed = templateKeys(kind)
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) reasons.push(`out-of-section prose: ${key}`)
  }
  // (c) — types, over the keys that are BOTH present and in-template. An out-of-template key was already
  // reported above and has no declared type; a missing required key was too, and re-reporting it as a type
  // failure would name one defect twice.
  const types = FIELD_TYPES[kind]
  for (const key of Object.keys(rec)) {
    const declared = types[key]
    if (declared === undefined || rec[key] === undefined) continue
    if (!matchesFieldType(declared, rec[key])) {
      reasons.push(`wrong type: ${key} must be ${declared}`)
    }
  }
  return { valid: reasons.length === 0, reasons }
}

// ── MEM-5: the canonical STRUCTURED render (never a prose blob) ───────────────────────────────────────────

/**
 * The canonical structured render of a templated entry — the template keys (required, then optional) in a
 * FIXED order, each `key=<json>`, joined by newlines. Byte-stable for equal input (the driftless discipline
 * mirrored from the pack/invariant render), and structured — never a free-form prose blob.
 */
export function render(kind: MemoryKind, entry: MemoryEntry): string {
  const rec = entry as unknown as Record<string, unknown>
  const keys = [...REQUIRED[kind], ...OPTIONAL[kind]]
  return keys
    .filter((k) => rec[k] !== undefined)
    .map((k) => `${k}=${JSON.stringify(rec[k])}`)
    .join("\n")
}

// ── frozen-oracle conformance (compile-time differential-vs-oracle) ──────────────────────────────────────

/** Bind the built surface to the FROZEN `TemplateApi` (`validate` + `render`). */
export function makeTemplateApi(): TemplateApi {
  return { validate, render }
}

const _templateCheck: () => TemplateApi = makeTemplateApi
void _templateCheck
