export * as ArmLoad from "./load"

import { Effect, Schema } from "effect"
import type { RelayArm } from "@opencode-ai/schema/relay-arm"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"

// The strict loader for arm files and the Arsenal state file (WP5): no symlink, at most 512 KB, size and mtime
// unchanged across the read, then a schema decode.

export const MAX_BYTES = 512 * 1024

export class LoadError extends Schema.TaggedErrorClass<LoadError>()("ArmLoad.LoadError", {
  path: Schema.String,
  reason: Schema.Literals(["missing", "symlink", "overflow", "changed", "invalid"]),
}) {}

export const bytes = (path: string): Effect.Effect<Uint8Array, LoadError> => Effect.die("not implemented")

export interface Loaded {
  readonly sprint: RelaySprint.Sprint
  // The exact sprint.json bytes; the engine never re-encodes a loaded plan.
  readonly sprintBytes: Uint8Array
  readonly meta: RelayArm.Meta
}

export const arm = (dir: string): Effect.Effect<Loaded, LoadError> => Effect.die("not implemented")
