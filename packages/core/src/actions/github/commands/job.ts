export * as GitHubJobCommands from "./job"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { GitHubNative } from "../native"
import { GitHubCommandCommon } from "./common"

const Job = Schema.Struct({ id: GitHubNative.ID, run_id: GitHubNative.ID, head_sha: GitHubNative.SHA,
  run_attempt: Schema.optionalKey(GitHubNative.Positive), status: Schema.NullOr(Schema.String) })

// https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run
export const retry = Effect.fn("ActionsGitHubCommands.jobRetry")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, debug?: boolean) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.jobID ?? ""))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const response = yield* GitHubCommandCommon.get(services, binding, `${repository.root}/actions/jobs/${id}`)
  const job = yield* GitHubCommandCommon.guard(binding, () => {
    const native = GitHubNative.decode(binding, Job, response.data, "job retry")
    if (String(native.id) !== id || (intent.target.runID !== undefined && String(native.run_id) !== intent.target.runID))
      throw GitHubCommandCommon.fail(binding, "source_conflict", "Native job does not match its admitted run ownership")
    GitHubCommandCommon.version(binding, intent.expected, response)
    return native
  })
  const run = yield* GitHubCommandCommon.run(services, binding, intent, String(job.run_id))
  if (job.run_attempt === undefined) return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native job attempt was not observed")
  if (job.run_attempt !== run.attempt || job.head_sha.toLowerCase() !== run.commit.toLowerCase())
    return yield* GitHubCommandCommon.fail(binding, "source_conflict", "Native job source or attempt is stale")
  if (job.status !== "completed" || run.status !== "completed")
    return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native job/run is not terminal for retry")
  yield* GitHubCommandCommon.historical(services, binding, intent, run)
  yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${repository.root}/actions/jobs/${id}/rerun`,
    body: debug === undefined ? {} : { enable_debug_logging: debug } }, [201, 204])
  return { acknowledgement: { jobID: id, runID: String(job.run_id) } }
})
