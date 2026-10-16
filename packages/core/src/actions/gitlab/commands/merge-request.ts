export * as GitLabCommandMergeRequest from "./merge-request"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandNative } from "./native"
import { GitLabCommandInputs } from "./inputs"
import { GitLabCommandShared } from "./shared"

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.mergeRequest")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const iid = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["resourceID", "workflowID", "ref", "path"], ["resourceID"])
      GitLabCommandShared.decode(binding, Actions.MergeRequestCommand.fields.input, payload)
      return ActionsGitLabNative.nativeID(binding, intent.target.resourceID ?? "", "merge request IID")
    })
    const project = yield* native.project(binding)
    yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const path = `${ActionsGitLabNative.projectPath(binding)}/merge_requests/${iid}`
    const response = yield* native.get(binding, path)
    const mr = yield* ActionsGitLabNative.checked(binding, () => {
      const value = GitLabCommandShared.native(binding, GitLabCommandNative.MergeRequest, response.data)
      if (String(value.iid) !== iid || String(value.project_id) !== binding.projectID || String(value.target_project_id) !== binding.projectID)
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab merge request IID does not belong to the admitted native project")
      if (value.state !== "opened") throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab merge request pipeline requires an open native merge request")
      if (String(value.source_project_id) !== binding.projectID)
        throw GitLabCommandShared.error(binding, "source_unresolved", "Fork merge request execution requires separate native source-project placement proof")
      GitLabCommandShared.commit(binding, intent, value.sha, value.source_branch)
      return value
    })
    const configured = ActionsGitLabNative.configPath(project)
    if (intent.target.path !== undefined && intent.target.path !== configured)
      return yield* GitLabCommandShared.error(binding, "source_conflict", "GitLab admitted CI source path differs from native configuration")
    if (intent.expected?.sourceVersion !== undefined || intent.target.path !== undefined) {
      if (!configured || !ActionsGitLabNative.localPath(configured))
        return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab explicit MR source preconditions require resolved local CI configuration")
      const source = yield* GitLabCommandShared.source(binding, intent, input.reader, mr.sha, configured)
      if (!source) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab MR pipeline did not prove head source")
      yield* GitLabCommandInputs.check(binding, input.transport, source)
    }
    // https://docs.gitlab.com/api/merge_requests/#create-merge-request-pipeline
    return { request: { method: "POST", path: `${path}/pipelines` }, statuses: [201],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => {
        const value = GitLabCommandShared.native(binding, ActionsGitLabNative.Pipeline, response.data, true)
        if (value.ref !== `refs/merge-requests/${iid}/head` && value.ref !== `refs/merge-requests/${iid}/merge`)
          throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab MR launch did not return the exact native merge request ref", true)
        return GitLabCommandShared.pipeline(binding, response.data, { sources: ["merge_request_event"],
          commit: value.ref.endsWith("/head") ? mr.sha : intent.expected?.commit })
      }) }
  })
}
