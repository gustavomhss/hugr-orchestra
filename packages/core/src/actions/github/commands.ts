export * as ActionsGitHubCommands from "./commands"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../contract"
import { GitHubCommandCommon } from "./commands/common"
import { GitHubWorkflowCommands } from "./commands/workflow"
import { GitHubRunCommands } from "./commands/run"
import { GitHubJobCommands } from "./commands/job"

export function make(services: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }): ActionsContract.Commands {
  return { perform: Effect.fn("ActionsGitHubCommands.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const frozen = yield* GitHubCommandCommon.capture(binding, intent, payload)
    if (frozen.intent.kind === "workflow.dispatch") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.GitHubDispatch, frozen.payload))
      return yield* GitHubWorkflowCommands.dispatch(services, frozen.binding, frozen.intent, input)
    }
    if (frozen.intent.kind === "workflow.enable" || frozen.intent.kind === "workflow.disable") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.WorkflowStateCommand.fields.input, frozen.payload))
      if (input.enabled !== (frozen.intent.kind === "workflow.enable"))
        return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Workflow state payload conflicts with the admitted operation")
      return yield* GitHubWorkflowCommands.state(services, frozen.binding, frozen.intent, input.enabled)
    }
    if (frozen.intent.kind === "run.retry" || frozen.intent.kind === "run.retryFailed") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.RetryCommand.fields.input, frozen.payload))
      if (input.provider !== "github" || input.mode !== (frozen.intent.kind === "run.retry" ? "all" : "failed"))
        return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Retry mode or provider conflicts with the admitted operation")
      return yield* GitHubRunCommands.perform(services, frozen.binding, frozen.intent, input.enableDebugLogging)
    }
    if (frozen.intent.kind === "job.retry") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.JobRetryCommand.fields.input, frozen.payload))
      if (input.provider !== "github") return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Job retry belongs to another provider")
      return yield* GitHubJobCommands.retry(services, frozen.binding, frozen.intent, input.enableDebugLogging)
    }
    yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.GitHubCommand.fields.input, frozen.payload))
    return yield* GitHubRunCommands.perform(services, frozen.binding, frozen.intent)
  }) }
}
