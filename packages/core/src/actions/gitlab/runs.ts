export * as ActionsGitLabRuns from "./runs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsGitLabNative } from "./native"

// https://docs.gitlab.com/api/pipelines/#list-project-pipelines
const statuses = ["created", "waiting_for_resource", "preparing", "waiting_for_callback", "pending", "running", "success", "failed", "canceling", "canceled", "skipped", "manual", "scheduled"]
const Timestamp = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/))
  .pipe(Schema.decodeTo(Schema.DateTimeUtcFromString))
const Source = Schema.Literals(["unknown", "push", "web", "trigger", "schedule", "api", "external", "pipeline", "chat", "webide",
  "merge_request_event", "external_pull_request_event", "parent_pipeline", "ondemand_dast_scan", "ondemand_dast_validation",
  "security_orchestration_policy", "container_registry_push", "duo_workflow", "pipeline_execution_policy_schedule"])
// Closed API enum. 14.2 declares source but gates the finder behind a flag; 14.3 removes it.
// https://gitlab.com/gitlab-org/gitlab/-/blob/v14.3.0-ee/app/finders/ci/pipelines_finder.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.0.0-ee/app/finders/ci/pipelines_finder.rb (parent_pipeline)
// https://gitlab.com/gitlab-org/gitlab/-/blob/v14.3.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.0.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.4.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.9.0-ee/app/models/concerns/enums/ci/pipeline.rb
const sourceMinimum = {
  unknown: [14, 3], push: [14, 3], web: [14, 3], trigger: [14, 3], schedule: [14, 3], api: [14, 3], external: [14, 3],
  pipeline: [14, 3], chat: [14, 3], webide: [14, 3], merge_request_event: [14, 3], external_pull_request_event: [14, 3],
  ondemand_dast_scan: [14, 3], ondemand_dast_validation: [14, 3], security_orchestration_policy: [14, 3],
  parent_pipeline: [17, 0], container_registry_push: [17, 0], duo_workflow: [17, 4], pipeline_execution_policy_schedule: [17, 9],
}

export function make(transport: ActionsContract.Transport) {
  const native = ActionsGitLabNative.make(transport)
  const runs = Effect.fn("ActionsGitLabRead.runs")(function* (binding: Actions.Binding, input: Actions.RunListInput) {
    const query = yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["workflowID", "cursor", "limit", "ref", "event", "status", "commit", "actor", "created",
        "createdAfter", "createdBefore", "updatedAfter", "updatedBefore"], Actions.RunListInput)
      if (input.workflowID !== undefined && input.workflowID !== ActionsGitLabNative.workflowID(binding))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab workflowID must select this native project pipeline/config slot")
      if (input.created !== undefined) throw ActionsGitLabNative.error(binding, "capability_unavailable", "GitLab created filter is ambiguous; use explicit created_after/created_before fields")
      if (input.status !== undefined && !statuses.includes(input.status))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab status filter must use a documented native pipeline status")
      if (input.event !== undefined && Option.isNone(Schema.decodeUnknownOption(Source)(input.event)))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab event filter must use a qualified native pipeline source")
      if ([input.ref, input.event, input.commit, input.actor].some((value) => value !== undefined && (!value || /[\x00-\x1f\x7f]/.test(value))))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab pipeline filters must be nonempty native strings")
      return { per_page: ActionsCursor.limit(input.limit),
        ...(input.ref === undefined ? {} : { ref: input.ref }), ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.event === undefined ? {} : { source: input.event }), ...(input.commit === undefined ? {} : { sha: input.commit }),
        ...(input.actor === undefined ? {} : { username: input.actor }), ...rangeQuery(binding, input) }
    })
    const page = yield* ActionsGitLabNative.checked(binding, () => ActionsCursor.page(binding, "gitlab.runs", query, input.cursor))
    if (input.event !== undefined || input.createdAfter !== undefined || input.createdBefore !== undefined || input.updatedAfter !== undefined || input.updatedBefore !== undefined) {
      const observation = yield* native.metadata(binding)
      yield* ActionsGitLabNative.checked(binding, () => {
        if (input.event !== undefined) {
          const source = ActionsGitLabNative.decode(binding, Source, input.event, "source selection")
          ActionsGitLabNative.requireVersion(binding, observation, sourceMinimum[source], `source=${source}`)
        }
        // https://gitlab.com/gitlab-org/gitlab/-/blob/v17.11.0-ee/lib/api/ci/pipelines.rb
        if (input.createdAfter !== undefined || input.createdBefore !== undefined)
          ActionsGitLabNative.requireVersion(binding, observation, [17, 11], "created_after/created_before")
        // https://gitlab.com/gitlab-org/gitlab/-/blob/v12.6.0-ee/lib/api/pipelines.rb
        if (input.updatedAfter !== undefined || input.updatedBefore !== undefined)
          ActionsGitLabNative.requireVersion(binding, observation, [12, 6], "updated_after/updated_before")
      })
    }
    yield* native.project(binding)
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/pipelines`, { ...query, page })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const pipelines = ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Pipeline), response.data, "pipeline list")
      pipelines.forEach((pipeline) => {
        ActionsGitLabNative.requirePipeline(binding, pipeline)
        if (input.event !== undefined && pipeline.source !== input.event)
          throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab returned a pipeline outside the requested native source selection")
      })
      if (new Set(pipelines.map((pipeline) => String(pipeline.id))).size !== pipelines.length)
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab pipeline page contains duplicate native IDs")
      return { items: pipelines.map((pipeline) => toRun(binding, pipeline)), capturedAt: Date.now(),
        ...ActionsGitLabNative.pagination(binding, "gitlab.runs", query, response.headers, page) }
    })
  })
  const run = Effect.fn("ActionsGitLabRead.run")(function* (binding: Actions.Binding, id: string) {
    yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.nativeID(binding, id, "pipeline ID"))
    yield* native.project(binding)
    return toRun(binding, yield* native.pipeline(binding, id))
  })
  return { runs, run }
}

function toRun(binding: Actions.Binding, pipeline: typeof ActionsGitLabNative.Pipeline.Type) {
  return Actions.Run.make({ id: String(pipeline.id), bindingID: binding.id, workflowID: ActionsGitLabNative.workflowID(binding),
    name: pipeline.name === undefined ? `Pipeline ${pipeline.id}` : pipeline.name, ref: pipeline.ref, commit: pipeline.sha, event: pipeline.source,
    repositoryID: String(pipeline.project_id),
    status: pipeline.status, ...(ActionsGitLabNative.conclusion(pipeline.status) === undefined ? {} : { conclusion: pipeline.status }),
    ...(pipeline.user ? { actor: pipeline.user.username } : {}),
    ...(pipeline.created_at === undefined || pipeline.created_at === null ? {} : { createdAt: pipeline.created_at }),
    ...(pipeline.started_at === undefined || pipeline.started_at === null ? {} : { startedAt: pipeline.started_at }),
    ...(pipeline.finished_at === undefined || pipeline.finished_at === null ? {} : { finishedAt: pipeline.finished_at }),
    ...(pipeline.updated_at === undefined || pipeline.updated_at === null ? {} : { updatedAt: pipeline.updated_at }),
    ...(pipeline.duration === undefined || pipeline.duration === null ? {} : { duration: pipeline.duration }),
    ...(pipeline.web_url === undefined || pipeline.web_url === null ? {} : { url: pipeline.web_url }),
  })
}

function rangeQuery(binding: Actions.Binding, input: Actions.RunListInput) {
  const entries = Object.entries({ created_after: input.createdAfter, created_before: input.createdBefore,
    updated_after: input.updatedAfter, updated_before: input.updatedBefore })
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
  if (!entries.length) return {}
  entries.forEach(([key, value]) => {
    if (Option.isNone(Schema.decodeUnknownOption(Timestamp)(value)))
      throw ActionsGitLabNative.error(binding, "invalid_input", `GitLab ${key} must be an ISO 8601 timestamp with a timezone`)
  })
  return Object.fromEntries(entries)
}
