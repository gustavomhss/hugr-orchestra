export * as NativeSessionFixture from "./native-session"

import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { AppNodeBuilderV1 } from "../../src/effect/app-node-builder-v1"

// Native Locations capture these completed root exports; bootstrap policy stays with the caller.
export function build<A, E, R extends LayerNode.Tag | undefined>(
  root: LayerNode.Node<A, E, R>,
  replacements: LayerNode.Replacements = [],
) {
  return AppNodeBuilder.build(withGlobals(root), [[SessionExecution.node, SessionExecutionLocal.node], ...replacements])
}

// Retain the production legacy registry bindings and real InstanceBootstrap.
export function legacy<A, E, R extends LayerNode.Tag | undefined>(
  root: LayerNode.Node<A, E, R>,
  replacements: LayerNode.Replacements = [],
) {
  return AppNodeBuilderV1.build(withGlobals(root), replacements)
}

function withGlobals<A, E, R extends LayerNode.Tag | undefined>(root: LayerNode.Node<A, E, R>) {
  return LayerNode.group([root, SessionV2.node, SessionExecution.node])
}
