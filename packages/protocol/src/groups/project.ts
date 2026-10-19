import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

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
  .annotateMerge(OpenApi.annotations({ title: "projects", description: "Project catalog routes." }))
