export * as GateShell from "./shell"

import { Context, Duration, Effect, Schema } from "effect"

// The process boundary. The engine never spawns anything itself: core binds these ports to AppProcess and the
// ToolSafety sandbox (WP10). Checks run as `bash --noprofile --norc -o nounset -o pipefail -c <program>` in the
// workdir, stdin at EOF, output discarded, with only PATH, HOME, RELAY_* and the run's params in the environment.

export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("GateShell.Unavailable", {
  // missing: no bash or git; timeout: the process group was killed; spawn: the process could not start.
  reason: Schema.Literals(["missing", "timeout", "spawn"]),
}) {}

export interface RunInput {
  readonly program: string
  readonly cwd: string
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

export class Service extends Context.Service<Service, Interface>()("@opencode/relay/Shell") {}

export interface GitResult {
  readonly exitCode: number
  readonly stdout: Uint8Array
}

// Sandboxed git: no optional locks, fsmonitor off, a timeout and an output cap. Used for diffs and HEAD reads.
export interface GitInterface {
  readonly run: (cwd: string, args: ReadonlyArray<string>) => Effect.Effect<GitResult, Unavailable>
}

export class Git extends Context.Service<Git, GitInterface>()("@opencode/relay/Git") {}
