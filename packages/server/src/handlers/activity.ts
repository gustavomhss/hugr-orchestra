import { ActivityMonitor } from "@orchestra/core/activity-monitor"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const ActivityHandler = HttpApiBuilder.group(Api, "server.activity", (handlers) =>
  handlers
    .handle("activity.snapshot", () => Effect.promise(() => ActivityMonitor.snapshot()))
    .handle("activity.inspect", (ctx) =>
      Effect.gen(function* () {
        const found = yield* Effect.promise(() => ActivityMonitor.inspect(ctx.params.recordID))
        if (!found)
          return yield* new InvalidRequestError({
            message: "Process observation is no longer available",
            field: "recordID",
          })
        return yield* Effect.promise(() => ActivityMonitor.snapshot())
      }),
    ),
)
