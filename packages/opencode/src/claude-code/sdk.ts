export * as ClaudeCodeSDK from "./sdk"

import { Context, Layer } from "effect"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"

/** The Claude Agent SDK entry point, behind a service so tests can script a session. */
export interface Interface {
  readonly query: typeof query
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ClaudeCodeSDK") {}

export const layer = Layer.succeed(Service, Service.of({ query }))

export const node = LayerNode.make({ service: Service, layer, deps: [] })
