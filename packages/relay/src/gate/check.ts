export * as GateCheck from "./check"

import { Effect, Schema } from "effect"
import type { RelayArm } from "@opencode-ai/schema/relay-arm"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"
import type { GateShell } from "./shell"
import type { GateControl } from "./control"
import type { JudgeConfig } from "../judge/config"

// `relay-gate check` (WP3): the dry "Check now" and the hook verify precondition. It grades the selected WP's
// checklist and never charges retries, advances or records a verdict.

export class Busy extends Schema.TaggedErrorClass<Busy>()("GateCheck.Busy", { lock: Schema.String }) {}

export interface Input {
  readonly sprint: RelaySprint.Sprint
  readonly workdir: string
  // A named position (exact ID first, then the suffix after the first dot) overrides `counter`.
  readonly position?: string
  readonly counter?: number
  // An explicit "" suppresses any fallback and makes diff controls unavailable.
  readonly baseRef?: string
  readonly params: Readonly<Record<string, string>>
  // A state directory whose `.run.lock` is held for the check; omitted for a document dry check.
  readonly stateDir?: string
}

export const check = (
  input: Input,
): Effect.Effect<
  RelayArm.CheckOutcome,
  Busy | GateControl.PlanError,
  GateShell.Service | GateShell.Git | JudgeConfig.Service
> => Effect.die("not implemented")
