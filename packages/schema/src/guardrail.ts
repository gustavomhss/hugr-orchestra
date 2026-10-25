export * as Guardrail from "./guardrail"

import { Schema } from "effect"

// Guardrail: declarative CI guard rules (script/guards) judged against a change. These shapes mirror the
// engine's `--rules` and `--json` output, which is the contract the app screen is built on.
export const Severity = Schema.Literals(["gate", "warn"]).annotate({ identifier: "Guardrail.Severity" })
export type Severity = typeof Severity.Type

export const Group = Schema.Literals([
  "tests",
  "silenced",
  "secrets",
  "leftovers",
  "dependencies",
  "workflows",
  "hygiene",
]).annotate({ identifier: "Guardrail.Group" })
export type Group = typeof Group.Type

export const RuleKind = Schema.Literals(["added-lines", "changed-paths", "line-balance"]).annotate({
  identifier: "Guardrail.RuleKind",
})
export type RuleKind = typeof RuleKind.Type

// How a finding is cleared: fix the code, add a `guardrail-ignore` line, or get an approver's label.
export const ClearedBy = Schema.Literals(["fix", "ignore", "approval"]).annotate({ identifier: "Guardrail.ClearedBy" })
export type ClearedBy = typeof ClearedBy.Type

export const Rule = Schema.Struct({
  id: Schema.String,
  group: Group,
  severity: Severity,
  kind: RuleKind,
  message: Schema.String,
  // Plain-language text for the screen; null until the rule has one.
  summary: Schema.NullOr(Schema.String),
  positive: Schema.Array(Schema.String),
  negative: Schema.Array(Schema.String),
  paths: Schema.Array(Schema.String),
  clearedBy: ClearedBy,
}).annotate({ identifier: "Guardrail.Rule" })
export interface Rule extends Schema.Schema.Type<typeof Rule> {}

export const ErrorKind = Schema.Literals([
  "no-repository",
  "base-not-found",
  "no-rules",
  "rules-invalid",
  "other",
]).annotate({ identifier: "Guardrail.ErrorKind" })
export type ErrorKind = typeof ErrorKind.Type

export const RunError = Schema.Struct({ kind: ErrorKind, message: Schema.String }).annotate({
  identifier: "Guardrail.RunError",
})
export interface RunError extends Schema.Schema.Type<typeof RunError> {}

export const Rules = Schema.Struct({
  rules: Schema.Array(Rule),
  errors: Schema.Array(RunError),
}).annotate({ identifier: "Guardrail.Rules" })
export interface Rules extends Schema.Schema.Type<typeof Rules> {}

export const Finding = Schema.Struct({
  rule: Schema.String,
  severity: Severity,
  path: Schema.String,
  line: Schema.NullOr(Schema.Int),
  message: Schema.String,
  excerpt: Schema.NullOr(Schema.String),
  // [start, end) inside `excerpt`.
  match: Schema.NullOr(Schema.Tuple([Schema.Int, Schema.Int])),
}).annotate({ identifier: "Guardrail.Finding" })
export interface Finding extends Schema.Schema.Type<typeof Finding> {}

export const Report = Schema.Struct({
  base: Schema.NullOr(Schema.String),
  bootstrap: Schema.Boolean,
  rules: Schema.Int,
  files: Schema.Int,
  // Gate findings first, then by path and line.
  findings: Schema.Array(Finding),
  errors: Schema.Array(RunError),
  approved: Schema.Array(Schema.String),
  touchesGuards: Schema.Boolean,
}).annotate({ identifier: "Guardrail.Report" })
export interface Report extends Schema.Schema.Type<typeof Report> {}

export const RunInput = Schema.Struct({
  // Target branch to judge the change against; the engine defaults to origin/dev.
  base: Schema.optional(Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))),
}).annotate({ identifier: "Guardrail.RunInput" })
export interface RunInput extends Schema.Schema.Type<typeof RunInput> {}

// The engine could not be started at all, as opposed to running and reporting `errors`.
export const EngineErrorKind = Schema.Literals(["no-engine", "no-bun", "failed", "unreadable"]).annotate({
  identifier: "Guardrail.EngineErrorKind",
})
export type EngineErrorKind = typeof EngineErrorKind.Type
