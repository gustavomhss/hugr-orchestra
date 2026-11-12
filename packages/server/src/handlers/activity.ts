import { ActivityMonitor } from "@orchestra/core/activity-monitor"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { ActivityWorktree } from "@orchestra/core/activity-worktree"
import { Global } from "@orchestra/core/global"
import { ConflictError, InvalidRequestError, ServiceUnavailableError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ActivityWorktreeRegistry } from "../activity-worktree"

const disk = ActivityDisk.make([
  { id: "cache", path: Global.Path.cache },
  { id: "logs", path: Global.Path.log },
  { id: "temporary", path: Global.Path.tmp },
])

export const ActivityHandler = HttpApiBuilder.group(Api, "server.activity", (handlers) =>
  Effect.gen(function* () {
    const worktrees = yield* ActivityWorktreeRegistry.Service
    return handlers
      .handle("activity.worktrees", () =>
        Effect.tryPromise({
          try: () => worktrees.inventory(),
          catch: () =>
            new ServiceUnavailableError({
              message: "Worktree registry is temporarily unavailable",
              service: "activity.worktrees",
            }),
        }),
      )
      .handle("activity.readWorktree", (ctx) =>
        Effect.gen(function* () {
          const snapshot = yield* Effect.tryPromise({
            try: () => worktrees.read(ctx.params.recordID),
            catch: (error) =>
              error instanceof ActivityWorktree.ReadCapacityError
                ? new ConflictError({
                    message: "All worktree reading slots are occupied",
                    resource: "activity.worktrees",
                  })
                : new ServiceUnavailableError({
                    message: "Worktree reading is temporarily unavailable",
                    service: "activity.worktrees",
                  }),
          })
          if (!snapshot)
            return yield* new InvalidRequestError({
              message: "Worktree observation is no longer available",
              field: "recordID",
            })
          return snapshot
        }),
      )
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
      )
  }),
)
