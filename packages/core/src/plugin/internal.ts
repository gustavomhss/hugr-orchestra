export * as PluginInternal from "./internal"

import { makeLocationNode } from "../effect/app-node"
import { httpClient } from "../effect/app-node-platform"
import type { PluginContext } from "@orchestra/plugin/v2/effect"
import { Cause, Effect, Layer, Scope } from "effect"
import { AgentV2 } from "../agent"
import { Catalog } from "../catalog"
import { CommandV2 } from "../command"
import { Config } from "../config"
import { ConfigAgentPlugin } from "../config/plugin/agent"
import { ConfigCommandPlugin } from "../config/plugin/command"
import { ConfigExternalPlugin } from "../config/plugin/external"
import { ConfigProviderPlugin } from "../config/plugin/provider"
import { ConfigReferencePlugin } from "../config/plugin/reference"
import { ConfigSkillPlugin } from "../config/plugin/skill"
import { EventV2 } from "../event"
import { FileSystem } from "../filesystem"
import { FSUtil } from "../fs-util"
import { Global } from "../global"
import { Integration } from "../integration"
import { Location } from "../location"
import { ModelsDev } from "../models-dev"
import { Npm } from "../npm"
import { PluginV2 } from "../plugin"
import { Reference } from "../reference"
import { SkillV2 } from "../skill"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { AgentPlugin } from "./agent"
import { CommandPlugin } from "./command"
import { ModelsDevPlugin } from "./models-dev"
import { ProviderPlugins } from "./provider"
import { VariantPlugin } from "./variant"

export type Requirements =
  | AgentV2.Service
  | Catalog.Service
  | CommandV2.Service
  | Config.Service
  | EventV2.Service
  | FileSystem.Service
  | FSUtil.Service
  | Global.Service
  | HttpClient.HttpClient
  | Integration.Service
  | Location.Service
  | ModelsDev.Service
  | Npm.Service
  | Reference.Service
  | SkillV2.Service

export interface Plugin<R = never> {
  readonly id: string
  readonly effect: (context: PluginContext) => Effect.Effect<void, never, R | Scope.Scope>
}

export function define<R>(plugin: Plugin<R>) {
  return plugin
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    const commands = yield* CommandV2.Service
    const plugin = yield* PluginV2.Service
    const integration = yield* Integration.Service
    const agents = yield* AgentV2.Service
    const config = yield* Config.Service
    const location = yield* Location.Service
    const modelsDev = yield* ModelsDev.Service
    const npm = yield* Npm.Service
    const events = yield* EventV2.Service
    const fs = yield* FSUtil.Service
    const filesystem = yield* FileSystem.Service
    const global = yield* Global.Service
    const http = yield* HttpClient.HttpClient
    const skill = yield* SkillV2.Service
    const reference = yield* Reference.Service
    const load = <R>(input: Plugin<R>) => ({
      id: PluginV2.ID.make(input.id),
      effect: (context: PluginContext) =>
        input
          .effect(context)
          .pipe(
            Effect.provideService(Catalog.Service, catalog),
            Effect.provideService(CommandV2.Service, commands),
            Effect.provideService(Integration.Service, integration),
            Effect.provideService(AgentV2.Service, agents),
            Effect.provideService(Config.Service, config),
            Effect.provideService(Location.Service, location),
            Effect.provideService(ModelsDev.Service, modelsDev),
            Effect.provideService(Npm.Service, npm),
            Effect.provideService(EventV2.Service, events),
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(FileSystem.Service, filesystem),
            Effect.provideService(Global.Service, global),
            Effect.provideService(HttpClient.HttpClient, http),
            Effect.provideService(SkillV2.Service, skill),
            Effect.provideService(Reference.Service, reference),
          ),
    })

    // The boot finishes before the location is handed out. It materializes agents, commands and the catalog once
    // every plugin is added, so a forked boot let the first request on a new location read empty state, and a flush
    // per plugin replays every earlier transform again. A failing plugin is rolled back and the location stays usable.
    yield* plugin
      .boot([
        load(ConfigReferencePlugin.Plugin),
        load(AgentPlugin.Plugin),
        load(CommandPlugin.Plugin),
        load(ModelsDevPlugin),
        load(ConfigAgentPlugin.Plugin),
        load(ConfigCommandPlugin.Plugin),
        load(ConfigSkillPlugin.Plugin),
        ...ProviderPlugins.map(load),
        load(ConfigExternalPlugin.Plugin),
        load(ConfigProviderPlugin.Plugin),
        load(VariantPlugin.Plugin),
      ])
      .pipe(
        Effect.withSpan("PluginInternal.boot"),
        Effect.catchCauseIf(
          (cause) => !Cause.hasInterrupts(cause),
          (cause) => Effect.logError("internal plugin boot failed", { cause }),
        ),
      )
  }),
)

export const locationLayer = layer.pipe(
  Layer.provideMerge(Config.locationLayer),
  Layer.provideMerge(FetchHttpClient.layer),
)

export const node = makeLocationNode({
  name: "plugin-internal",
  layer,
  deps: [
    Catalog.node,
    CommandV2.node,
    PluginV2.node,
    Integration.node,
    AgentV2.node,
    Config.node,
    Location.node,
    ModelsDev.node,
    Npm.node,
    EventV2.node,
    FSUtil.node,
    FileSystem.node,
    Global.node,
    httpClient,
    SkillV2.node,
    Reference.node,
  ],
})
