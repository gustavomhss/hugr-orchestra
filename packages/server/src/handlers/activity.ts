import { ActivityMonitor } from "@orchestra/core/activity-monitor"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { ActivityDocker } from "@orchestra/core/activity-docker"
import { ActivityExternalCache } from "@orchestra/core/activity-external-cache"
import { Flag } from "@orchestra/core/flag/flag"
import { ActivityWorktree } from "@orchestra/core/activity-worktree"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { ConflictError, InvalidRequestError, ServiceUnavailableError } from "@orchestra/protocol/errors"
import { Context, Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ActivityWorktreeRegistry } from "../activity-worktree"

export const ExternalCacheInventory = Context.Reference<ActivityExternalCache.Inventory | undefined>(
  "@orchestra/server/ExternalCacheInventory",
  { defaultValue: () => undefined },
)

const disk = ActivityDisk.make([
  { id: "cache", path: Global.Path.cache },
  { id: "logs", path: Global.Path.log },
  { id: "temporary", path: Global.Path.tmp },
])

export const ActivityHandler = HttpApiBuilder.group(Api, "server.activity", (handlers) =>
  Effect.gen(function* () {
    const worktrees = yield* ActivityWorktreeRegistry.Service
    const docker = ActivityDocker.make()
    const externalCaches = (yield* ExternalCacheInventory) ??
      ActivityExternalCache.make(ActivityExternalCache.parseDeclaration(Flag.ORCHESTRA_ACTIVITY_EXTERNAL_CACHES))
    const processContext = yield* Effect.context<AppProcess.Service>().pipe(
      Effect.map(Context.pick(AppProcess.Service)),
    )
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
      .handle("activity.docker", () => Effect.sync(docker.snapshot))
      .handle("activity.readDocker", () =>
        docker.read().pipe(
          Effect.provideContext(processContext),
          Effect.mapError(
            () =>
              new ServiceUnavailableError({
                message: "Docker container inventory collector is unavailable",
                service: "activity.docker",
              }),
          ),
        ),
      )
      .handle("activity.externalCaches", () => Effect.sync(externalCaches.snapshot))
      .handle("activity.readExternalCache", (ctx) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() => externalCaches.read(ctx.params.id))
          if (result.status === "observed") return result.snapshot
          if (result.status === "busy")
            return yield* new ConflictError({
              message: "An external cache reading is already in progress",
              resource: "activity.external-caches",
            })
          return yield* new InvalidRequestError({
            message: "Unknown external cache observation",
            field: "id",
          })
        }),
      )
      .handle("activity.disk", () => Effect.sync(() => disk.snapshot()))
      .handle("activity.readDisk", (ctx) =>
        Effect.promise(() => disk.read(ctx.params.rootID)).pipe(Effect.map(() => disk.snapshot())),
      )
      .handle("activity.snapshot", () => Effect.sync(ActivityMonitor.snapshot))
      .handle("activity.inspect", (ctx) =>
        Effect.gen(function* () {
          const snapshot = yield* Effect.promise(() => ActivityMonitor.inspect(ctx.params.recordID))
          if (!snapshot)
            return yield* new InvalidRequestError({
              message: "Process observation is no longer available",
              field: "recordID",
            })
          return snapshot
        }),
      )
  }),
)
