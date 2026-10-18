export * as OmniBoot from "./omni-boot"

// The main process's two omni steps (behind ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER): locate omni's files at start-up,
// and the smoke report once the sidecar is healthy.

import type { initLogging } from "./logging"
import { OmniHost } from "./omni-host"
import { OmniSmoke } from "./omni-smoke"

export function setup() {
  OmniHost.setup()
}

/** Never fails: a failed report is logged. */
export function report(
  server: { url: string; username: string; password: string },
  logger: Pick<ReturnType<typeof initLogging>, "error">,
) {
  return OmniSmoke.report(server).catch((error: unknown) => logger.error("omni smoke report failed", error))
}
