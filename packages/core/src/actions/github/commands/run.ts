export * as GitHubRunCommands from "./run"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { GitHubNative } from "../native"
import { GitHubCommandCommon } from "./common"

const active = new Set(["queued", "in_progress", "waiting", "pending", "requested"])
const Fork = Schema.Struct({ id: GitHubNative.ID, head_sha: GitHubNative.SHA, run_attempt: GitHubNative.Positive,
  event: Schema.String, status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  repository: Schema.Struct({ id: GitHubNative.ID, private: Schema.Boolean }),
  head_repository: Schema.NullOr(Schema.Struct({ id: GitHubNative.ID, fork: Schema.Boolean })) })

// https://docs.github.com/en/rest/actions/workflow-runs
export const perform = Effect.fn("ActionsGitHubCommands.run")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, debug?: boolean) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.runID ?? ""))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const run = yield* GitHubCommandCommon.run(services, binding, intent, id)
  yield* GitHubCommandCommon.historical(services, binding, intent, run)
  const target = `${repository.root}/actions/runs/${id}`
  if (intent.kind === "run.retry" || intent.kind === "run.retryFailed") {
    if (run.status !== "completed" || (intent.kind === "run.retryFailed" && !["failure", "cancelled", "timed_out"].includes(run.conclusion ?? "")))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run is not eligible for the admitted retry mode")
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/${intent.kind === "run.retry" ? "rerun" : "rerun-failed-jobs"}`,
      body: debug === undefined ? {} : { enable_debug_logging: debug } }, [201, 204])
    // The admitted run is known; the newly-created attempt is not returned here.
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.cancel" || intent.kind === "run.forceCancel") {
    if (run.status === null || !active.has(run.status))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run is not in a cancelable execution state")
    if (intent.kind === "run.forceCancel" && (binding.provider.hostname !== "github.com" || binding.provider.apiOrigin !== "https://api.github.com" || repository.headers["x-github-api-version-selected"] !== "2026-03-10"))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native force-cancel route has no observed supported host/API-version evidence")
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/${intent.kind === "run.cancel" ? "cancel" : "force-cancel"}` }, [202])
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.delete") {
    if (run.status !== "completed") return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Only a terminal native run may be deleted")
    yield* GitHubCommandCommon.send(services, binding, { method: "DELETE", path: target }, [204])
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.approveFork") {
    if (run.event !== "pull_request" || (run.status !== "action_required" && run.conclusion !== "action_required"))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run does not require fork pull-request approval")
    const response = yield* GitHubCommandCommon.get(services, binding, target)
    yield* GitHubCommandCommon.guard(binding, () => {
      const native = GitHubNative.decode(binding, Fork, response.data, "fork approval")
      if (String(native.id) !== id || String(native.repository.id) !== binding.projectID || native.run_attempt !== run.attempt || native.head_sha.toLowerCase() !== run.commit.toLowerCase())
        throw GitHubCommandCommon.fail(binding, "source_conflict", "Native fork run changed during preflight")
      if (native.event !== run.event || native.status !== run.status || native.conclusion !== run.conclusion)
        throw GitHubCommandCommon.fail(binding, "source_conflict", "Native fork approval conditions changed during preflight")
      if (native.repository.private || !native.head_repository?.fork || String(native.head_repository.id) === binding.projectID)
        throw GitHubCommandCommon.fail(binding, "capability_unavailable", "Native public-fork ownership was not proved")
    })
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/approve` }, [201])
    return { acknowledgement: { runID: id } }
  }
  return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Command does not belong to the GitHub run dispatcher")
})
