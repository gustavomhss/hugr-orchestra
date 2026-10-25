import { array, check, isRecord, object } from "./assertions"
import { http, route } from "./dsl"
import { leanScenarios } from "./lean"
import { atlasScenarios } from "./atlas"
import { type Scenario } from "./types"

// Project routes, moved out of index.ts unchanged, plus the Lean dashboard routes under /project/lean.
export const projectScenarios: Scenario[] = [
  // V2: the same edits under /api/project.
  http.protected
    .patch("/api/project/{projectID}", "v2.project.update")
    .mutating()
    .seeded((ctx) => ctx.project())
    .at((ctx) => ({
      path: route("/api/project/{projectID}", { projectID: ctx.state.id }),
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { name: "HTTP API V2 Project", commands: { start: "bun --version" } },
    }))
    .json(
      200,
      (body) => {
        object(body)
        check(body.name === "HTTP API V2 Project", "v2 project update should return the patched name")
      },
      "status",
    ),
  http.protected
    .post("/api/project/git", "v2.project.initGit")
    .mutating()
    .inProject({ git: false })
    .json(
      200,
      (body) => {
        object(body)
        check(isRecord(body.data) && body.data.vcs === "git", "v2 git init should record a git-backed project")
      },
      "status",
    ),
  ...leanScenarios,
  ...atlasScenarios,
]
