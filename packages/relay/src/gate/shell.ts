export * as GateShell from "./shell"

import { Context, Duration, Effect, Schema } from "effect"

// The process boundary. The engine never spawns anything itself: core binds these ports to AppProcess and the
// ToolSafety sandbox (WP10). Checks run as `argv(program)` in the workdir, stdin at EOF, output discarded, with only
// PATH, HOME, RELAY_* and the run's params in the environment.

export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("GateShell.Unavailable", {
  // missing: no bash or git; timeout: the process group was killed; spawn: the process could not start.
  reason: Schema.Literals(["missing", "timeout", "spawn"]),
}) {}

/**
 * The one check invocation (R2). The Python gate runs `eval "$cmd"` in a subshell of a `set -euo pipefail` hook, as
 * an `if` condition: nounset and pipefail stay active and errexit is suppressed. A fresh non-errexit bash with both
 * options is the same program semantics. BASH_ENV, ENV and SHELLOPTS must never reach this environment: a fresh bash
 * reads them at startup, which the hook's `eval` never did.
 */
export const argv = (program: string) =>
  ["bash", "--noprofile", "--norc", "-o", "nounset", "-o", "pipefail", "-c", program] as const

export interface RunInput {
  readonly program: string
  readonly cwd: string
  // The run's params; the port adds PATH, HOME and RELAY_*.
  readonly env: Readonly<Record<string, string>>
  readonly timeout?: Duration.Input
}

// Only the final status decides a verdict: `false; true` passes.
export interface RunResult {
  readonly exitCode: number
}

export interface Interface {
  readonly run: (input: RunInput) => Effect.Effect<RunResult, Unavailable>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/relay/Shell") {}

export interface GitResult {
  readonly exitCode: number
  readonly stdout: Uint8Array
}

// Sandboxed git: no optional locks, fsmonitor off, a timeout and an output cap. Used for diffs and HEAD reads.
export interface GitInterface {
  readonly run: (cwd: string, args: ReadonlyArray<string>) => Effect.Effect<GitResult, Unavailable>
}

export class Git extends Context.Service<Git, GitInterface>()("@orchestra/relay/Git") {}
