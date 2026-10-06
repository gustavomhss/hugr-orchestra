export * as GateControl from "./control"

import { Effect, Option, Schema } from "effect"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"
import type { GateShell } from "./shell"
import type { JudgeConfig } from "../judge/config"

// The gate core (`relay_run_checklist` and its helpers in lib/relay-gate.sh; WP3).

// A plan defect that stops the evaluation before the control runs: an invalid control ID or assertion, or a
// checklist that is neither an array nor null. Earlier verdicts stay recorded.
export class PlanError extends Schema.TaggedErrorClass<PlanError>()("GateControl.PlanError", {
  message: Schema.String,
}) {}

export interface ChecklistInput {
  readonly sprint: RelaySprint.Sprint
  readonly index: number
  readonly workdir: string
  // The ref the WP was entered at; absent or invalid makes every `diff` control `judge:unavailable(no-diff)`.
  readonly baseRef?: string
  // `${name}` values for context and scope paths, and the check environment.
  readonly params: Readonly<Record<string, string>>
}

/** One graded control, before the caller adds `ts`, `arm`, `wp`, `i`, `macro` and `kind`. */
export interface Verdict {
  readonly item: string
  readonly assert: string
  readonly verdict: "pass" | "fail"
  readonly graded_by: RelayLedger.GradedBy
  readonly oracle: RelayLedger.Oracle
  readonly origin: string
  readonly scope?: string
  readonly artifact?: string
}

export interface ChecklistResult {
  // Failing control IDs in declared order: deterministic failures, blocking judge failures and named plan failures.
  readonly failing: ReadonlyArray<string>
  readonly verdicts: ReadonlyArray<Verdict>
}

/**
 * Runs the selected WP's checklist in declared order without short-circuiting. A nonempty `cmd` wins over `judge`;
 * a `host_check` control is graded by the arm, not here. `record` runs after each verdict and before the next control,
 * so a failed record stops the checklist like `ledger_item || return 1`.
 */
export const run = <E, R>(
  input: ChecklistInput,
  record: (verdict: Verdict) => Effect.Effect<void, E, R>,
): Effect.Effect<ChecklistResult, PlanError | E, R | GateShell.Service | GateShell.Git | JudgeConfig.Service> =>
  Effect.die("not implemented")

// `${name}` from `params` by substitution, never by shell evaluation; unset names stay literal.
export const expandParams = (text: string, params: Readonly<Record<string, string>>): string => {
  throw new Error("not implemented")
}

// The oracle sha: the command, or the criterion plus ` :: <space-joined paths>` before expansion.
export const oracleSha = (text: string): string => {
  throw new Error("not implemented")
}

// Explicit `origin`, otherwise `policy:<policy>`, otherwise `sprint`.
export const controlOrigin = (control: RelaySprint.Control): string => {
  throw new Error("not implemented")
}

/**
 * The artifact digest of a judge scope: per space-split path `<path>:<sha256>\n`, or `<path>:absent\n` when it is not
 * a readable file, hashed once more. None for an empty scope.
 */
export const artifactSha = (paths: string, workdir: string): Effect.Effect<Option.Option<string>> =>
  Effect.die("not implemented")
