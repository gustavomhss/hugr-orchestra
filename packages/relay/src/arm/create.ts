export * as ArmCreate from "./create"

import { Effect, Schema } from "effect"
import type { RelayArm } from "@opencode-ai/schema/relay-arm"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"
import type { ArmState } from "./state"

// Arm creation as an idempotent PUT (WP5).

export class Conflict extends Schema.TaggedErrorClass<Conflict>()("ArmCreate.Conflict", { token: Schema.String }) {}

export interface Input {
  readonly token: RelayArm.Token
  readonly sprint: RelaySprint.Sprint
  readonly meta: RelayArm.Meta
  // Bound as `agent_id` at creation, so the first stop cannot claim the arm for another agent.
  readonly agentID?: string
}

/**
 * Writes sprint.json and meta.json (compact JSON, no trailing LF). The same body again is `unchanged` (HTTP 200);
 * a different body under the same token is a Conflict (HTTP 409) and writes nothing.
 */
export const create = (
  input: Input,
): Effect.Effect<"created" | "unchanged", Conflict | ArmState.StateError, ArmState.Store> =>
  Effect.die("not implemented")
