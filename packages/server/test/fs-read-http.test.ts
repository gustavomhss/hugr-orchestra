import { expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Database } from "@orchestra/core/database/database"
import { FileSystem } from "@orchestra/core/filesystem"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AppProcess } from "@orchestra/core/process"
import { FSUtil } from "@orchestra/core/fs-util"
import { ProjectV2 } from "@orchestra/core/project"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { makeFileSystemGroup } from "@orchestra/protocol/groups/fs"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Effect, Layer, Option } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { ServerAuth } from "../src/auth"
import { FileSystemHandler } from "../src/handlers/fs"
import { LocationMiddleware, layer } from "../src/location"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

// A Location's task tool captures the process-global Session services, so the fixture exports them as the server does.
const services = AppNodeBuilder.build(
  LayerNode.group([
    Database.node,
    LocationServiceMap.node,
    AppProcess.node,
    FSUtil.node,
    ProjectV2.node,
    SessionV2.node,
    SessionExecution.node,
  ]),
  [[SessionExecution.node, SessionExecution.noopLayer]],
)
// Serve the actual fs group, handler and location middleware over TCP; other API groups are outside this fixture.
const routes = HttpApiBuilder.layer(
  HttpApi.make("server").add(makeFileSystemGroup(LocationMiddleware)).middleware(SchemaErrorMiddleware),
).pipe(
  Layer.provide(FileSystemHandler),
  Layer.provide(layer),
  Layer.provide(schemaErrorLayer),
  Layer.provide(authorizationLayer),
  Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
)
const it = testEffect(
  HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(services),
  ),
)

const read = (file: string, directory: string) =>
  HttpClientRequest.get("/api/fs/read").pipe(
    HttpClientRequest.setUrlParam("path", file),
    HttpClientRequest.setUrlParam("location[directory]", directory),
    HttpClient.execute,
  )

it.live("fs.read serves a file and answers the declared 400 for a path it cannot serve", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const directory = yield* Effect.promise(() => fs.realpath(tmp.path))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "hello.txt"), "hello"))
    yield* Effect.promise(() => fs.mkdir(path.join(directory, "folder")))

    // A sparse file past the cap costs no disk or memory to create.
    yield* Effect.promise(async () => {
      await fs.writeFile(path.join(directory, "huge.bin"), "")
      await fs.truncate(path.join(directory, "huge.bin"), FileSystem.READ_LIMIT + 1)
    })

    const served = yield* read("hello.txt", directory)
    expect(served.status).toBe(200)
    expect(yield* served.text).toBe("hello")
    // The file is served in the type its extension names, so the browser must not sniff or script it.
    expect(served.headers["x-content-type-options"]).toBe("nosniff")
    expect(served.headers["content-security-policy"]).toBe("sandbox")

    for (const [file, kind] of [
      ["missing.txt", "file_not_found"],
      ["../outside.txt", "path_outside_location"],
      ["folder", "not_a_file"],
      ["huge.bin", "file_too_large"],
    ]) {
      const refused = yield* read(file, directory)
      expect(refused.status).toBe(400)
      expect(yield* refused.json).toMatchObject({ _tag: "InvalidRequestError", kind, field: "path" })
    }
  }),
)
