export * as McpProvided from "./provided"

// MCP servers a product module serves in process, such as one per interface open in the MCP Dock. They come and go
// while the process runs, are never written to config, and connect over a transport the module hands out.

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "../effect/app-node"

export type Server = {
  readonly name: string
  // Changes when the server behind the name changes (a new tab, a reloaded document); a new key reconnects it.
  readonly key: string
  readonly connect: () => Transport
}

export interface Interface {
  /**
   * The servers available now. Asked before every provider turn, so it must answer fast and bound its own waits; a
   * failure keeps the servers of the last answer.
   */
  readonly servers: () => Effect.Effect<ReadonlyArray<Server>, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/McpProvided") {}

/** Keeps the last answer of `servers` by name and says which names left and which are new or changed since. */
export function tracker(service: Interface) {
  const current = new Map<string, Server>()
  const update = Effect.fnUntraced(function* () {
    const listed = yield* service.servers().pipe(Effect.orElseSucceed(() => undefined))
    if (!listed) return { gone: [], changed: [] }
    const names = new Set(listed.map((server) => server.name))
    const gone = Array.from(current.keys()).filter((name) => !names.has(name))
    const changed = listed.filter((server) => current.get(server.name)?.key !== server.key)
    for (const name of gone) current.delete(name)
    for (const server of changed) current.set(server.name, server)
    return { gone, changed: changed.map((server) => server.name) }
  })
  return { current, update }
}

export const layer = Layer.succeed(Service, Service.of({ servers: () => Effect.succeed([]) }))

/** A product serves its servers by replacing this node (Host.Contribution.replacements). */
export const node = makeGlobalNode({ service: Service, layer, deps: [] })
