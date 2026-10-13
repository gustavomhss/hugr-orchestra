import { Model } from "@orchestra/schema/model"
import { Schema } from "effect"
import { array, check, locationData, object } from "./assertions"
import { http } from "./dsl"
import { type Scenario } from "./types"

// V2 location catalog routes: commands, references and the project behaviors every Session receives as system
// context. Split from index.ts so the route-coverage harness stays under the file size cap.
const behavior = { id: "httpapi-behavior", name: "Exercise", instructions: "Answer in one sentence." }
const pullRequest = { title: "HttpApi exercise", body: "Isolated route probe", base: "dev" }

export const catalogScenarios: Scenario[] = [
  // The isolated Git fixtures have no host remote. These requests exercise the real handler and its typed error
  // mapping without consulting the runner's signed-in gh/glab client or creating a remote pull request.
  http.protected.get("/api/pull-request", "v2.pullRequest.list").json(400, noPullRequestRemote, "status"),
  http.protected
    .post("/api/pull-request", "v2.pullRequest.create")
    .mutating()
    .at((ctx) => ({ path: "/api/pull-request", headers: ctx.headers(), body: pullRequest }))
    .probe({ path: "/api/pull-request", body: pullRequest })
    .json(400, noPullRequestRemote, "status"),
  http.protected.get("/api/command", "v2.command.list").json(200, locationData(array)),
  http.protected.get("/api/reference", "v2.reference.list").json(200, object),
  http.protected
    .get("/api/model/default", "v2.model.default")
    .inProject({
      git: true,
      config: {
        formatter: false,
        lsp: false,
        model: "opencode/httpapi-free",
        enabled_providers: ["opencode"],
        provider: {
          opencode: {
            env: [],
            npm: "@ai-sdk/openai-compatible",
            api: "http://127.0.0.1:1/v1",
            models: {
              "httpapi-free": {
                name: "HTTP API Free",
                cost: { input: 0, output: 0 },
                limit: { context: 1000, output: 100 },
              },
            },
          },
        },
      },
    })
    .json(
      200,
      locationData((value: unknown) => {
        check(Schema.is(Model.Info)(value), "default model should match the public Model.Info shape")
        check(
          value.providerID === "opencode" && value.id === "httpapi-free",
          "default should select the configured available model",
        )
        check(value.enabled, "default model should be enabled")
      }),
    ),
  http.protected
    .get("/api/model/default", "v2.model.default.empty")
    .inProject({ git: true, config: { formatter: false, lsp: false, enabled_providers: [] } })
    .json(
      200,
      locationData((value: unknown) => check(value === null, "empty provider allowlist should return a null default")),
    ),
  http.protected
    .put("/api/behavior", "v2.behavior.set")
    .mutating()
    .at((ctx) => ({ path: "/api/behavior", headers: ctx.headers(), body: { behaviors: [behavior] } }))
    .json(
      200,
      locationData((value) => {
        array(value)
        check(value.length === 1, "behavior set should return the stored set")
        object(value[0])
        check(value[0].id === behavior.id, "behavior set should keep the behavior id")
      }),
      "status",
    ),
  http.protected
    .put("/api/behavior", "v2.behavior.set.duplicate")
    .at((ctx) => ({ path: "/api/behavior", headers: ctx.headers(), body: { behaviors: [behavior, behavior] } }))
    .json(
      400,
      (body) => {
        object(body)
        check(body._tag === "InvalidRequestError", "duplicate behavior ids should be rejected as invalid requests")
      },
      "status",
    ),
]

function noPullRequestRemote(body: unknown) {
  object(body)
  check(body.name === "PullRequestError", "pull request routes should map the host error")
  object(body.data)
  check(body.data.kind === "no_remote", "isolated repository should reject a missing host remote")
  check(
    body.data.message === "This repository has no github.com or gitlab.com remote",
    "host error should name the missing remote",
  )
}
