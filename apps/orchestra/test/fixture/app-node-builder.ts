export * as TestAppNodeBuilder from "./app-node-builder"

import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { InstanceStore } from "@/project/instance-store"
import { testInstanceStoreLayer } from "./fixture"

// Use the scoped fixture's real store and controlled bootstrap policy. Native
// registry bindings and Location services remain real without eager config reads.
export function build<A, E, R extends LayerNode.Tag | undefined>(
  root: LayerNode.Node<A, E, R>,
  replacements: LayerNode.Replacements = [],
) {
  return AppNodeBuilder.build(root, [
    ...ArsenalBindings.nativeRegistryReplacements,
    ...replacements,
    [InstanceStore.node, testInstanceStoreLayer],
  ])
}
