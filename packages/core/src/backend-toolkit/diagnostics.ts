export * as BackendToolkitDiagnostics from "./diagnostics"

import { stripVTControlCharacters } from "util"
import { OutputInspector } from "../output-inspector"

/** Inspect original and terminal-normalized text before retaining any bounded details. */
export function details(text: string, env: NodeJS.ProcessEnv = process.env) {
  const normalized = stripVTControlCharacters(text)
  if (OutputInspector.reason(text) || OutputInspector.reason(normalized)) return
  // These repository settings are boolean policy switches, not credential material (tests set the value to "0").
  if (Object.entries(env).some(([key, value]) => value && !/^(?:ORCHESTRA|OPENCODE)_INHERIT_CREDENTIALS$/i.test(key) &&
    /(?:^|_)(?:SECRET|TOKEN|PASSWORD|CREDENTIALS?|AUTH|(?:API|ACCESS|PRIVATE|CLIENT)_KEY)$/i.test(key) &&
    (text.includes(value) || normalized.includes(stripVTControlCharacters(value))))) return
  return normalized.slice(-4096).trim()
}

/** Public pinned installers get build/search/temp paths, not ambient credentials or owner package-manager config. */
export function environment(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const allowed = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE",
    "SDKROOT", "DEVELOPER_DIR", "MACOSX_DEPLOYMENT_TARGET", "CC", "CXX", "AR", "INCLUDE", "LIB", "LIBPATH"])
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== undefined && allowed.has(key.toUpperCase()))),
    HOME: `${cwd}/.installer-home`,
    USERPROFILE: `${cwd}/.installer-home`,
    npm_config_userconfig: `${cwd}/.installer-home/npmrc`,
    npm_config_globalconfig: `${cwd}/.installer-home/global-npmrc`,
    PIP_CONFIG_FILE: process.platform === "win32" ? "NUL" : "/dev/null",
  }
}
