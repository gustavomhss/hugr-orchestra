import { PullRequest } from "@opencode-ai/core/pull-request"
import { PullRequestError } from "@opencode-ai/protocol/groups/pull-request"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const PullRequestHandler = HttpApiBuilder.group(Api, "server.pullRequest", (handlers) =>
  Effect.succeed(
    handlers
      .handle("pullRequest.list", () =>
        response(
          Effect.gen(function* () {
            const pullRequests = yield* PullRequest.Service
            return yield* pullRequests.list().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("pullRequest.create", (ctx) =>
        response(
          Effect.gen(function* () {
            const pullRequests = yield* PullRequest.Service
            return yield* pullRequests.create(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      ),
  ),
)

function apiError(error: PullRequest.HostError) {
  return new PullRequestError({
    name: "PullRequestError",
    data: {
      kind: error.kind,
      message: error.message,
      host: error.host,
      branch: error.branch,
      remote: error.remote,
    },
  })
}
