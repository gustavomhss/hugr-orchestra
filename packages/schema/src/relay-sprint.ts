export * as RelaySprint from "./relay-sprint"

import { Schema } from "effect"

// Relay plan files (sprint.json). Field names are the Python Relay's, byte for byte. Relay files are validated,
// never re-encoded: the engine keeps the original bytes, so every struct here preserves unknown keys
// (`type`, `model`, `rubric`, `output_contract`, … are ignored by the runtime but stay on disk).
const preserve = { parseOptions: { onExcessProperty: "preserve" } } as const

// SPEC §2: a WP ID or control ID is a nonempty string without NUL (bash cannot carry NUL).
export const NonEmptyNulFree = Schema.String.check(Schema.isPattern(/^[^\u0000]+$/))
export type NonEmptyNulFree = typeof NonEmptyNulFree.Type

// Arsenal identifier (host check IDs, completion contract IDs).
export const Id = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/))
export type Id = typeof Id.Type

export const Hex64 = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
export type Hex64 = typeof Hex64.Type

/**
 * One checklist control. `cmd`, `judge` and `paths` stay unrefined on purpose: a non-string or NUL-carrying value is
 * not a load error but a named runtime failure (`unavailable(invalid-command)`, `judge:unavailable(invalid-criterion)`,
 * `judge:unavailable(invalid-scope)`), exactly as `relay_run_checklist` records it.
 */
export const Control = Schema.Struct({
  id: NonEmptyNulFree,
  assert: Schema.optionalKey(Schema.NullOr(Schema.String)),
  cmd: Schema.optionalKey(Schema.NullOr(Schema.String)),
  judge: Schema.optionalKey(Schema.NullOr(Schema.String)),
  blocking: Schema.optionalKey(Schema.Boolean),
  diff: Schema.optionalKey(Schema.Boolean),
  context: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
  origin: Schema.optionalKey(Schema.String),
  policy: Schema.optionalKey(Schema.String),
  // TS-only, additive: an Arsenal host-check control, graded by a registered host callback instead of bash (§6).
  host_check: Schema.optionalKey(Id),
}).annotate({ identifier: "RelaySprint.Control", ...preserve })
export interface Control extends Schema.Schema.Type<typeof Control> {}

// `human` is accepted by the compiler and lint but unsupported by the arm: evaluating it records `unknown-kind`.
export const Kind = Schema.Literals(["execute", "gate", "review", "inject", "human"])
export type Kind = typeof Kind.Type

// Legacy CLI/benchmark acceptance commands. The arm ignores them.
export const Dod = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  cmd: Schema.String,
}).annotate({ identifier: "RelaySprint.Dod", ...preserve })
export interface Dod extends Schema.Schema.Type<typeof Dod> {}

export const WorkPackage = Schema.Struct({
  id: NonEmptyNulFree,
  title: Schema.optionalKey(Schema.String),
  macro: Schema.optionalKey(Schema.NullOr(Schema.String)),
  kind: Schema.optionalKey(Kind),
  instructions: Schema.optionalKey(Schema.String),
  self_check: Schema.optionalKey(Schema.Array(Schema.String)),
  // Missing, null and [] all mean "no current controls" (SPEC §2).
  checklist: Schema.optionalKey(Schema.NullOr(Schema.Array(Control))),
  dod: Schema.optionalKey(Schema.NullOr(Schema.Array(Dod))),
  // `inject` payload: `file` (relative to the workdir) wins over inline `text`.
  file: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelaySprint.WorkPackage", ...preserve })
export interface WorkPackage extends Schema.Schema.Type<typeof WorkPackage> {}

export const Macro = Schema.Struct({
  id: Schema.String,
  title: Schema.optionalKey(Schema.String),
  instructions: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelaySprint.Macro", ...preserve })
export interface Macro extends Schema.Schema.Type<typeof Macro> {}

/**
 * A Relay plan. Defaults are applied by the engine, never written back: absent `retry_budget` means 3, absent `gen`
 * means 0, and a `gen` that is not a nonnegative integer also resolves to 0 when stamped into the ledger.
 */
export const Sprint = Schema.Struct({
  brief: Schema.optionalKey(Schema.String),
  gen: Schema.optionalKey(Schema.Number),
  // Compared with bash `-ge`, so only integers ever ran.
  retry_budget: Schema.optionalKey(Schema.Int),
  macros: Schema.optionalKey(Schema.Array(Macro)),
  work_packages: Schema.Array(WorkPackage),
}).annotate({ identifier: "RelaySprint.Sprint", ...preserve })
export interface Sprint extends Schema.Schema.Type<typeof Sprint> {}

export const DEFAULT_RETRY_BUDGET = 3
