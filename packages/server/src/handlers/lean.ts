import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LeanProfilePreferences, LeanProject } from "@orchestra/core/session"
import { LeanOutput } from "@orchestra/core/tool/lean-output"
import { ServiceUnavailableError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

// V1's Lean dashboard, read from the same collector and saved profile preferences in the requested Location. A profile
// without its own switch follows the Location config's `tool_output.lean.enabled`, which defaults to on.
export const LeanHandler = HttpApiBuilder.group(Api, "server.lean", (handlers) =>
  Effect.gen(function* () {
    const preferences = LeanProfilePreferences.make(yield* FSUtil.Service, yield* Global.Service)
    const collector = LeanProject.make(yield* Database.Service)
    const owner = Effect.gen(function* () {
      const location = yield* Location.Service
      return { projectID: location.project.id, directory: location.directory }
    })
    const unavailable = (error: LeanProfilePreferences.Unavailable) =>
      new ServiceUnavailableError({ service: "lean", message: error.message })
    return handlers
      .handle("lean.get", () =>
        response(
          Effect.gen(function* () {
            return yield* collector.read(yield* preferences.read(yield* owner), yield* LeanOutput.configured())
          }).pipe(Effect.mapError(unavailable)),
        ),
      )
      .handle("lean.update", (ctx) =>
        response(
          Effect.gen(function* () {
            return yield* collector.read(yield* preferences.update(yield* owner, ctx.payload), yield* LeanOutput.configured())
          }).pipe(Effect.mapError(unavailable)),
        ),
      )
      .handle("lean.history", (ctx) =>
        response(
          Effect.gen(function* () {
            const state = yield* preferences.read(yield* owner)
            return yield* collector.history(state.scope, ctx.params.itemID)
          }).pipe(Effect.mapError(unavailable)),
        ),
      )
  }),
)
