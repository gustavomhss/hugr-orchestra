import type { QueryClient } from "@tanstack/solid-query"
import type { RelayDocument } from "./client"

// Cancel stale reads without reverting newer observed data. A delayed write/read cannot lower the known version.
export async function rememberDocument(
  client: QueryClient,
  key: readonly unknown[],
  document: RelayDocument,
  active: () => boolean = () => true,
) {
  await client.cancelQueries({ queryKey: key, exact: true }, { revert: false })
  if (!active()) return
  const list = client.setQueryData<RelayDocument[]>(key, (list) => {
    const known = list?.find((item) => item.id === document.id)
    const newer = known && (known.versionCounter > document.versionCounter || (
      known.versionCounter === document.versionCounter && (known.updated ?? 0) > (document.updated ?? 0)
    ))
    return [newer ? known : document, ...(list ?? []).filter((item) => item.id !== document.id)]
  })
  return list?.find((item) => item.id === document.id)
}
