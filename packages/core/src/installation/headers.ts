export * as InstallationHeaders from "./headers"

import { InstallationVersion } from "./version"

export function forFreeModel(
  providerID: string,
  costs: ReadonlyArray<{ readonly input: number; readonly output: number }>,
  headers: Record<string, string>,
) {
  if (!providerID.startsWith("opencode") || costs.length === 0) return headers
  if (!costs.every((cost) => cost.input === 0 && cost.output === 0)) return headers
  // Apply after config/plugin overrides, removing every casing of User-Agent.
  return {
    ...Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== "user-agent")),
    "User-Agent": `opencode/${InstallationVersion}`,
  }
}
