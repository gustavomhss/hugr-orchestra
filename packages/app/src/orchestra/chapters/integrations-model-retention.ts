import type { State } from "./integrations-contract"

type Domain = "connections" | "targets" | "bindings"

/** Reserve the complete incoming page and selected metadata before evicting any old window rows. */
export function retainIntegrationRows(state: State, domain: Domain, incoming: Partial<Pick<State, Domain>>, replace = false) {
  const connections = mergeRows(state.connections, incoming.connections ?? [], (row) => row.connection.id,
    state.connectionID, replace && domain === "connections")
  const targets = mergeRows(state.targets, incoming.targets ?? [], (row) => row.target.id,
    state.targetID, replace && domain === "targets")
  const bindings = mergeRows(state.bindings, incoming.bindings ?? [], (row) => row.sessionID,
    undefined, replace && domain === "bindings")
  const ids: Record<Domain, readonly string[]> = { connections: connections.map((row) => row.connection.id), targets: targets.map((row) => row.target.id),
    bindings: bindings.map((row) => row.sessionID) }
  const reserved = new Set<string>([
    ...(incoming.connections?.map((row) => row.connection.id) ?? []),
    ...(incoming.targets?.map((row) => row.target.id) ?? []),
    ...(incoming.bindings?.map((row) => row.sessionID) ?? []),
    ...ids.connections.filter((id) => id === state.connectionID),
    ...ids.targets.filter((id) => id === state.targetID),
  ])
  if (reserved.size > 512) throw "invalid"
  const optional = [...Object.entries(ids).filter(([key]) => key !== domain).flatMap(([, values]) => values), ...ids[domain]]
    .filter((id) => !reserved.has(id))
  const retained = new Set([...reserved, ...optional.slice(Math.max(0, optional.length - (512 - reserved.size)))])
  return { connections: connections.filter((row) => retained.has(row.connection.id)),
    targets: targets.filter((row) => retained.has(row.target.id)), bindings: bindings.filter((row) => retained.has(row.sessionID)) }
}

function mergeRows<T>(previous: readonly T[], incoming: readonly T[], id: (row: T) => string, selected?: string, replace = false) {
  return [...new Map([...(replace ? previous.filter((row) => id(row) === selected) : previous), ...incoming]
    .map((row) => [id(row), row])).values()]
}
