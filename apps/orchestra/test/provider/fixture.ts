export * as ProviderFixture from "./fixture"

import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect } from "effect"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { NativeSessionFixture } from "../fixture/native-session"

// One root owns bootstrap and native execution across every directory in a multi-instance story.
const layer = NativeSessionFixture.build(LayerNode.group([InstanceStore.node, CrossSpawnSpawner.node]), [
  [InstanceStore.bootstrapNode, InstanceBootstrap.node],
])

export const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(layer))
