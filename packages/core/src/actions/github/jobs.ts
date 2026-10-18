export * as GitHubJobs from "./jobs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "./native"
import { GitHubRuns } from "./runs"

// Zero is native unassigned runner metadata, never a valid job/run target ID.
const RunnerID = Schema.NullOr(Schema.Union([GitHubNative.Count, Schema.String.check(Schema.isPattern(/^(?:0|[1-9]\d{0,127})$/))]))
const Step = Schema.Struct({ number: GitHubNative.Count, name: Schema.String, status: Schema.NullOr(Schema.String),
  conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)), started_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)), completed_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)) })
const Job = Schema.Struct({ id: GitHubNative.ID, run_id: GitHubNative.ID, run_attempt: Schema.optionalKey(GitHubNative.Positive),
  name: Schema.String, status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  runner_name: Schema.optionalKey(Schema.NullOr(Schema.String)), runner_id: Schema.optionalKey(RunnerID),
  labels: Schema.optionalKey(Schema.Array(Schema.String)), runner_group_id: Schema.optionalKey(RunnerID),
  started_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)), completed_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)),
  steps: Schema.Array(Step) })
const Jobs = Schema.Struct({ total_count: Schema.optionalKey(GitHubNative.Count), jobs: Schema.Array(Job) })

// https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt
export const list = Effect.fn("ActionsGitHubRead.jobs")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: { runID: string; attempt?: number; cursor?: string }) {
  yield* GitHubNative.checked(binding, () => {
    GitHubNative.id(binding, input.runID)
    if (input.attempt !== undefined && (!Number.isSafeInteger(input.attempt) || input.attempt < 1))
      throw GitHubNative.error(binding, "invalid_input", "GitHub run attempt must be a positive safe integer")
  })
  const repo = yield* GitHubNative.repository(transport, binding)
  const run = yield* GitHubRuns.at(transport, binding, repo.path, input.runID)
  const attempt = input.attempt ?? run.attempt
  if (attempt === undefined)
    return yield* GitHubNative.error(binding, "capability_unavailable", "GitHub did not prove the current run attempt; select an explicit attempt")
  const selected = yield* GitHubNative.checked(binding, () => GitHubNative.selection(binding, "github.jobs",
    { runID: input.runID, attempt }, input.cursor))
  // Current selection is resolved once, then pinned before a rerun can advance it.
  const request = { method: "GET", path: `${repo.path}/actions/runs/${input.runID}/attempts/${attempt}/jobs`,
    query: { page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Jobs, response.data, "job list")
    return { items: data.jobs.map((job): Actions.Job => {
      if (String(job.run_id) !== input.runID || (job.run_attempt !== undefined && job.run_attempt !== attempt))
        throw GitHubNative.error(binding, "transport_failed", "GitHub job run or attempt does not match the selection")
      return { id: String(job.id), bindingID: binding.id, runID: String(job.run_id), name: job.name,
        status: job.status, kind: "job",
        ...(job.conclusion === undefined ? {} : { conclusion: job.conclusion }),
        ...(job.runner_name == null ? {} : { runner: job.runner_name }),
        ...(job.runner_id == null ? {} : { runnerID: String(job.runner_id) }),
        ...(job.runner_group_id == null ? {} : { runnerGroupID: String(job.runner_group_id) }),
        ...(job.labels === undefined ? {} : { runnerLabels: job.labels }),
        // The pinned endpoint proves identity even on payloads omitting run_attempt.
        attempt,
        ...(job.started_at == null ? {} : { startedAt: job.started_at }),
        ...(job.completed_at == null ? {} : { finishedAt: job.completed_at }),
        steps: job.steps.map((step) => ({ number: step.number, name: step.name, status: step.status,
          ...(step.conclusion === undefined ? {} : { conclusion: step.conclusion }),
          ...(step.started_at == null ? {} : { startedAt: step.started_at }),
          ...(step.completed_at == null ? {} : { finishedAt: step.completed_at }) })) }
    }), ...GitHubNative.pagination(binding, response, request, selected, data.jobs.length, data.total_count) }
  })
})
