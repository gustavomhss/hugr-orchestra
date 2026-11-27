import { expect } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { Database } from "@orchestra/core/database/database"
import { setup } from "../../core/test/fixture/activity-worktree"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { ActivityGroup } from "@orchestra/protocol/groups/activity"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ActivityWorktreeRegistry } from "../src/activity-worktree"
import { ActivityHandler } from "../src/handlers/activity"
import { ServerAuth } from "../src/auth"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

export { it, bounded, entered } from "../../core/test/fixture/activity-worktree"

export function serve(
  input: {
    measure?: typeof ActivityDisk.measure
    fixture?: Effect.Success<typeof setup>
    afterRegistryRead?: () => Promise<void>
    afterReadAdmission?: () => void
  } = {},
) {
  return Effect.gen(function* () {
    const fixture = input.fixture ?? (yield* setup)
    const calls = { walks: 0 }
    const context = yield* Layer.build(
      ActivityWorktreeRegistry.layer({
        afterRegistryRead: input.afterRegistryRead,
        measure: (directory, limits) => {
          calls.walks++
          return (input.measure ?? ActivityDisk.measure)(directory, limits)
        },
      }).pipe(Layer.provide(Layer.succeed(Database.Service, fixture.database))),
    )
    const monitor = Context.get(context, ActivityWorktreeRegistry.Service)
    const observed = {
      ...monitor,
      read(recordID: string) {
        const admitted = monitor.read(recordID)
        input.afterReadAdmission?.()
        return admitted
      },
    }
    const routes = HttpApiBuilder.layer(
      HttpApi.make("server").add(ActivityGroup).middleware(Authorization).middleware(SchemaErrorMiddleware),
    ).pipe(
      Layer.provide(ActivityHandler),
      Layer.provide(Layer.succeed(ActivityWorktreeRegistry.Service, observed)),
      Layer.provide(authorizationLayer),
      Layer.provide(schemaErrorLayer),
      Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some("activity-test") })),
      Layer.provide(HttpServer.layerServices),
    )
    const web = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
      (value) => Effect.promise(() => value.dispose()),
    )
    const headers = ServerAuth.headers({ username: "orchestra", password: "activity-test" })
    const request = (pathname: string, init: RequestInit = {}, authenticated = true) =>
      web.handler(
        new Request(new URL(pathname, "http://activity.test"), {
          ...init,
          headers: { ...(authenticated ? headers : {}), ...init.headers },
        }),
      )
    const client = Orchestra.make({
      baseUrl: "http://activity.test",
      headers,
      fetch: Object.assign(
        (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => web.handler(new Request(url, init)),
        { preconnect: fetch.preconnect },
      ),
    })
    return {
      ...fixture,
      calls,
      request,
      client,
      snapshot: monitor.snapshot,
      async inventory() {
        const response = await request("/api/activity/worktrees")
        expect(response.status).toBe(200)
        return Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await response.json())
      },
      read: (recordID: string, init: RequestInit = {}) =>
        request(`/api/activity/worktrees/${encodeURIComponent(recordID)}/read`, { ...init, method: "POST" }),
    }
  })
}
