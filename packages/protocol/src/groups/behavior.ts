import { Behavior } from "@orchestra/schema/behavior"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const BehaviorGroup = HttpApiGroup.make("server.behavior")
  .add(
    HttpApiEndpoint.put("behavior.set", "/api/behavior", {
      query: LocationQuery,
      payload: Behavior.SetInput,
      success: Location.response(Schema.Array(Behavior.Info)),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.behavior.set",
          summary: "Set behaviors",
          description:
            "Replace the behaviors of the requested location's project and return the stored set. Every session of the project receives them as system context from its next provider turn; removed behaviors leave the next turn's request.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "behaviors",
      description: "Project-scoped model behaviors applied as system context.",
    }),
  )
