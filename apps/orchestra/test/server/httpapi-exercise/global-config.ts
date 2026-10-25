import { Effect } from "effect"
import path from "path"
import { check, object } from "./assertions"
import { http } from "./dsl"
import { exerciseConfigDirectory } from "./environment"
import type { Scenario } from "./types"

export const globalConfigScenarios: Scenario[] = [
  // The app's folder picker starts at the home directory this route names.
  http.protected.get("/api/location/paths", "v2.location.paths").json(200, (body) => {
    object(body)
    check(typeof body.home === "string" && body.home.length > 0, "v2 location paths must name the server home")
  }),
  http.protected.get("/global/config", "global.config.get").global().json(),
  http.protected
    .patch("/global/config", "global.config.update")
    .global()
    .seeded(() =>
      Effect.promise(() =>
        Bun.write(
          path.join(exerciseConfigDirectory, "orchestra.jsonc"),
          JSON.stringify({ username: "httpapi-global" }, null, 2),
        ),
      ),
    )
    .at(() => ({ path: "/global/config", body: { username: "httpapi-global" } }))
    .jsonEffect(
      200,
      (body) =>
        Effect.gen(function* () {
          object(body)
          check(body.username === "httpapi-global", "global config update should return patched config")
          const text = yield* Effect.promise(() =>
            Bun.file(path.join(exerciseConfigDirectory, "orchestra.jsonc")).text(),
          )
          check(text.includes('"username": "httpapi-global"'), "global config update should write isolated config file")
        }),
      "status",
    ),
  http.protected
    .post("/global/dispose", "global.dispose")
    .global()
    .mutating()
    .json(
      200,
      (body) => {
        check(body === true, "global dispose should return true")
      },
      "status",
    ),
]
