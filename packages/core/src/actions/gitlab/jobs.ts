export * as ActionsGitLabJobs from "./jobs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsGitLabNative } from "./native"

// Jobs and bridges have independent native pagination. A single opaque cursor
// reserves 1..50,000 for jobs, 50,001..100,000 for bridges. Never zip their pages.
// Composite totals stay unknown: one endpoint's X-Total cannot count both lists.
const bridgeOffset = 50_000
const perPage = 50

export function make(transport: ActionsContract.Transport) {
  const native = ActionsGitLabNative.make(transport)
  return Effect.fn("ActionsGitLabRead.jobs")(function* (binding: Actions.Binding, input: { readonly runID: string; readonly attempt?: number; readonly cursor?: string }) {
    const filters = { runID: input.runID, per_page: perPage, include_retried: true, pagination: "jobs-then-bridges-v1" }
    const position = yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["runID", "attempt", "cursor"], Schema.Struct({
        runID: Schema.NonEmptyString, attempt: Schema.optional(Schema.Int), cursor: Schema.optional(Schema.String),
      }))
      ActionsGitLabNative.nativeID(binding, input.runID, "pipeline ID")
      if (input.attempt !== undefined) throw ActionsGitLabNative.error(binding, "capability_unavailable", "GitLab job retries have native job IDs, not pipeline run_attempt numbers")
      return ActionsCursor.page(binding, "gitlab.jobs", filters, input.cursor)
    })
    yield* native.project(binding)
    yield* native.pipeline(binding, input.runID)
    const bridges = position > bridgeOffset
    const page = bridges ? position - bridgeOffset : position
    // The documented bridges route retains compatibility with pre-19.2 GitLab.
    // https://docs.gitlab.com/api/jobs/#list-all-trigger-jobs-by-pipeline
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/pipelines/${input.runID}/${bridges ? "bridges" : "jobs"}`,
      { page, per_page: perPage, ...(bridges ? {} : { include_retried: true }) })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const jobs = bridges ? ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Bridge), response.data, "bridge list")
        : ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Job), response.data, "job list")
      jobs.forEach((job) => {
        if (String(job.pipeline.id) !== input.runID || String(job.pipeline.project_id) !== binding.projectID)
          throw ActionsGitLabNative.error(binding, "binding_stale", "GitLab job does not belong to the requested native project and pipeline")
      })
      if (new Set(jobs.map((job) => String(job.id))).size !== jobs.length)
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab job page contains duplicate native IDs")
      const next = ActionsCursor.next(response.headers)
      ActionsCursor.total(response.headers) // Validate even though it is not a composite total.
      if (next !== undefined && (next <= page || next > bridgeOffset))
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab jobs pagination is non-advancing or exceeds the cursor range")
      const position = next === undefined ? bridges ? undefined : bridgeOffset + 1 : (bridges ? bridgeOffset : 0) + next
      return { items: jobs.map((job) => toJob(binding, job, bridges)), capturedAt: Date.now(),
        ...(position === undefined ? {} : { next: ActionsCursor.encode(binding, "gitlab.jobs", filters, position) }) }
    })
  })
}

function toJob(binding: Actions.Binding, job: typeof ActionsGitLabNative.Job.Type | typeof ActionsGitLabNative.Bridge.Type, bridges: boolean) {
  return Actions.Job.make({ id: String(job.id), bindingID: binding.id, runID: String(job.pipeline.id), name: job.name,
    status: job.status, stage: job.stage, allowFailure: job.allow_failure, kind: bridges ? "bridge" : "job",
    ...(ActionsGitLabNative.conclusion(job.status) === undefined ? {} : { conclusion: job.status }),
    ...(job.retried === undefined ? {} : { retried: job.retried }),
    ...(job.runner ? { runner: String(job.runner.id), runnerID: String(job.runner.id) } : {}),
    ...(job.started_at === undefined || job.started_at === null ? {} : { startedAt: job.started_at }),
    ...(job.finished_at === undefined || job.finished_at === null ? {} : { finishedAt: job.finished_at }),
    ...("downstream_pipeline" in job && job.downstream_pipeline ? { downstreamID: String(job.downstream_pipeline.id),
      ...(job.downstream_pipeline.project_id === undefined ? {} : { downstreamProjectID: String(job.downstream_pipeline.project_id) }) } : {}),
    // REST gives neither execution steps nor predecessor IDs. Same name/stage
    // proves neither retryOf nor definitionID (parallel/matrix jobs can match).
    steps: [],
  })
}
