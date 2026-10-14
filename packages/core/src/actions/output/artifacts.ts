export * as OutputArtifacts from "./artifacts"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsError } from "../error"
import { OutputNative } from "./native"
import { OutputVersion } from "./version"

export const list = Effect.fn("ActionsOutput.artifacts")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, input: Actions.ResourceListInput,
): Effect.fn.Return<Actions.ResourcePage, ActionsError> {
  const selected = yield* OutputNative.checked(binding, () => {
    OutputNative.selection(binding, input, Actions.ResourceListInput, ["kind", "runID", "cursor", "limit", "query"])
    if (input.kind !== "artifacts") throw OutputNative.error(binding, "capability_unavailable", "CI output only lists native artifacts")
    if (input.runID !== undefined) OutputNative.id(binding, input.runID)
    if (input.query !== undefined && (binding.provider.kind !== "github" || input.query.length > 1024 || /[\x00-\x1f\x7f]/.test(input.query)))
      throw OutputNative.error(binding, "invalid_input", "Artifact name filtering requires a bounded native GitHub name")
    const limit = ActionsCursor.limit(input.limit)
    const scope = `output:artifacts:${input.runID ?? "project"}`
    const filters = { runID: input.runID, name: input.query, per_page: limit }
    return { limit, scope, filters, page: ActionsCursor.page(binding, scope, filters, input.cursor) }
  })
  const root = yield* OutputNative.project(transport, binding)
  if (input.runID !== undefined) yield* OutputNative.run(reader, binding, input.runID)
  const request: ActionsContract.Request = {
    method: "GET",
    path: binding.provider.kind === "github"
      ? `${root}/actions/${input.runID ? `runs/${input.runID}/` : ""}artifacts`
      : `${root}/${input.runID ? `pipelines/${input.runID}/jobs` : "jobs"}`,
    query: { page: selected.page, per_page: selected.limit,
      ...(input.query === undefined ? {} : { name: input.query }),
      ...(binding.provider.kind === "gitlab" && input.runID ? { include_retried: true } : {}) },
  }
  const response = yield* OutputNative.get(transport, binding, request.path, request.query)
  return yield* OutputNative.checked(binding, () => {
    if (binding.provider.kind === "github") {
      const value = OutputNative.decode(binding, Schema.Struct({ total_count: OutputNative.Count,
        artifacts: Schema.Array(OutputNative.Artifact).check(Schema.isMaxLength(100)) }), response.data)
      const items = value.artifacts.map((artifact) => {
        OutputNative.artifactOwner(binding, artifact, undefined, input.runID)
        // Explicit native allowlist: no archive_download_url, actor tokens or unbounded provider JSON.
        return Actions.Resource.make({ id: String(artifact.id), bindingID: binding.id, kind: "artifacts",
          name: artifact.name, scope: String(artifact.workflow_run.id), status: artifact.expired ? "expired" : "available",
           data: { id: artifact.id, name: artifact.name, resourceVersion: OutputVersion.github(artifact), size_in_bytes: artifact.size_in_bytes, expired: artifact.expired,
            workflow_run: { id: artifact.workflow_run.id, repository_id: artifact.workflow_run.repository_id,
              ...(artifact.workflow_run.head_repository_id === undefined ? {} : { head_repository_id: artifact.workflow_run.head_repository_id }) },
            ...(artifact.digest === undefined ? {} : { digest: artifact.digest }),
            ...(artifact.created_at === undefined ? {} : { created_at: artifact.created_at }),
            ...(artifact.updated_at === undefined ? {} : { updated_at: artifact.updated_at }),
            ...(artifact.expires_at === undefined ? {} : { expires_at: artifact.expires_at }) } })
      })
      return { items, ...OutputNative.pagination(binding, request, selected.scope, selected.filters, response,
        selected.page, items.length, selected.limit, value.total_count) }
    }
    const jobs = OutputNative.decode(binding, Schema.Array(OutputNative.GitLabJob).check(Schema.isMaxLength(100)), response.data)
    const items = jobs.map((job) => {
      OutputNative.gitlabOwner(binding, job, undefined, input.runID)
      // GitLab archive identity IS job ID. Inventory includes erased/expired/no-artifact jobs.
      return Actions.Resource.make({ id: String(job.id), bindingID: binding.id, kind: "artifacts", name: OutputNative.gitlabArchive(job)?.filename ?? job.name,
        scope: String(job.pipeline.id), owner: String(job.id), status: OutputNative.gitlabState(job),
         data: { id: job.id, name: job.name, resourceVersion: OutputVersion.gitlab(job), status: job.status, pipeline: job.pipeline,
          artifacts: job.artifacts.map((artifact) => ({ file_type: artifact.file_type, size: artifact.size, filename: artifact.filename,
            ...(artifact.file_format === undefined ? {} : { file_format: artifact.file_format }) })),
          ...(job.artifacts_file === undefined ? {} : { artifacts_file: job.artifacts_file }),
          ...(job.artifacts_expire_at === undefined ? {} : { artifacts_expire_at: job.artifacts_expire_at }),
          ...(job.erased_at === undefined ? {} : { erased_at: job.erased_at }) } })
    })
    return { items, ...OutputNative.pagination(binding, request, selected.scope, selected.filters, response,
      selected.page, jobs.length, selected.limit) }
  })
})
