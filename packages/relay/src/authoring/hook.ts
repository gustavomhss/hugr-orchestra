export * as AuthoringHook from "./hook"

import { Effect } from "effect"
import type { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import type { RelayHook } from "@opencode-ai/schema/relay-hook"
import type { AuthoringGraph } from "./graph"

// Hook documents (relay_authoring/hooks.py; WP7), with the additive Allow node, Verify Pass/Fail ports and session
// triggers of `RelayHook`.

export const nodeTypes = (): ReadonlyArray<RelayAuthoring.NodeTypeDescriptor> => {
  throw new Error("not implemented")
}

export const isHook = (document: RelayAuthoring.Document): boolean => {
  throw new Error("not implemented")
}

/**
 * `compile_hook`: resolves catalog defaults into each node, then refuses mixed workflow steps, a missing action, not
 * exactly one trigger, invalid ports, cycles, unreachable nodes, empty messages or checks, and Block or Approve on an
 * `after` trigger.
 */
export const compile = (document: RelayAuthoring.Document): Effect.Effect<RelayHook.V1, AuthoringGraph.Refusal> =>
  Effect.die("not implemented")
