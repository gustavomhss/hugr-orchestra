import { expect } from "bun:test"
import { stat } from "node:fs/promises"
import { Context, Deferred, Effect, Exit, Layer, Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import type { Host } from "@orchestra/core/host"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { Orchestra } from "../../src"

class Resource extends Context.Service<Resource, object>()("test/EmbeddedCustodyResource") {}

export const directory = () =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

export function resource(options: {
  state: { builds: number; files: string[]; fail?: boolean }
  close?: Effect.Effect<void>
}): Host.Contribution {
  return {
    id: "custody-resource",
    nodes: [
      makeGlobalNode({
        service: Resource,
        layer: Layer.effect(
          Resource,
          Effect.gen(function* () {
            const database = yield* Database.Service
            const main = yield* database.db.all<{ file: string }>(
              "SELECT file FROM pragma_database_list WHERE name = 'main'",
            )
            options.state.builds++
            options.state.files.push(main[0]?.file ?? "")
            if (options.state.fail) return yield* Effect.die(new Error("controlled contributed construction failure"))
            return yield* Effect.acquireRelease(Effect.succeed({}), () => options.close ?? Effect.void)
          }),
        ),
        deps: [Database.node],
      }),
    ],
  }
}

export function host(database: string, contributions: readonly Host.Contribution[] = []) {
  return Effect.gen(function* () {
    const scope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
    const client = yield* Orchestra.create({ database, host: contributions }).pipe(
      Effect.provideService(Scope.Scope, scope),
    )
    // Baseline ignores create options: fail here as API RED before waiting on an uninstalled provider/resource.
    if (database !== ":memory:") {
      expect(yield* Effect.promise(() => awaitFile(database))).toBe(true)
    }
    return { client, scope }
  })
}

async function awaitFile(filename: string) {
  return stat(filename).then(
    (info) => info.isFile() && info.size > 0,
    () => false,
  )
}

export function provider() {
  return Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const gate = Promise.withResolvers<void>()
    const requests: unknown[] = []
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          port: 0,
          async fetch(request) {
            requests.push(await request.json())
            Effect.runSync(Deferred.succeed(started, undefined))
            await gate.promise
            return new Response(
              'data: {"id":"custody","choices":[{"index":0,"delta":{"content":"custody survived"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
              { headers: { "Content-Type": "text/event-stream" } },
            )
          },
        }),
      ),
      (server) =>
        Effect.promise(async () => {
          gate.resolve()
          await server.stop(true)
        }),
    )
    const info = ModelV2.Info.empty(ProviderV2.ID.make("custody-http"), ModelV2.ID.make("custody-http-model"))
    const model = yield* SessionRunnerModel.fromCatalogModel({
      ...info,
      api: {
        id: info.id,
        type: "aisdk",
        package: "@ai-sdk/openai-compatible",
        url: server.url.origin + "/v1",
        settings: {},
      },
      capabilities: { tools: true, input: ["text"], output: ["text"] },
      limit: { context: 20000, output: 100 },
    })
    const contribution: Host.Contribution = {
      id: "custody-http-model",
      replacements: [[SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.succeed(model))]],
    }
    return { contribution, started, requests, release: () => gate.resolve() }
  })
}
