export * as HookEvaluate from "./evaluate"

import type { RelayHook } from "@opencode-ai/schema/relay-hook"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"

// Pure hook evaluation (WP9): which installed actions fire for one invocation, in what order. Core enforces them
// (WP11); nothing here grants anything.

export interface Invocation {
  readonly operation: RelayHook.Operation
  readonly timing: RelayHook.Timing
  // Absent for session triggers.
  readonly tool?: string
  // Project-relative canonical paths; `apply_patch` matches when any path matches.
  readonly paths: ReadonlyArray<string>
  readonly command?: string
}

export interface Step {
  readonly installID: string
  readonly nodeID: string
  readonly action: RelayLedger.HookAction
  readonly message: string
  // Verify only.
  readonly check?: string
  // Verify only: the steps on its Fail port, when one is connected.
  readonly onFail?: ReadonlyArray<Step>
}

/**
 * Enabled installs in install order; each graph walked from its trigger, a condition taking its Yes or No port, actions
 * in edge order. A Verify's Pass port continues the walk; its Fail port runs only when the check fails.
 */
export const plan = (installs: ReadonlyArray<RelayHook.Install>, invocation: Invocation): ReadonlyArray<Step> => {
  throw new Error("not implemented")
}

// `**` crosses directories in path patterns; other fields use plain wildcards.
export const matches = (field: "path" | "tool" | "command" | "event", pattern: string, value: string): boolean => {
  throw new Error("not implemented")
}
