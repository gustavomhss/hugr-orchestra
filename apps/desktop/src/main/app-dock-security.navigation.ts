// The navigation-during-load scenario (U34) of the MCP Dock native harness (app-dock-security.test.ts), which
// bundles this module and runs it inside its Electron child.
import type { ServerResponse } from "node:http"
import { check, type PopupHarness } from "./app-dock-security.popups"

// A fixture URL that never answers until `release`, so a load of it stays in flight.
export function createHold() {
  let held: ServerResponse | undefined
  let resolveRequested: () => void = () => {}
  const requested = new Promise<void>((resolve) => {
    resolveRequested = resolve
  })
  return {
    requested,
    capture: (response: ServerResponse) => {
      held = response
      resolveRequested()
    },
    release: () => held?.end("<!doctype html><title>held</title><body>held</body>"),
  }
}

// `open` starts its load without waiting for it. A navigation requested while that load is still in flight must
// wait for it instead of aborting it, or Electron rejects the navigation with the aborted load's ERR_ABORTED (-3).
export async function navigateDuringInitialLoad(harness: PopupHarness, hold: ReturnType<typeof createHold>) {
  const frame = harness.ipcWin.webContents.mainFrame
  const tab = await harness.invoke(frame, "app-dock-open", [`${harness.base}/hold`, harness.bounds, "u34-profile"])
  await hold.requested
  const target = `${harness.base}/after-hold`
  const navigated = harness.invoke(frame, "app-dock-navigate", [tab.tabID, target])
  // This read reaches the renderer after the navigate call, so the main process has the navigation by now. If it
  // did not, the load would be released first and the scenario would only lose its power, not fail.
  await harness.execute("u34:event-read", harness.ipcWin.webContents, "window.__appDockEvents")
  hold.release()
  const result = await navigated
  check(result.ok && result.url === target, "navigate during the initial load did not land on its target")
  await harness.invoke(frame, "app-dock-close-tab", [tab.tabID])
  return "navigate requested during the open's in-flight load waits for it and lands on its own target"
}
