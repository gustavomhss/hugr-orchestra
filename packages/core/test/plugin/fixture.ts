import { AgentV2 } from "@orchestra/core/agent"
import { AISDK } from "@orchestra/core/aisdk"
import { Catalog } from "@orchestra/core/catalog"
import { CommandV2 } from "@orchestra/core/command"
import { Credential } from "@orchestra/core/credential"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FileSystem } from "@orchestra/core/filesystem"
import { FSUtil } from "@orchestra/core/fs-util"
import { Integration } from "@orchestra/core/integration"
import { Location } from "@orchestra/core/location"
import { Npm } from "@orchestra/core/npm"
import { PluginV2 } from "@orchestra/core/plugin"
import { Reference } from "@orchestra/core/reference"
import { SkillV2 } from "@orchestra/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
