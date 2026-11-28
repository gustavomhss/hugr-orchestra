import { Orchestra } from "@orchestra/client/effect"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Host } from "@orchestra/core/host"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { createEmbeddedRoutes } from "@orchestra/server/routes"
import { Principal } from "@orchestra/server/principal"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { Context, Effect, Exit, Layer, Scope } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { makeOperatorTransport } from "./operator-transport"
import { StorageCustody } from "./storage-custody"

export { StoreInUseError, UnsupportedStoreError } from "./storage-custody"

export type Options = {
  readonly database?: string
  readonly host?: ReadonlyArray<Host.Contribution>
}

const databaseContribution = "sdk-next-database"

export const create = Effect.fn("Orchestra.create")(function* (options?: Options) {
  const filename = options?.database ?? Database.defaultFilename
  const contributions = (options?.host ?? []).map((item) =>
    Object.freeze({
      ...item,
      replacements:
        item.replacements && Object.freeze(item.replacements.map((pair) => Object.freeze([pair[0], pair[1]] as const))),
      nodes: item.nodes && Object.freeze([...item.nodes]),
      locationNodes: item.locationNodes && Object.freeze([...item.locationNodes]),
    }),
  )
  yield* Effect.try({
    try: () => {
      Host.merge([...contributions, { id: databaseContribution }])
      if (
        contributions.some(
          (item) =>
            item.replacements?.some((pair) => pair[0].name === Database.node.name) ||
            item.nodes?.some((node) => node.name === Database.node.name),
        )
      )
        throw new Error("Host contributions may not own Database; use the database option")
    },
    catch: (cause) => new StorageCustody.UnsupportedStoreError({ filename, reason: String(cause) }),
  })
  const parent = yield* Scope.Scope
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      yield* Scope.addFinalizerExit(parent, (exit) => Scope.close(scope, exit))
      return yield* restore(
        Effect.gen(function* () {
          // Registered first, custody closes its retained handle and releases its token after every host resource.
          const custody = yield* StorageCustody.acquire(filename)
          const memoMap = yield* Layer.makeMemoMap
          const selected = Database.layerFromPath(custody.filename)
          const databaseContext = yield* Layer.buildWithMemoMap(
            filename === ":memory:" ? Layer.fresh(selected) : selected,
            memoMap,
            scope,
          )
          const database = Context.get(databaseContext, Database.Service)
          yield* custody.confirm(database)
          // Acquire memory only once: passing a fresh layer to both graphs would create two separate stores.
          const bound = Layer.succeed(Database.Service, database)
          const hosts: readonly Host.Contribution[] = Object.freeze([
            ...contributions,
            { id: databaseContribution, replacements: [[Database.node, bound]] },
          ])
          const merged = Host.merge(hosts)
          const context = yield* Layer.buildWithMemoMap(
            AppNodeBuilder.build(
              LayerNode.group([
                Database.node,
                ApplicationTools.node,
                PermissionSaved.node,
                ClaudeCodeAccount.node,
                ...merged.nodes,
              ]),
              merged.replacements,
              merged.locationNodes,
            ),
            memoMap,
            scope,
          )
          const tools = Context.get(context, ApplicationTools.Service)
          const permissions = Context.get(context, PermissionSaved.Service)
          const account = Context.get(context, ClaudeCodeAccount.Service)
          const operator = yield* CapabilityOperator.make({
            principal: Principal.account(),
            scope: { placements: "instance", actions: ["*"] },
          }).pipe(Effect.orDie)
          const web = yield* Effect.acquireRelease(
            Effect.sync(() =>
              HttpRouter.toWebHandler(
                createEmbeddedRoutes({ operator, host: hosts }).pipe(
                  HttpRouter.provideRequest(
                    Layer.mergeAll(
                      Layer.succeed(PermissionSaved.Service, permissions),
                      Layer.succeed(ClaudeCodeAccount.Service, account),
                    ),
                  ),
                  Layer.provide(HttpServer.layerServices),
                ),
                { disableLogger: true, memoMap },
              ),
            ),
            (web) => Effect.promise(web.dispose),
          )
          const transport = yield* makeOperatorTransport(web.handler, operator).pipe(Effect.orDie)
          const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
            Effect.provide(FetchHttpClient.layer),
            Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
          )
          return { ...client, tools: { register: tools.register } }
        }).pipe(
          Effect.provideService(Scope.Scope, scope),
          Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
        ),
      )
    }),
  )
})

export type Interface = Effect.Success<ReturnType<typeof create>>

export class Service extends Context.Service<Service, Interface>()("@orchestra/sdk-next/Orchestra") {}

export const layer = Layer.effect(Service, create())
