import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { InstanceBootstrap } from "@/project/bootstrap"
import { InstanceStore } from "@/project/instance-store"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"

const bootstrapReplacement = [InstanceStore.bootstrapNode, InstanceBootstrap.node] as const

export function build<A, E>(root: LayerNode.Node<A, E, any>, replacements: LayerNode.Replacements = []) {
  // Legacy bootstrap and tools also open native Locations. Their application root
  // must export the existing native services, not only their hidden dependencies.
  return AppNodeBuilder.build(LayerNode.group([root, SessionV2.node, SessionExecution.node]), [
    [SessionExecution.node, SessionExecutionLocal.node],
    ...ArsenalBindings.nativeRegistryReplacements,
    ...replacements,
    bootstrapReplacement,
  ])
}

export * as AppNodeBuilderV1 from "./app-node-builder-v1"
