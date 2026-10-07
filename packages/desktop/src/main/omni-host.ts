export * as OmniHost from "./omni-host"

// Where the desktop's omni files are (D-L8), for the main process and for the server's utilityProcess, each with its
// own supervisor. Only with OPENCODE_EXPERIMENTAL_OMNI_SPAWNER on; off, nothing here runs.

import { existsSync } from "node:fs"
import { join } from "node:path"
import { app } from "electron"
import { Omni } from "@opencode-ai/core/omni"
import { DesktopOmni } from "./omni-process"

export const ADDON = "hugr_omni.node"
export const SUPERVISOR = `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`

/**
 * A packaged app needs nothing: core's loader finds process.resourcesPath/omni by itself, and HUGR_OMNI_* (CI, a
 * developer) stays its explicit choice. A checkout run (electron-vite dev) injects resources/omni, which predev
 * stages: the bundled loader's own checkout fallback points inside out/, not at packages/omni.
 */
export function setup() {
  if (!DesktopOmni.enabled() || app.isPackaged) return
  if (process.env.HUGR_OMNI_ADDON || process.env.HUGR_OMNI_SUPERVISOR) return
  const dir = join(app.getAppPath(), "resources", "omni")
  const paths = { addon: join(dir, ADDON), supervisor: join(dir, SUPERVISOR) }
  if (existsSync(paths.addon) && existsSync(paths.supervisor)) Omni.configure(paths)
}

/**
 * The fork env of the server's utilityProcess: the files this process resolved, which the server's loader reads on
 * the JS side (HUGR_OMNI_*) before it loads the addon; Electron's Node also gets them as real process-start
 * variables. Throws, loudly and with every place it looked, when a file is missing.
 */
export function sidecarEnv(): Record<string, string> {
  if (!DesktopOmni.enabled()) return {}
  const found = Omni.locate()
  return { HUGR_OMNI_ADDON: found.addon, HUGR_OMNI_SUPERVISOR: found.supervisor }
}
