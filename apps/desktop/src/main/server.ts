import { dirname, join, resolve, sep } from "node:path"
import { access } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { app } from "electron"
import { getLogger } from "./logging"
import { ripgrepEnv } from "./ripgrep-env"
import { getUserShell, loadShellEnv } from "./shell-env"
import { getStore } from "./store"
import { DEFAULT_SERVER_URL_KEY } from "./store-keys"
import { applyCandidateEnvironment, candidateEnvironment, type CandidateProfile } from "./candidate-profile"

export function getDefaultServerUrl(): string | null {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  getStore().delete(DEFAULT_SERVER_URL_KEY)
}

export function preferAppEnv(userDataPath: string, candidateProfile?: CandidateProfile) {
  if (candidateProfile) {
    applyCandidateEnvironment(candidateProfile)
    return null
  }
  const shell = process.platform === "win32" ? null : getUserShell()
  const shellEnv = shell ? loadShellEnv(shell, getLogger()) : null
  Object.assign(process.env, {
    ...shellEnv,
    ORCHESTRA_EXPERIMENTAL_ICON_DISCOVERY: "true",
    ORCHESTRA_EXPERIMENTAL_FILEWATCHER: "true",
    ORCHESTRA_CLIENT: "desktop",
    XDG_STATE_HOME: process.env.XDG_STATE_HOME ?? userDataPath,
  })
  return shellEnv
}

/** The per-launch environment of the desktop-owned `orchestra serve`. */
export async function sidecarLaunchEnv(userDataPath: string, candidateProfile?: CandidateProfile) {
  const outDir = dirname(fileURLToPath(import.meta.url))
  const claudeExecutable = join(
    app.isPackaged ? process.resourcesPath : resolve(outDir, "../../resources"),
    "claude-code",
    process.platform === "win32" ? "claude.exe" : "claude",
  )
  await access(claudeExecutable)
  // A build wipes its own output (ORC-006): an app launched from there loses these resources while it runs.
  if (app.isPackaged && process.resourcesPath.split(sep).join("/").includes("/apps/desktop/dist"))
    getLogger().warn("running from a build output that the next build deletes; install the app elsewhere", {
      resources: process.resourcesPath,
    })
  return {
    ...createSidecarEnv(candidateProfile),
    // The SDK gets an explicit real-file path; its bundled module cannot resolve optional native packages.
    ORCHESTRA_CLAUDE_CODE_EXECUTABLE: claudeExecutable,
    ...ripgrepEnv(app.isPackaged, process.resourcesPath),
    ORCHESTRA_CLAUDE_CODE_RESOURCES: dirname(claudeExecutable),
    ORCHESTRA_LINUX_ROOT: join(userDataPath, "app-dock-linux"),
    // Maestro's playbooks ship outside the app archive, where every tool can read them. Dev runs read the
    // repository copy, since the bundled server cannot locate it from its own path. They still live in
    // apps/orchestra/playbooks, where modules/maestro reads its source copy, until they move with B1-C.
    ORCHESTRA_PLAYBOOKS_DIR: app.isPackaged
      ? join(process.resourcesPath, "playbooks")
      : resolve(outDir, "../../../orchestra/playbooks"),
  }
}

export function createSidecarEnv(candidateProfile?: CandidateProfile): Record<string, string> {
  if (candidateProfile) return candidateEnvironment(candidateProfile)
  const env = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
  )
  delete env.ORCHESTRA_LEAN_CANDIDATE // Only a validated compile-time candidate may enable backend isolation mode.
  delete env.DEBUG
  if (process.platform === "linux") delete env.LD_PRELOAD
  return env
}
