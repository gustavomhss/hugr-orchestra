import { ActivityMonitor } from "@orchestra/core/activity-monitor"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { Global } from "@orchestra/core/global"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

const disk = ActivityDisk.make([
  { id: "cache", path: Global.Path.cache },
  { id: "logs", path: Global.Path.log },
  { id: "temporary", path: Global.Path.tmp },
])

export const ActivityHandler = HttpApiBuilder.group(Api, "server.activity", (handlers) =>
  handlers
    .handle("activity.disk", () => Effect.sync(() => disk.snapshot()))
    .handle("activity.readDisk", (ctx) =>
      Effect.promise(() => disk.read(ctx.params.rootID)).pipe(Effect.map(() => disk.snapshot())),
    )
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
