import type { RelayClient } from "./client"
import type { RelayRun } from "./runs"

export async function runVersion(client: Pick<RelayClient, "version" | "versions">, run: RelayRun) {
  // Older observation servers expose a counter. Resolve it through the real versions list, never an ID cast.
  const version = run.versionID
    ? await client.version(run.documentID, run.versionID)
    : run.version !== undefined
      ? (await client.versions(run.documentID)).find((item) => item.versionCounter === run.version)
      : undefined
  if (!version || version.workflowId !== run.documentID || (run.versionID && version.versionId !== run.versionID)) return null
  return version
}
