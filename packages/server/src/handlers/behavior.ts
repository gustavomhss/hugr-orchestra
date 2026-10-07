import { BehaviorV2 } from "@orchestra/core/behavior"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const BehaviorHandler = HttpApiBuilder.group(Api, "server.behavior", (handlers) =>
  handlers.handle(
    "behavior.set",
    Effect.fn(function* (ctx) {
      const behavior = yield* BehaviorV2.Service
      return yield* response(behavior.set(ctx.payload.behaviors)).pipe(
        Effect.catchTag("BehaviorV2.DuplicateError", (error) =>
          Effect.fail(new InvalidRequestError({ message: error.message, kind: "duplicate", field: "behaviors" })),
        ),
      )
    }),
  ),
)
