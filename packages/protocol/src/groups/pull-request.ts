import { Location } from "@orchestra/schema/location"
import { PullRequest } from "@orchestra/schema/pull-request"
import { optional } from "@orchestra/schema/schema"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

// `kind` says why the host CLI could not answer, so clients can explain it without parsing the message.
export class PullRequestError extends Schema.ErrorClass<PullRequestError>("PullRequestError")(
  {
    name: Schema.Literal("PullRequestError"),
    data: Schema.Struct({
      kind: PullRequest.ErrorKind,
      message: Schema.String,
      host: optional(PullRequest.Host),
      branch: optional(Schema.String),
      remote: optional(Schema.String),
    }),
  },
  { httpApiStatus: 400 },
) {}

export const PullRequestGroup = HttpApiGroup.make("server.pullRequest")
  .add(
    HttpApiEndpoint.get("pullRequest.list", "/api/pull-request", {
      query: LocationQuery,
      success: Location.response(PullRequest.List),
      error: PullRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.pullRequest.list",
          summary: "List open pull requests",
          description:
            "List open pull requests on the location's github.com or gitlab.com remote through the gh or glab CLI signed in on the server.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("pullRequest.create", "/api/pull-request", {
      query: LocationQuery,
      payload: PullRequest.CreateInput,
      success: Location.response(PullRequest.Created),
      error: PullRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.pullRequest.create",
          summary: "Create pull request",
          description:
            "Open a pull request from a pushed branch of the location's repository through the gh or glab CLI signed in on the server.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "pullRequest",
      description: "Host pull requests through the server's gh or glab CLI.",
    }),
  )
