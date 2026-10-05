// Connected rows may carry a credential suffix: "<provider>#<credential>".
export function providerIdentity(id: string) {
  const hash = id.indexOf("#")
  if (hash === -1) return { baseID: id, credentialID: undefined }
  return { baseID: id.slice(0, hash), credentialID: id.slice(hash + 1) }
}

type Connection = { readonly type: string; readonly id?: string }

// V2 keeps credentials in the server database, reached through the provider's integration. A row's own
// credential suffix wins; otherwise every stored credential of its integration that is not listed as a row
// of its own. Environment connections cannot be removed from here.
export function storedCredentials(input: {
  providerID: string
  providers: ReadonlyArray<{ readonly id: string; readonly integrationID?: string }>
  integrations: ReadonlyArray<{ readonly id: string; readonly connections: ReadonlyArray<Connection> }>
}) {
  const identity = providerIdentity(input.providerID)
  if (identity.credentialID) return [identity.credentialID]
  const integrationID = input.providers.find((item) => item.id === input.providerID)?.integrationID ?? identity.baseID
  const listed = new Set(input.providers.flatMap((item) => providerIdentity(item.id).credentialID ?? []))
  return (input.integrations.find((item) => item.id === integrationID)?.connections ?? []).flatMap((item) =>
    item.type === "credential" && item.id && !listed.has(item.id) ? [item.id] : [],
  )
}
