import { expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { observe } from "@orchestra/core/activity-monitor"
import { Omni } from "@orchestra/core/omni"
import { Flag } from "@orchestra/core/flag/flag"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ActivityGroup } from "@orchestra/protocol/groups/activity"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { ServerAuth } from "../src/auth"
import { ActivityHandler } from "../src/handlers/activity"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const routes = HttpApiBuilder.layer(
  HttpApi.make("server").add(ActivityGroup).middleware(Authorization).middleware(SchemaErrorMiddleware),
).pipe(
  Layer.provide(ActivityHandler),
  Layer.provide(authorizationLayer),
  Layer.provide(schemaErrorLayer),
  Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some("activity-test") })),
)

const it = testEffect(
  HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
  ),
)

it.live("activity snapshot is authenticated and independent of a project Location", () =>
  Effect.gen(function* () {
    const denied = yield* HttpClient.execute(HttpClientRequest.get("/api/activity"))
    expect(denied.status).toBe(401)
    const response = yield* HttpClientRequest.get("/api/activity").pipe(
      HttpClientRequest.setHeader("Authorization", `Basic ${btoa("orchestra:activity-test")}`),
      HttpClient.execute,
    )
    expect(response.status).toBe(200)
    const snapshot = Schema.decodeUnknownSync(ActivityMonitor.Snapshot)(yield* response.json)
    expect(snapshot.source).toBe("orchestra.omni.ledger")
    expect(snapshot.instanceID).toMatch(/^[0-9a-f-]{36}$/)
    expect(snapshot.coverage).toBe("server-pipe-spawns")
    expect(Array.isArray(snapshot.records)).toBe(true)
  }),
)

it.live.skipIf(Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off")(
  "activity HTTP preserves a real native tree identity separately from PID and observation id",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const binding = yield* Effect.promise(() => Omni.load())
      const child = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const child = binding.spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdin: "pipe" })
          Omni.count("spawns")
          return child
        }),
        (child) => Effect.promise(() => child.stop({ graceMs: 0 })).pipe(Effect.asVoid),
      )
      const recordID = observe(child, "runtime", "HTTP session")
      const denied = yield* HttpClient.execute(HttpClientRequest.get(`/api/activity/${recordID}/inspection`))
      expect(denied.status).toBe(401)
      const response = yield* HttpClientRequest.get(`/api/activity/${recordID}/inspection`).pipe(
        HttpClientRequest.setHeader("Authorization", `Basic ${btoa("orchestra:activity-test")}`),
        HttpClient.execute,
      )
      expect(response.status).toBe(200)
      const snapshot = Schema.decodeUnknownSync(ActivityMonitor.Snapshot)(yield* response.json)
      const row = snapshot.records.find((record) => record.recordID === recordID)
      expect(row?.supervisorID).toBe(child.treeId)
      expect(row?.supervisorID).toMatch(/^\d+:\d+$/)
      expect(row?.pid).toBe(child.pid)
      expect(row?.recordID).not.toBe(row?.supervisorID)
      expect(row?.owner).toBe("HTTP session")
      expect(row?.state).toBe("alive")
      expect(row?.source).toBe("omni.processes")
      expect(row?.members?.some((member) => member.pid === child.pid)).toBe(true)
    }),
  30_000,
)
