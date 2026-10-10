import { Orchestra } from "@orchestra/client"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Schema } from "effect"
import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import type { Api } from "./integrations-contract"

/** Immutable selected-host transport. Authority is supplied by Basic or an ephemeral host-issued bearer. */
export function createIntegrationsApi(input: { server: ServerConnection.HttpBase; directory: string;
  bearer?: string; fetch?: typeof globalThis.fetch }): Api {
  const location = Object.freeze({ directory: input.directory })
  if (input.bearer !== undefined && !/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(input.bearer))
    throw new TypeError("Invalid integration authorization")
  const client = Orchestra.make({ baseUrl: input.server.url, fetch: input.fetch,
    headers: input.server.password ? { Authorization: `Basic ${authTokenFromCredentials({ username: input.server.username,
      password: input.server.password })}` }
      : input.bearer ? { Authorization: `Bearer ${input.bearer}` } : undefined })
  return Object.freeze({
    list: (after, options) => client.connections.list({ location, limit: 32, ...(after === undefined ? {} : { after }) }, options)
      .then(Schema.decodeUnknownSync(CapabilityManagement.ConnectionPage, { onExcessProperty: "error" })),
    get: (connectionID, options) => client.connections.get({ location, connectionID }, options)
      .then(Schema.decodeUnknownSync(CapabilityManagement.Connection, { onExcessProperty: "error" })),
    getTarget: (targetID, options) => client.connections.getTarget({ location, targetID }, options)
      .then(Schema.decodeUnknownSync(CapabilityManagement.Target, { onExcessProperty: "error" })),
    targets: (connectionID, after, options) => client.connections.targets({ location, connectionID, limit: 32,
      ...(after === undefined ? {} : { after }) }, options)
      .then(Schema.decodeUnknownSync(CapabilityManagement.TargetPage, { onExcessProperty: "error" })),
    bindings: (targetID, after, options) => client.connections.bindings({ location, targetID, limit: 32,
      ...(after === undefined ? {} : { after }) }, options)
      .then(Schema.decodeUnknownSync(CapabilityManagement.BindingPage, { onExcessProperty: "error" })),
    connect: (input, key, options) => client.connections.connect({ location, ...input, "idempotency-key": key }, options),
    createTarget: (connection, input, key, options) => client.connections.createTarget({ location, connection, input, "idempotency-key": key }, options),
    retargetTarget: (target, input, key, options) => client.connections.retargetTarget({ location, target, input, "idempotency-key": key }, options),
    removeTarget: (target, key, options) => client.connections.removeTarget({ location, target, "idempotency-key": key }, options),
    disconnect: (connection, key, options) => client.connections.disconnect({ location, connection, "idempotency-key": key }, options),
    bind: (target, input, key, options) => client.connections.bind({ location, target, input, "idempotency-key": key }, options),
    unbind: (target, sessionID, key, options) => client.connections.unbind({ location, target, sessionID, "idempotency-key": key }, options),
  } satisfies Api)
}
