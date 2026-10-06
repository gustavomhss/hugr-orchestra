export * as ArmEvaluate from "./evaluate"

import { Effect } from "effect"
import type { RelayArm } from "@opencode-ai/schema/relay-arm"
import type { GateShell } from "../gate/shell"
import type { JudgeConfig } from "../judge/config"
import type { ArmState } from "./state"

/**
 * One stop of `bin/relay-arm-hook.sh` (WP6), byte for byte in the arm files and the ledger, minus the transcript
 * marker scan, the corpus archive and the environment cap preflight (now `blockCap`). Never fails: busy, refused and
 * defective arms are outcomes, and an evaluation that cannot complete is a `defect`, never a pass.
 */
export const evaluate = (
  input: RelayArm.EvaluateInput,
): Effect.Effect<
  RelayArm.Evaluation,
  never,
  ArmState.Store | GateShell.Service | GateShell.Git | JudgeConfig.Service
> => Effect.die("not implemented")

/**
 * Writes the `release` file of a parked arm. The next evaluation records `human-release` before consuming it, resets
 * that gate's retry, round and claim state and grades the same WP again; a release never waives a control.
 */
export const release = (
  token: RelayArm.Token,
  reason: string,
): Effect.Effect<void, ArmState.StateError | ArmState.Busy, ArmState.Store> => Effect.die("not implemented")
