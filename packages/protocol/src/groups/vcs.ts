import { Location } from "@orchestra/schema/location"
import { NonNegativeInt } from "@orchestra/schema/schema"
import { SessionActivity } from "@orchestra/schema/session-activity"
import { Vcs } from "@orchestra/schema/vcs"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

const Millis = Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt))

export const VcsGroup = HttpApiGroup.make("server.vcs")
  .add(
    HttpApiEndpoint.get("vcs.get", "/api/vcs", {
      query: LocationQuery,
      success: Location.response(Vcs.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.vcs.get",
          summary: "Get branch",
          description: "The current branch and the repository's default branch; both absent outside a git repository.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("vcs.status", "/api/vcs/status", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Vcs.FileStatus)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.vcs.status",
          summary: "List changed files",
          description: "Changed files against HEAD with their line counts.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("vcs.diff", "/api/vcs/diff", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        mode: Schema.Literals(["working", "branch"]),
        context: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
      }),
      success: Location.response(Schema.Array(Vcs.FileDiff)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.vcs.diff",
          summary: "Diff changes",
          description:
            "Diffs of the working tree against HEAD (`working`) or against the merge base with the default branch (`branch`).",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("vcs.activity", "/api/vcs/activity", {
      query: Schema.Struct({ ...LocationQuery.fields, since: Millis, until: Millis }),
      success: Location.response(Vcs.Activity),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.vcs.activity",
          summary: "Get commit activity",
          description: "Commits, merges, authors and changed lines between two epoch-millisecond bounds.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("vcs.sessionActivity", "/api/activity/session", {
      query: Schema.Struct({ ...LocationQuery.fields, period: SessionActivity.Period }),
      success: Location.response(SessionActivity.Activity),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.activity.session",
          summary: "Get Session activity",
          description:
            "Recorded Session activity of the location's project over a period (of the directory alone outside git).",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "vcs",
      description: "Version control and recorded activity of a location.",
    }),
  )
