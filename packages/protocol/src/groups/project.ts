import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@orchestra/schema/location"
import { InvalidRequestError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const ProjectGroup = HttpApiGroup.make("server.project")
  .add(
    HttpApiEndpoint.get("project.list", "/api/project", {
      success: Schema.Array(Project.Info),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.project.list",
        summary: "List projects",
        description: "Retrieve every project this server has opened, oldest first.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("project.directories", "/api/project/:projectID/directories", {
      params: { projectID: Project.ID },
      success: Schema.Array(Schema.Struct({ directory: AbsolutePath, strategy: Schema.optional(Schema.String) })),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.project.directories",
        summary: "List project directories",
        description: "Retrieve the extra directories (worktrees and copies) recorded for a project.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.patch("project.update", "/api/project/:projectID", {
      params: { projectID: Project.ID },
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
        icon: Schema.optional(Schema.Struct({ color: Schema.optional(Schema.String), override: Schema.optional(Schema.String) })),
        commands: Schema.optional(Project.Commands),
      }),
      success: Project.Info,
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.project.update",
        summary: "Update project",
        description: "Rename a project or change its icon or start command.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("project.initGit", "/api/project/git", {
      query: LocationQuery,
      success: Location.response(Schema.NullOr(Project.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.project.initGit",
          summary: "Initialize git",
          description:
            "Make the requested directory a git repository with an empty first commit and return its recorded project.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "projects", description: "Project catalog routes." }))
