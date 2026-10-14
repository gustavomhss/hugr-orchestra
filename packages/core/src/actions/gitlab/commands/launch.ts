export * as GitLabCommandLaunch from "./launch"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandNative } from "./native"
import { GitLabCommandInputs } from "./inputs"
import { GitLabCommandShared } from "./shared"

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.launch")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const command = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["workflowID", "ref", "path"], ["ref"])
      const value = intent.kind === "pipeline.trigger"
        ? GitLabCommandShared.decode(binding, Actions.TriggerPipelineCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabDispatch, payload)
      if (value.ref !== intent.target.ref) throw GitLabCommandShared.error(binding, "invalid_input", "GitLab execute ref differs from its admitted ref")
      return value
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const sha = yield* native.ref(binding, command.ref)
    yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.commit(binding, intent, sha, command.ref)
      GitLabCommandNative.variables(binding, project, level, command.variables !== undefined && Object.keys(command.variables).length > 0)
      if (intent.target.path !== undefined && intent.target.path !== ActionsGitLabNative.configPath(project))
        throw GitLabCommandShared.error(binding, "source_conflict", "GitLab admitted CI path differs from native project configuration")
    })
    const path = ActionsGitLabNative.configPath(project)
    if (command.inputs !== undefined || intent.expected?.sourceVersion !== undefined || intent.target.path !== undefined) {
      if (!path || !ActionsGitLabNative.localPath(path)) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab explicit input/source preconditions require resolved local CI configuration")
      const source = yield* GitLabCommandShared.source(binding, intent, input.reader, sha, path)
      if (!source) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab launch did not establish ref-bound source")
      yield* GitLabCommandInputs.check(binding, input.transport, source, command.inputs)
    }
    const body = yield* ActionsGitLabNative.checked(binding, () => {
      if ("token" in command) return GitLabCommandShared.json(binding, { ref: command.ref, token: command.token,
        ...(command.variables === undefined ? {} : { variables: command.variables }), ...(command.inputs === undefined ? {} : { inputs: command.inputs }) })
      if (command.variables && new Set(command.variables.map((variable) => variable.key)).size !== command.variables.length)
        throw GitLabCommandShared.error(binding, "invalid_input", "GitLab pipeline variables must have distinct native keys")
      return GitLabCommandShared.json(binding, { ref: command.ref,
        ...(command.variables === undefined ? {} : { variables: command.variables.map((variable) => ({ key: variable.key, value: variable.value,
          ...(variable.variable_type === undefined ? {} : { variable_type: variable.variable_type }) })) }),
        ...(command.inputs === undefined ? {} : { inputs: command.inputs }) })
    })
    return { request: { method: "POST", path: `${ActionsGitLabNative.projectPath(binding)}/${"token" in command ? "trigger/pipeline" : "pipeline"}`, body },
      statuses: [201], acknowledge: (response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.pipeline(binding, response.data,
        { commit: sha, ref: command.ref, sources: "token" in command ? ["trigger", "pipeline"] : ["api"] })) }
  })
}
