export * as GitLabCommandJobs from "./jobs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandNative } from "./native"
import { GitLabCommandShared } from "./shared"

const ReturnedJob = Schema.Struct({ id: ActionsGitLabNative.ID, pipeline: Schema.optional(Schema.Struct({ id: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID,
  sha: Schema.optional(ActionsGitLabNative.SHA), ref: Schema.optional(Schema.NullOr(Schema.String)) })),
  commit: Schema.optional(Schema.Struct({ id: ActionsGitLabNative.SHA })), ref: Schema.optional(Schema.NullOr(Schema.String)),
  erased_at: Schema.optional(Schema.NullOr(Schema.String)) })

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.job")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const variables = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["jobID", "runID", "workflowID", "ref", "path"], ["jobID", "runID"])
      ActionsGitLabNative.nativeID(binding, intent.target.jobID ?? "", "job ID")
      ActionsGitLabNative.nativeID(binding, intent.target.runID ?? "", "pipeline ID")
      if (intent.kind === "job.play") return GitLabCommandShared.decode(binding, Actions.JobPlayCommand.fields.input, payload).variables
      const value = intent.kind === "job.retry" ? GitLabCommandShared.decode(binding, Actions.JobRetryCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabCommand.fields.input, payload)
      if (value.provider !== "gitlab") throw GitLabCommandShared.error(binding, "invalid_input", "GitLab command provider does not match this binding")
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const run = yield* input.reader.run(binding, intent.target.runID ?? "")
    const path = `${ActionsGitLabNative.projectPath(binding)}/jobs/${intent.target.jobID}`
    const selected = yield* native.get(binding, path).pipe(
      Effect.map((response) => ({ kind: "job", data: response.data })),
      Effect.catch((error) => error.kind === "not_found"
        ? findBridge(binding, input.reader, run.id, intent.target.jobID ?? "").pipe(Effect.map((job) => ({ kind: "bridge", data: job }))) : Effect.fail(error)),
    )
    if (selected.kind === "bridge") {
      if (intent.kind === "job.cancel" || intent.kind === "job.erase")
        return yield* GitLabCommandShared.error(binding, "capability_unavailable", "GitLab bridge jobs have no native build cancel/erase endpoint")
      const observation = yield* native.metadata(binding)
      yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [17, 0], "bridge job retry/play"))
    }
    const job = yield* ActionsGitLabNative.checked(binding, () => {
      const detail = selected.kind === "job" ? GitLabCommandShared.native(binding, GitLabCommandNative.Job, selected.data) : undefined
      const bridge = selected.kind === "bridge" ? GitLabCommandShared.native(binding, Actions.Job, selected.data) : undefined
      if (detail && (String(detail.id) !== intent.target.jobID || String(detail.pipeline.id) !== intent.target.runID || String(detail.pipeline.project_id) !== binding.projectID ||
        detail.commit.id !== run.commit || detail.pipeline.sha !== run.commit || detail.ref !== run.ref || detail.pipeline.ref !== run.ref) ||
        bridge && (bridge.id !== intent.target.jobID || bridge.runID !== run.id || bridge.bindingID !== binding.id || bridge.kind !== "bridge") ||
        run.id !== intent.target.runID || run.bindingID !== binding.id)
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab job does not belong to the exact admitted project, pipeline, commit and ref")
      GitLabCommandShared.commit(binding, intent, run.commit, run.ref)
      const status = detail?.status ?? bridge?.status
      if (detail?.archived === true) throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab archived job is not eligible for this command")
      if (intent.kind === "job.play" && status !== "manual")
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab manual play requires an observed manual job")
      if (intent.kind === "job.retry" && !["success", "failed", "canceled"].includes(status ?? ""))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab job retry requires an observed finished retryable job")
      if (intent.kind === "job.erase" && (!GitLabCommandShared.terminal.includes(status ?? "") || detail?.erased_at))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab erase requires a terminal, non-archived, unerased job")
      if (intent.kind === "job.cancel") GitLabCommandNative.cancellation(binding, project, level)
      return detail
    })
    if (intent.kind === "job.erase" && level < 40) {
      if (!job || job.user?.username !== binding.account) return yield* GitLabCommandShared.error(binding, "permission_denied", "GitLab erase requires Maintainer access or the job's unprotected-ref creator")
      const ref = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/branches/${encodeURIComponent(job.ref)}`)
      yield* ActionsGitLabNative.checked(binding, () => {
        const branch = GitLabCommandShared.native(binding, Schema.Struct({ ...GitLabCommandNative.Ref.fields, protected: Schema.Boolean }), ref.data)
        if (branch.name !== job.ref || branch.protected) throw GitLabCommandShared.error(binding, "permission_denied", "GitLab developer-owned erase requires a proved unprotected native ref")
      })
    }
    yield* GitLabCommandShared.source(binding, intent, input.reader, run.commit)
    const body = yield* ActionsGitLabNative.checked(binding, () => {
      if (variables === undefined) return
      if (variables.some((variable) => variable.variable_type === "file"))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab job play variables do not support native file variable_type")
      if (new Set(variables.map((variable) => variable.key)).size !== variables.length)
        throw GitLabCommandShared.error(binding, "invalid_input", "GitLab job play variables must have distinct native keys")
      GitLabCommandNative.variables(binding, project, level, variables.length > 0)
      return { job_variables_attributes: variables.map((variable) => ({ key: variable.key, value: variable.value })) }
    })
    const verb = intent.kind.slice(4)
    return { request: { method: "POST", path: `${path}/${verb}`, ...(body === undefined ? {} : { body }) }, statuses: [200, 201],
      acknowledge: Effect.fn("ActionsGitLabCommands.jobAcknowledgement")(function* (response: ActionsContract.Response) {
        const returned = yield* ActionsGitLabNative.checked(binding, () => {
          const value = GitLabCommandShared.native(binding, ReturnedJob, response.data, true)
          requireSource(binding, value, run)
          if (intent.kind !== "job.retry" && String(value.id) !== intent.target.jobID)
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job mutation returned a different native job ID", true)
          if (intent.kind === "job.retry" && String(value.id) === intent.target.jobID)
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job retry did not establish a replacement native job ID", true)
          return value
        })
        // Some native response shapes omit owning pipeline metadata. Read the exact
        // acknowledged ID once; never attribute a retry by matching names or times.
        const verified = returned.pipeline && intent.kind !== "job.erase" ? returned
          : selected.kind === "bridge" ? yield* findBridge(binding, input.reader, run.id, String(returned.id)).pipe(
            Effect.map((job) => ({ id: job.id, pipeline: { id: job.runID, project_id: binding.projectID } })),
            Effect.mapError(() => GitLabCommandShared.error(binding, "outcome_unknown", "GitLab bridge write was accepted but exact returned-ID readback failed", true)),
          ) : yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/jobs/${returned.id}`).pipe(
            Effect.flatMap((response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.native(binding, ReturnedJob, response.data, true))),
            Effect.mapError(() => GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job write was accepted but exact readback failed", true)),
          )
        return yield* ActionsGitLabNative.checked(binding, () => {
          requireSource(binding, verified, run)
          if (String(verified.id) !== String(returned.id) || !verified.pipeline || String(verified.pipeline.id) !== run.id || String(verified.pipeline.project_id) !== binding.projectID ||
            intent.kind === "job.erase" && (!("erased_at" in verified) || !verified.erased_at))
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab mutation response/readback did not prove exact job ownership or erasure", true)
          return { runID: run.id, jobID: String(returned.id) }
        })
      }) }
  })
}

function requireSource(binding: Actions.Binding, value: typeof ReturnedJob.Type, run: Actions.Run) {
  if (value.pipeline && (String(value.pipeline.id) !== run.id || String(value.pipeline.project_id) !== binding.projectID ||
    value.pipeline.sha !== undefined && value.pipeline.sha !== run.commit || value.pipeline.ref !== undefined && value.pipeline.ref !== run.ref) ||
    value.commit !== undefined && value.commit.id !== run.commit || value.ref !== undefined && value.ref !== run.ref)
    throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job mutation contradicted admitted native pipeline/source identity", true)
}

const findBridge = Effect.fn("ActionsGitLabCommands.exactBridge")(function* (binding: Actions.Binding, reader: ActionsContract.ReadAdapter, runID: string, id: string) {
  const seen = new Set<string>()
  const selection: { cursor?: string } = {}
  while (seen.size < 2000) {
    const page = yield* reader.jobs(binding, { runID, cursor: selection.cursor })
    const job = page.items.find((job) => job.id === id && job.kind === "bridge" && job.bindingID === binding.id && job.runID === runID)
    if (job) return job
    if (page.next === undefined) return yield* GitLabCommandShared.error(binding, "not_found", "GitLab exact native bridge job was not found in the owning pipeline")
    if (seen.has(page.next)) break
    seen.add(page.next)
    selection.cursor = page.next
  }
  return yield* GitLabCommandShared.error(binding, "metadata_truncated", "GitLab bridge ownership lookup exceeded bounded native pagination")
})
