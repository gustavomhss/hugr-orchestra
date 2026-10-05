import { Skill } from "@opencode-ai/schema/skill"
import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, InvalidRequestError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const SkillRemoveQuery = Schema.Struct({
  ...LocationQuery.fields,
  path: Schema.String,
}).annotate({ identifier: "SkillRemoveQuery" })

export const SkillGroup = HttpApiGroup.make("server.skill")
  .add(
    HttpApiEndpoint.get("skill.list", "/api/skill", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Skill.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.list",
          summary: "List skills",
          description: "Retrieve currently registered skills.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("skill.save", "/api/skill", {
      query: LocationQuery,
      payload: Skill.SaveInput,
      success: Location.response(Skill.Info),
      error: [InvalidRequestError, ConflictError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.save",
          summary: "Save skill",
          description:
            "Create a project skill under .opencode/skills, or rewrite the file of a registered skill given its path.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("skill.remove", "/api/skill", {
      query: SkillRemoveQuery,
      success: Location.response(Schema.Boolean),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.remove",
          summary: "Remove skill",
          description: "Delete the file of a registered skill given its path.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "skills",
      description: "Experimental skill routes.",
    }),
  )
