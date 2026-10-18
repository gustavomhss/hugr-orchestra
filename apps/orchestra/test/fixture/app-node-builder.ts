export * as TestAppNodeBuilder from "./app-node-builder"

import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { ArsenalNative } from "@orchestra/maestro/arsenal-native"
import { InstanceStore } from "@/project/instance-store"
import { testInstanceStoreLayer } from "./fixture"

// Use the scoped fixture's real store and controlled bootstrap policy. Native
// registry bindings and Location services remain real without eager config reads.
export function build<A, E, R extends LayerNode.Tag | undefined>(
  root: LayerNode.Node<A, E, R>,
  replacements: LayerNode.Replacements = [],
) {
  return AppNodeBuilder.build(
    LayerNode.group([root, SessionV2.node, SessionExecution.node, SessionSubagentModels.node]),
    [
      [SessionExecution.node, SessionExecutionLocal.node],
      ...ArsenalNative.nativeRegistryReplacements,
      ...replacements,
      [InstanceStore.node, testInstanceStoreLayer],
    ],
  )
}
