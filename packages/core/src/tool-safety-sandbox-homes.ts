export * as ToolSafetySandboxHomes from "./tool-safety-sandbox-homes"

import os from "os"
import path from "path"
import { Effect } from "effect"
import { FSUtil } from "./fs-util"
import { Global } from "./global"

// What a confined-read command (a native seat's shell, ToolSafety.Profile.sandbox.readRoots) may read outside its roots:
// the system toolchain, and the exact entries under the home directory or the homes its environment names. Applied by
// ToolSafetySandbox.wrap.

// Entries an /etc may hold that programs read to start, resolve users, hosts and time, verify TLS or load libraries.
// /etc/hostname, machine-id, shadow and ssh are not among them.
const ETC = [
  "alternatives", "ca-certificates", "ca-certificates.conf", "crypto-policies", "gai.conf", "gitconfig", "group", "host.conf",
  "hosts", "ld.so.cache", "ld.so.conf", "ld.so.conf.d", "locale.alias", "locale.conf", "localtime", "lsb-release",
  "mime.types", "nix", "nsswitch.conf", "os-release", "passwd", "paths", "paths.d", "pki", "protocols", "resolv.conf",
  "services", "shells", "ssl", "static", "terminfo", "timezone",
]

/**
 * What a confined-read command may read besides its roots: the system's programs, libraries and essential /etc entries,
 * this process's runtime install, every PATH directory, and the home grants (homeGrants). A PATH directory named `bin`
 * also exposes its install prefix (node's lib beside its bin), unless that prefix is the home directory or one of its
 * direct children, such as ~/.local or ~/.cargo, which hold user data and credentials. Nothing that contains the home
 * directory is ever listed.
 */
export function toolchain(env: NodeJS.ProcessEnv = process.env) {
  return [...programs(env), ...homeGrants(env).map((grant) => grant.entry)]
}

/** The account's home and the one Orchestra uses (a test home differs); neither is ever exposed. */
const homes = () => [...new Set([Global.Path.home, os.homedir()])]

/**
 * A home an environment variable names, only when it is absolute and neither a home nor above one (CARGO_HOME=$HOME
 * grants nothing); unset, the default under each home.
 */
const absolute = (value: string | undefined) => value && path.isAbsolute(value) &&
  !homes().some((home) => FSUtil.contains(path.resolve(value), home)) ? [path.resolve(value)] : []
const named = (value: string | undefined, fallback: string) =>
  value === undefined ? homes().map((home) => path.join(home, fallback)) : absolute(value)
/** git's XDG directories: ~/.config/git and $XDG_CONFIG_HOME/git. */
const gitHomes = (env: NodeJS.ProcessEnv) =>
  [...homes().map((home) => path.join(home, ".config", "git")), ...absolute(env.XDG_CONFIG_HOME).map((xdg) => path.join(xdg, "git"))]

/**
 * Credential stores a confined-read command never reads, even where a readable root holds them (a CARGO_HOME under /usr
 * whose bin is on PATH): cargo's credentials and config, its bare git databases, and git's XDG credential store.
 */
export const secrets = (env: NodeJS.ProcessEnv) => [
  ...named(env.CARGO_HOME, ".cargo").flatMap((cargo) =>
    ["credentials", "credentials.toml", "config", "config.toml", path.join("git", "db")].map((name) => path.join(cargo, name))),
  ...gitHomes(env).map((root) => path.join(root, "credentials")),
]

/** The system roots: programs, libraries and the essential /etc entries. */
const system = () => process.platform === "darwin"
  ? ["/usr", "/bin", "/sbin", "/System", "/Library/Apple", "/Library/Developer", "/Library/Frameworks", "/opt", "/nix", "/dev",
      "/private/var/db/dyld", "/private/var/db/timezone", "/private/var/select", "/private/var/db/xcode_select_link",
      // xcrun, which cc and the linker run, refuses (exit 69) unless it can read that the Xcode license was accepted.
      "/Library/Preferences/com.apple.dt.Xcode.plist",
      ...ETC.map((entry) => path.join("/private/etc", entry))]
  : ["/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/libx32", "/opt", "/nix", ...ETC.map((entry) => path.join("/etc", entry))]

export function programs(env: NodeJS.ProcessEnv) {
  const bins = [path.dirname(process.execPath), ...(env.PATH ?? env.Path ?? "").split(path.delimiter).filter((entry) => path.isAbsolute(entry))]
  const prefixes = bins.filter((entry) => path.basename(entry) === "bin").map((entry) => path.dirname(entry))
    .filter((prefix) => !homes().includes(path.dirname(prefix)))
  return [...system(), ...bins, ...prefixes].filter((entry) => !homes().some((home) => FSUtil.contains(entry, home)))
}

/**
 * The single files and directories a confined-read command may read under the home directory or the homes its
 * environment names, each with the directory it must stay inside (`within`) once links are resolved:
 * - git's global config, excludes and attributes (git refuses to start when its config exists but cannot be read); never
 *   the XDG credential store beside them (git/credentials);
 * - exactly what a rustup-proxied cargo needs: the proxies in CARGO_HOME/bin (also when they are not on PATH), the
 *   default toolchain and overrides in RUSTUP_HOME/settings.toml, the toolchains it runs, and what an offline build of
 *   registry dependencies reads: the index (to resolve the lock file), the downloaded .crate archives (cargo counts a
 *   crate as present only when its archive is) and their unpacked sources. Never cargo's credentials or config (registry
 *   tokens, proxy credentials), nor its git databases and checkouts (cargo opens the database to resolve even a locked
 *   git dependency offline, so git dependencies do not build confined; vendored and path dependencies do), nor rustup's
 *   downloads, tmp and update hashes.
 * A home named by the environment must be absolute. No grant is a home, contains one, or (but ~/.gitconfig) sits directly
 * in one, so CARGO_HOME=$HOME cannot expose ~/bin or ~/registry. `names` lists the resolved spellings a dotfile manager's
 * link may take when it leaves `within` (a dotfiles checkout keeping git's own names).
 */
export function homeGrants(env: NodeJS.ProcessEnv = process.env) {
  const grants = [
    ...homes().map((home) => ({ entry: path.join(home, ".gitconfig"), within: undefined, names: [".gitconfig", "gitconfig"] })),
    ...gitHomes(env).flatMap((root) => ["config", "ignore", "attributes"].map((name) =>
      ({ entry: path.join(root, name), within: root, names: [path.join("git", name)] }))),
    ...named(env.RUSTUP_HOME, ".rustup").flatMap((rustup) => ["settings.toml", "toolchains"].map((name) =>
      ({ entry: path.join(rustup, name), within: rustup, names: [] }))),
    ...named(env.CARGO_HOME, ".cargo").flatMap((cargo) => ["bin", ...["index", "cache", "src"].map((name) => path.join("registry", name))]
      .map((name) => ({ entry: path.join(cargo, name), within: cargo, names: [] }))),
  ]
  return grants.filter((grant) => !homes().some((home) => FSUtil.contains(grant.entry, home) ||
    (path.dirname(grant.entry) === home && path.basename(grant.entry) !== ".gitconfig")))
}

/**
 * The home grants that exist, each with its physical path. A grant is kept when it is not itself a link, or when its
 * physical path stays inside its physical `within` directory, inside a system root, or ends in one of its `names`; and
 * never when its physical path is a home, contains one, or (but ~/.gitconfig) sits directly in one. So a link planted at
 * a grant (bin, settings.toml, a git config) cannot expose ~/.netrc or another tool's credentials, while a dotfiles
 * link that keeps git's names (~/.config/git/config -> ~/dotfiles/git/config) or points into a system root (Nix Home
 * Manager's /nix/store) still works. A link above a grant (a whole home behind a link) is not followed in the jail.
 */
export const contained = (fs: FSUtil.Interface, grants: ReturnType<typeof homeGrants>) => Effect.gen(function* () {
  const physical = (entry: string) => fs.realPath(entry).pipe(Effect.catch(() => Effect.succeed(undefined)))
  const places = [...new Set([...homes(), ...(yield* Effect.forEach(homes(), physical)).filter((home) => home !== undefined)])]
  const found = yield* Effect.forEach(grants, (grant) => Effect.gen(function* () {
    const real = yield* physical(grant.entry)
    if (real === undefined) return []
    const parent = yield* physical(path.dirname(grant.entry))
    const within = grant.within === undefined ? undefined : yield* physical(grant.within)
    if (places.some((home) => FSUtil.contains(real, home) || (grant.within !== undefined && path.dirname(real) === home))) return []
    const kept = real === (parent && path.join(parent, path.basename(grant.entry))) ||
      (within !== undefined && FSUtil.contains(within, real)) || system().some((root) => FSUtil.contains(root, real)) ||
      grant.names.some((name) => real.endsWith(path.sep + name))
    return kept ? [path.resolve(grant.entry), real] : []
  }))
  return [...new Set(found.flat())]
})
