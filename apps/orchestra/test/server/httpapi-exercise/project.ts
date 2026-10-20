import { array, check, isRecord, object } from "./assertions"
import { http, route } from "./dsl"
import { leanScenarios } from "./lean"
import { atlasScenarios } from "./atlas"
import { type Scenario } from "./types"

// Project routes, moved out of index.ts unchanged, plus the Lean dashboard routes under /project/lean.
export const projectScenarios: Scenario[] = [
  http.protected.get("/project", "project.list").json(200, array, "status"),
  http.protected.get("/project/current", "project.current").json(
    200,
    (body, ctx) => {
      object(body)
      check(body.worktree === ctx.directory, "current project should resolve from scenario directory")
    },
    "status",
  ),
  http.protected
    .patch("/project/{projectID}", "project.update")
    .mutating()
    .seeded((ctx) => ctx.project())
    .at((ctx) => ({
      path: route("/project/{projectID}", { projectID: ctx.state.id }),
      headers: ctx.headers(),
      body: { name: "HTTP API Project", commands: { start: "bun --version" } },
    }))
    .json(
      200,
      (body) => {
        object(body)
        check(body.name === "HTTP API Project", "project update should return patched name")
        check(
          isRecord(body.commands) && body.commands.start === "bun --version",
          "project update should return patched command",
        )
      },
      "status",
    ),
  http.protected
    .patch("/project/{projectID}", "project.update.missing")
    .mutating()
    .at((ctx) => ({
      path: route("/project/{projectID}", { projectID: "project_httpapi_missing" }),
      headers: ctx.headers(),
      body: { name: "Missing Project" },
    }))
    .json(404, object, "status"),
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
  http.protected
    .post("/project/git/init", "project.initGit")
    .mutating()
    .inProject({ git: false })
    .json(
      200,
      (body, ctx) => {
        object(body)
        check(body.worktree === ctx.directory, "git init should return current project")
        check(body.vcs === "git", "git init should mark the project as git-backed")
      },
      "status",
    ),
  http.protected
    .get("/project/{projectID}/directories", "project.directories")
    .seeded((ctx) => ctx.project())
    .at((ctx) => ({
      path: route("/project/{projectID}/directories", { projectID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .json(200, array, "status"),
  ...leanScenarios,
  ...atlasScenarios,
]
