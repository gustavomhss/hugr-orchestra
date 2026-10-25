import { Installation } from "@orchestra/core/installation/service"
import { InvalidRequestError, UnknownError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const InstallationHandler = HttpApiBuilder.group(Api, "server.installation", (handlers) =>
  Effect.gen(function* () {
    const installation = yield* Installation.Service
    return handlers.handle(
      "installation.upgrade",
      Effect.fn(function* (ctx) {
        const method = yield* installation.method()
        if (method === "unknown")
          return yield* new InvalidRequestError({
            message: "Unknown installation method",
            kind: "installation_unknown",
          })
        yield* installation
          .upgrade(method, ctx.payload.target)
          .pipe(Effect.mapError((error) => new UnknownError({ message: error.stderr })))
        return { success: true as const, version: ctx.payload.target }
      }),
    )
  }),
)
