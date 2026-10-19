export * as SessionRunner from "./index"

import type { LLMError } from "@orchestra/llm"
import { Context, Effect } from "effect"
import { SessionSchema } from "../schema"
import type { ContextSnapshotDecodeError, MessageDecodeError } from "../error"
import { SessionRunnerModel } from "./model"
import type { SystemContext } from "../../system-context/index"
import type { ToolOutputStore } from "../../tool-output-store"
import type { SessionSubagentModels } from "../subagent-models"

export type RunError =
  | LLMError
  | SessionRunnerModel.Error
  | MessageDecodeError
  | ContextSnapshotDecodeError
  | SystemContext.InitializationBlocked
  | ToolOutputStore.Error
  | SessionSubagentModels.Error

/** Error message recorded on an assistant turn the runner stopped because its drain was interrupted. */
export const INTERRUPTED_TURN = "Provider turn interrupted"

/** Runs one local continuation from already-recorded Session history. */
export interface Interface {
  /** Drains eligible durable work. Explicit runs perform one provider attempt even when no work is eligible. */
  readonly run: (input: {
    readonly sessionID: SessionSchema.ID
    readonly force: boolean
  }) => Effect.Effect<void, RunError>
  /** Summarizes the history now, as a manual compaction; false when there was nothing to summarize. */
  readonly compact: (sessionID: SessionSchema.ID) => Effect.Effect<boolean, RunError>
  /** One tool-less completion of `prompt` after the Session's history. Nothing is recorded. */
  readonly generate: (input: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: string
  }) => Effect.Effect<string, RunError>
  /** Runs a person's shell command in the Location and records it with its output. */
  readonly shell: (input: {
    readonly sessionID: SessionSchema.ID
    readonly command: string
    readonly callID?: string
  }) => Effect.Effect<void>
  /** Records a skill's instructions as synthetic context; false when the Location has no such skill. */
  readonly skill: (input: { readonly sessionID: SessionSchema.ID; readonly skill: string }) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionRunner") {}

export { ExecutionHost } from "./execution-host"
