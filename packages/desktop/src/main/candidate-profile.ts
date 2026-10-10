import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { userInfo } from "node:os"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type { App } from "electron"

export type CandidateProfile = {
  root: string
  desktop: string
  session: string
  home: string
  data: string
  config: string
  cache: string
  state: string
  tmp: string
  db: string
  managed: string
  appId: string
  name: string
}

const APP_ID = "ai.hugr.orchestra.lean.candidate"
const MARKER = ".orchestra-lean-candidate.json"
const ENV_KEYS = new Set([
  "PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "LC_CTYPE",
  "TERM", "COLORTERM", "DISPLAY", "WAYLAND_DISPLAY", "SDKROOT", "DEVELOPER_DIR", "JAVA_HOME", "GOPATH", "GOROOT",
  "CARGO_HOME", "RUSTUP_HOME",
])

// Only the compile-time caller can enable this. Host environment is never an activation switch.
export function initializeCandidateProfile(
  app: Pick<App, "getPath" | "setPath" | "setName" | "setAppUserModelId">,
  enabled: boolean,
): CandidateProfile | undefined {
  if (!enabled) return
  const appData = app.getPath("appData")
  const requested = process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT ?? join(appData, APP_ID)
  if (!isAbsolute(requested)) throw new Error("candidate-profile: root must be absolute")
  const root = canonicalPath(requested)
  // OS account home remains stable when a relaunch inherits the candidate HOME.
  const home = canonicalPath(userInfo().homedir)
  const appDataRoots = [
    appData, join(home, "Library", "Application Support"), join(home, "AppData", "Roaming"), join(home, ".config"),
  ]
  const protectedRoots = [
    ...[
      "ai.hugr.orchestra", "ai.hugr.orchestra.dev", "ai.hugr.orchestra.beta",
      "HuGR Orchestra", "HuGR Orchestra Dev", "HuGR Orchestra Beta",
    ].flatMap((name) => appDataRoots.map((dir) => canonicalPath(join(dir, name)))),
    ...[".local/share/orchestra", ".config/orchestra", ".cache/orchestra", ".local/state/orchestra"].map((path) =>
      canonicalPath(join(home, path)),
    ),
  ]
  const inheritedRoots = [
    process.env.XDG_DATA_HOME, process.env.XDG_CONFIG_HOME, process.env.XDG_STATE_HOME, process.env.XDG_CACHE_HOME,
  ].filter((value): value is string => Boolean(value)).map(canonicalPath)
  if (
    contains(root, home) || protectedRoots.some((path) => contains(path, root) || contains(root, path)) ||
    inheritedRoots.some((path) => contains(path, root))
  ) {
    throw new Error("candidate-profile: protected root")
  }
  const profile: CandidateProfile = {
    root,
    desktop: join(root, "desktop"),
    session: join(root, "session"),
    home: join(root, "home"),
    data: join(root, "data"),
    config: join(root, "config"),
    cache: join(root, "cache"),
    state: join(root, "state"),
    tmp: join(root, "tmp"),
    db: join(root, "db", "orchestra.sqlite"),
    managed: join(root, "managed"),
    appId: APP_ID,
    name: "HuGR Lean Candidate",
  }
  const marker = join(root, MARKER)
  const ownership = JSON.stringify({ appId: APP_ID, version: 1, root })
  if (existsSync(root)) {
    if (!lstatSync(root).isDirectory()) throw new Error("candidate-profile: root is not a directory")
    if (existsSync(marker)) {
      if (!lstatSync(marker).isFile() || readFileSync(marker, "utf8") !== ownership) {
        throw new Error("candidate-profile: invalid ownership marker")
      }
    } else if (readdirSync(root).length) throw new Error("candidate-profile: nonempty unowned root")
  }
  const directories = [
    profile.desktop, profile.session, profile.home, profile.data, profile.config, profile.cache, profile.state,
    profile.tmp, dirname(profile.db), profile.managed, join(profile.home, "Documents"), join(profile.home, "Downloads"),
  ]
  // Validate the entire partial profile before filling missing directories; never follow a planted symlink.
  for (const path of [...directories, profile.db, marker]) {
    if (canonicalPath(path) !== path || lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error("candidate-profile: path escapes owned root")
    }
    if (directories.includes(path) && existsSync(path) && !lstatSync(path).isDirectory()) {
      throw new Error("candidate-profile: path is not a directory")
    }
  }
  if (existsSync(profile.db) && !lstatSync(profile.db).isFile()) throw new Error("candidate-profile: db is not a file")
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (!existsSync(marker)) writeFileSync(marker, ownership, { flag: "wx", mode: 0o600 })
  directories.forEach((path) => mkdirSync(path, { recursive: true, mode: 0o700 }))
  app.setName(profile.name) // Electron derives the Safe Storage namespace from this name.
  app.setAppUserModelId(profile.appId)
  app.setPath("userData", profile.desktop)
  app.setPath("sessionData", profile.session)
  app.setPath("home", profile.home)
  app.setPath("temp", profile.tmp)
  app.setPath("documents", join(profile.home, "Documents"))
  app.setPath("downloads", join(profile.home, "Downloads"))
  applyCandidateEnvironment(profile)
  return profile
}

export function candidateEnvironment(
  profile: CandidateProfile,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(source).flatMap(([key, value]) => value !== undefined && ENV_KEYS.has(key) ? [[key, value]] : []),
    ),
    HOME: profile.home,
    USERPROFILE: profile.home,
    ORCHESTRA_TEST_HOME: profile.home,
    XDG_DATA_HOME: profile.data,
    XDG_CONFIG_HOME: profile.config,
    XDG_CACHE_HOME: profile.cache,
    XDG_STATE_HOME: profile.state,
    TMPDIR: profile.tmp,
    TMP: profile.tmp,
    TEMP: profile.tmp,
    ORCHESTRA_DB: profile.db,
    ORCHESTRA_TEST_MANAGED_CONFIG_DIR: profile.managed,
    ORCHESTRA_LEAN_CANDIDATE: "1",
    ORCHESTRA_CANDIDATE_PROFILE_ROOT: profile.root,
    ORCHESTRA_INHERIT_CREDENTIALS: "0",
    ORCHESTRA_SIDECAR_V2: "0",
    ORCHESTRA_DISABLE_EMBEDDED_WEB_UI: "true",
    ORCHESTRA_CLIENT: "desktop",
    ORCHESTRA_EXPERIMENTAL_ICON_DISCOVERY: "true",
    ORCHESTRA_EXPERIMENTAL_FILEWATCHER: "true",
  }
}

export function applyCandidateEnvironment(profile: CandidateProfile) {
  const env = candidateEnvironment(profile)
  Object.keys(process.env).forEach((key) => {
    if (!(key in env)) delete process.env[key]
  })
  Object.assign(process.env, env)
}

function canonicalPath(path: string): string {
  const absolute = resolve(path)
  if (existsSync(absolute)) return realpathSync(absolute)
  const parent = dirname(absolute)
  if (parent === absolute) return absolute
  return join(canonicalPath(parent), relative(parent, absolute))
}

function contains(parent: string, child: string) {
  const fold = process.platform === "darwin" || process.platform === "win32"
  const path = relative(fold ? parent.toLowerCase() : parent, fold ? child.toLowerCase() : child)
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
}
