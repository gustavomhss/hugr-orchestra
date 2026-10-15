import { Effect, Layer } from "effect"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { Relay } from "@orchestra/core/relay"
import { AbsolutePath } from "@orchestra/core/schema"
import { tmpdirScoped } from "../fixture/fixture"

/**
 * The real Relay service of one project directory, as its Location binds it, over a fresh data directory. The arms and
 * their keyed ledgers land under `<data>/relay/<projectID>/`. No config document: Arsenal arms never use the judge.
 */
export const relayFor = (input: { readonly directory: string; readonly projectID: string }) =>
  Effect.gen(function* () {
    const data = yield* tmpdirScoped()
    const home = yield* tmpdirScoped()
    const directory = AbsolutePath.make(input.directory)
    return yield* Effect.gen(function* () {
      return yield* Relay.Service
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([Relay.node]), [
          [Global.node, Global.layerWith({ data, home })],
          [
            Location.node,
            Layer.succeed(
              Location.Service,
              Location.Service.of({ directory, project: { id: Project.ID.make(input.projectID), directory } }),
            ),
          ],
          [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
        ]),
      ),
    )
  })
