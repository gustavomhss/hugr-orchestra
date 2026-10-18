export * as GitLabCommandRuns from "./runs"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandNative } from "./native"
import { GitLabCommandShared } from "./shared"

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.run")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const name = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["runID", "workflowID", "ref", "path"], ["runID"])
      ActionsGitLabNative.nativeID(binding, intent.target.runID ?? "", "pipeline ID")
      if (intent.kind === "run.rename") return GitLabCommandShared.decode(binding, Actions.RenameCommand.fields.input, payload).name
      const value = intent.kind === "run.retry" ? GitLabCommandShared.decode(binding, Actions.RetryCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabCommand.fields.input, payload)
      if (value.provider !== "gitlab") throw GitLabCommandShared.error(binding, "invalid_input", "GitLab command provider does not match this binding")
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, intent.kind === "run.delete" ? 50 : 30))
    if (intent.kind === "run.rename") {
      const observation = yield* native.metadata(binding)
      // https://gitlab.com/gitlab-org/gitlab/-/blob/v18.4.0-ee/lib/api/ci/pipelines.rb
      yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [16, 6], "pipeline name metadata"))
    }
    const run = yield* input.reader.run(binding, intent.target.runID ?? "")
    yield* ActionsGitLabNative.checked(binding, () => {
      if (run.id !== intent.target.runID || run.bindingID !== binding.id || run.workflowID !== ActionsGitLabNative.workflowID(binding))
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab selected pipeline belongs to a different native target")
      GitLabCommandShared.commit(binding, intent, run.commit, run.ref)
      if (intent.kind === "run.cancel") GitLabCommandNative.cancellation(binding, project, level)
    })
    yield* GitLabCommandShared.source(binding, intent, input.reader, run.commit)
    const path = `${ActionsGitLabNative.projectPath(binding)}/pipelines/${run.id}`
    if (intent.kind === "run.delete") return { request: { method: "DELETE", path }, statuses: [204],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => {
        if (response.data !== null) throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab deletion did not return an exact native empty acknowledgement", true)
        return { runID: run.id }
      }) }
    return { request: { method: name === undefined ? "POST" : "PUT", path: `${path}/${name === undefined ? intent.kind === "run.retry" ? "retry" : "cancel" : "metadata"}`,
      ...(name === undefined ? {} : { body: { name } }) }, statuses: intent.kind === "run.retry" ? [200, 201] : [200],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.pipeline(binding, response.data,
        { id: run.id, commit: run.commit, sources: [run.event], ref: run.ref, name })) }
  })
}
