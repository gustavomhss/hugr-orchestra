// Connected rows may carry a credential suffix: "<provider>#<credential>".
export function providerIdentity(id: string) {
  const hash = id.indexOf("#")
  if (hash === -1) return { baseID: id, credentialID: undefined }
  return { baseID: id.slice(0, hash), credentialID: id.slice(hash + 1) }
}

type Connection =
  | { readonly type: "credential"; readonly id: string; readonly label: string }
  | { readonly type: "env"; readonly name: string }

export type DisconnectPlan =
  | { type: "remove"; ids: string[]; labels: string[] }
  | { type: "env"; names: string[] }
  | { type: "labelled"; labels: string[] }
  | { type: "none" }

// What Disconnect removes on V2, where credentials live in the server database and reach a provider through its
// integration's connections. A credential row removes its own credential. The base row removes the integration's
// credentials that have no row of their own: "default" ones, and labelled ones the catalog does not list as rows
// (it only lists labelled API keys; OAuth credentials can carry labels too). Environment variables and labelled
// keys shown as their own rows are reported instead of removed.
export function disconnectPlan(input: {
  providerID: string
  catalog: ReadonlyArray<{ readonly id: string; readonly integrationID?: string }>
  integrations: ReadonlyArray<{ readonly id: string; readonly connections: ReadonlyArray<Connection> }>
}): DisconnectPlan {
  const identity = providerIdentity(input.providerID)
  const integrationID = input.catalog.find((item) => item.id === input.providerID)?.integrationID ?? identity.baseID
  const connections = input.integrations.find((item) => item.id === integrationID)?.connections ?? []
  const credentials = connections.flatMap((item) => (item.type === "credential" ? [item] : []))
  if (identity.credentialID) {
    const own = credentials.find((item) => item.id === identity.credentialID)
    return { type: "remove", ids: [identity.credentialID], labels: [own?.label ?? identity.credentialID] }
  }
  const rows = new Set(input.catalog.flatMap((item) => providerIdentity(item.id).credentialID ?? []))
  const owned = credentials.filter((item) => item.label === "default" || !rows.has(item.id))
  if (owned.length)
    return { type: "remove", ids: owned.map((item) => item.id), labels: owned.map((item) => item.label) }
  const env = connections.flatMap((item) => (item.type === "env" ? [item.name] : []))
  if (env.length) return { type: "env", names: env }
  if (credentials.length) return { type: "labelled", labels: credentials.map((item) => item.label) }
  return { type: "none" }
}
