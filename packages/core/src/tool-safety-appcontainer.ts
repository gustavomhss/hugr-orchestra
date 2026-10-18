export * as ToolSafetyAppContainer from "./tool-safety-appcontainer"

import os from "os"
import path from "path"
import which from "which"
import { createHash } from "crypto"
import { execFile } from "child_process"
import { Context, Effect, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { BackendToolkit } from "./backend-toolkit"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { Omni } from "./omni"
import { Shell } from "./shell"
import { ToolSafety } from "./tool-safety"

// The Windows shell jail: the omni supervisor's AppContainer launch mode (`--appcontainer`). The command runs as an
// AppContainer process with no capabilities (no network), inside a kill-on-close Job, and opens only what the
// launcher grants its profile's SID: read on the native placement and the toolkit cache, write on the write roots.
// The host toolchain (PATH folders outside Windows and Program Files, which every AppContainer may already read) is
// granted read once per host to a capability every Orchestra container holds, so bun, node, python and go start in any
// profile; that first walk runs in the background (prepare). Everything else stays closed, but nothing inside a grant can be closed again (a deny ACE for the SID did not hold), so
// a denied or protected path inside a granted tree makes the policy inexpressible. Exact loopback endpoints reach their
// fixed upstream through the launcher's own AF_UNIX broker. Profiles are keyed by their grant set, so a reused profile
// finds its ACEs already in place and never re-walks a tree; per-command scratch and broker folders are fresh and small.

/** The omni supervisor that launches confined commands, or undefined when this host has none. */
export const Launcher = Context.Reference<string | undefined>("@orchestra/ToolSafetyAppContainer/Launcher", {
  defaultValue: () => {
    try {
      return Omni.locate().supervisor
    } catch {
      return undefined
    }
  },
})

/** Only pwsh and cmd run as the AppContainer's shell: Git Bash does not start there, Windows PowerShell 5.1 is denied its
 * own working directory (measured on windows-latest). Inside, no command may open the null device (`NUL`, which git opens
 * as it starts), so git and `> nul` redirections fail there; they never run outside it. */
export const shell = (file: string) => ["pwsh", "cmd"].includes(Shell.name(file))

/** Whether this command is one the AppContainer launcher can run: pwsh with its arguments, or a cmd.exe shell. */
export function confinable(command: ChildProcess.StandardCommand) {
  const file = program(command).file
  return command.options.shell ? Shell.name(file) === "cmd" : shell(file)
}

export const command = Effect.fn("ToolSafetyAppContainer.command")(function* (input: {
  readonly command: ChildProcess.StandardCommand
  readonly supervisor: string
  readonly cwd: string
  readonly env: Record<string, string | undefined>
  /** Native placement: readable. */
  readonly directory: string
  /** Canonical declared write roots; each must exist. */
  readonly roots: readonly string[]
  readonly scratch?: string
  readonly deny: readonly string[]
  /** Project-config paths kept read-only for the command; a missing one gets a locked placeholder directory. */
  readonly guards: readonly string[]
  /** Where the launcher journals guard protection so an aborted run can be recovered. */
  readonly journal: string
  readonly ports: readonly number[]
  /** Allowed domains: an AppContainer without capabilities has no network to allow them on. */
  readonly domains: number
}): Effect.fn.Return<ChildProcess.Command, ToolSafety.Denied, FSUtil.Service | Scope.Scope> {
  const fs = yield* FSUtil.Service
  if (!confinable(input.command)) return yield* new ToolSafety.Denied({ reason: "sandbox-appcontainer-shell-unsupported" })
  if (input.domains) return yield* new ToolSafety.Denied({ reason: "sandbox-appcontainer-domain-policy-unenforceable" })
  const run = program(input.command)
  const app = which.sync(run.file, { nothrow: true })
  if (!app) return yield* new ToolSafety.Denied({ reason: "sandbox-appcontainer-program-not-found" })
  const exists = (target: string) => fs.exists(target).pipe(Effect.orElseSucceed(() => false))
  // A missing root cannot carry an ACE; granting its parent instead would widen the write jail.
  for (const root of input.roots)
    if (!(yield* exists(root))) return yield* new ToolSafety.Denied({ reason: "sandbox-appcontainer-write-root-missing" })
  const toolkit = yield* BackendToolkit.Root
  const writes = [...new Set(input.roots)]
  const reads = [...new Set([input.directory, ...((yield* exists(toolkit)) ? [toolkit] : [])])]
    .filter((entry) => !writes.some((root) => FSUtil.contains(root, entry)))
  const granted = [...reads, ...writes, ...(input.scratch ? [input.scratch] : [])]
  if (!granted.some((root) => FSUtil.contains(root, input.cwd)))
    return yield* new ToolSafety.Denied({ reason: "sandbox-appcontainer-cwd-outside-grants" })
  // A fully denied path cannot sit inside a grant: a deny ACE below an inherited allow does not hold on Windows, and
  // unlike a guarded config path it must stay unreadable, so it can only be closed by being outside every grant.
  const overlaps = (entries: readonly string[], roots: readonly string[]) =>
    entries.some((entry) => roots.some((root) => FSUtil.contains(root, entry) || FSUtil.contains(entry, root)))
  if (overlaps(input.deny, granted))
    return yield* new ToolSafety.Denied({ reason: "sandbox-appcontainer-deny-inside-grant-unenforceable" })
  // A toolchain folder holding or inside a denied path is left unreadable rather than refusing the command. One inside
  // another listed folder is already covered by its walk.
  const found = (yield* Effect.forEach(toolchainFolders(input.env), (entry) =>
    fs.realPath(entry).pipe(Effect.map((real) => [real]), Effect.orElseSucceed(() => []))))
    .flat().filter((entry) => !overlaps(input.deny, [entry]))
  prepare(input.supervisor, [...new Set(found)].filter((entry, _, all) => !all.some((other) => other !== entry && FSUtil.contains(other, entry))))
  // A guard that equals or contains a write root cannot be both writable and read-only; the launcher would silently
  // keep it writable (Darwin refuses it outright), so refuse here too.
  if (input.guards.some((entry) => writes.some((root) => FSUtil.contains(entry, root))))
    return yield* new ToolSafety.Denied({ reason: "sandbox-appcontainer-guard-over-write-root" })
  // Config paths only need the read-only guard where the container could otherwise write them: strictly inside a write
  // root. Elsewhere they are already read-only or closed.
  // A name under a file write root gets no guard: the launcher cannot create its placeholder directory under a file,
  // and the container cannot swap the file for a directory, since its parent grants no FILE_ADD_SUBDIRECTORY.
  const guards = yield* Effect.filter([...new Set(input.guards)].filter((entry) =>
    writes.some((root) => FSUtil.contains(root, entry) && root !== entry)), (entry) =>
    fs.stat(path.dirname(entry)).pipe(Effect.map((info) => info.type !== "File"), Effect.orElseSucceed(() => true)))
  const name = `orchestra-${createHash("sha256").update(JSON.stringify([reads, writes, input.ports])).digest("hex").slice(0, 32)}`
  const broker = input.ports.length
    ? yield* fs.makeTempDirectoryScoped({ directory: os.tmpdir(), prefix: "otcp-" }).pipe(
        Effect.flatMap(fs.realPath),
        Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-directory-acquisition" })),
      )
    : undefined
  const routes = broker ? input.ports.map((port, index) => ({ port, socket: path.join(broker, `${index}.sock`) })) : []
  // The dialer's bound, below Windows' 108-byte sun_path.
  if (routes.some((route) => Buffer.byteLength(route.socket, "utf8") >= 104))
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-socket-path-overflow" })
  return ChildProcess.make(input.supervisor, [
    "--appcontainer", name,
    ...reads.flatMap((entry) => ["--read", entry]),
    ...[...writes, ...(input.scratch ? [input.scratch] : [])].flatMap((entry) => ["--write", entry]),
    ...guards.flatMap((entry) => ["--guard", entry]),
    "--journal", input.journal,
    ...routes.flatMap((route) => ["--route", `${route.port}=${route.socket}`]),
    "--app", app,
    "--line", [quote(app), run.tail].filter(Boolean).join(" "),
  ], {
    ...input.command.options, cwd: input.cwd, shell: false, extendEnv: false,
    env: { ...input.env, ...localAppData(input.env), ...routes.length ? { ORCHESTRA_TCP_PROXY_ROUTES: routes.map((route) =>
      `${route.port}:${Buffer.from(route.socket, "utf8").toString("hex")}`).join(";") } : {} },
  })
})

const preparing = new Map<string, Promise<void>>()

/**
 * Grants each toolchain folder not yet started in this process to the toolchain capability, in one background launcher
 * run. A first grant walks the folder's tree (minutes on a runner with ~200k toolchain files), which must never sit
 * inside a command's deadline: a command that starts first runs without the folders not granted yet.
 */
function prepare(supervisor: string, folders: readonly string[]) {
  const pending = folders.filter((folder) => !preparing.has(folder))
  if (!pending.length) return
  const done = new Promise<void>((resolve) => {
    execFile(supervisor, ["--appcontainer", "orchestra-toolchain", ...pending.flatMap((folder) => ["--toolchain", folder])],
      { windowsHide: true }, () => resolve())
  })
  for (const folder of pending) preparing.set(folder, done)
}

/** Waits for this process's toolchain grants in flight; it never fails. */
export const settled = Effect.promise(() => Promise.all(preparing.values()).then(() => undefined))

/**
 * The toolchain the container may read, by the rule of ToolSafetySandbox.toolchain: every PATH folder, and the install
 * prefix of one named `bin` (Go's GOROOT) unless that prefix is a home's direct child (~/.bun, ~/.cargo, which hold user
 * data). Folders under Windows and Program Files are left out: every AppContainer may already read them and their ACLs
 * belong to the system. Nothing that contains a home is ever listed.
 */
function toolchainFolders(env: Record<string, string | undefined>) {
  const value = (name: string) => Object.entries(env).find(([key]) => key.toUpperCase() === name.toUpperCase())?.[1]
  const homes = [...new Set([Global.Path.home, os.homedir()])]
  const system = ["SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].flatMap((name) => value(name) ?? [])
  const bins = (value("PATH") ?? "").split(path.delimiter).filter((entry) => path.isAbsolute(entry))
  const prefixes = bins.filter((entry) => path.basename(entry).toLowerCase() === "bin").map((entry) => path.dirname(entry))
    .filter((prefix) => !homes.some((home) => path.relative(home, path.dirname(prefix)) === ""))
  return [...bins, ...prefixes].map((entry) => path.resolve(entry))
    .filter((entry) => !system.some((root) => FSUtil.contains(root, entry)) && !homes.some((home) => FSUtil.contains(entry, home)))
}

/**
 * Windows builds an AppContainer process's environment from LOCALAPPDATA, which it points at the profile's own folder;
 * without it CreateProcess fails with error 203. A caller may pass a narrowed environment, so supply the user's.
 */
function localAppData(env: Record<string, string | undefined>) {
  if (Object.entries(env).some(([key, value]) => key.toUpperCase() === "LOCALAPPDATA" && value)) return {}
  return { LOCALAPPDATA: path.join(os.homedir(), "AppData", "Local") }
}

/** The program and the rest of its command line; a cmd.exe shell keeps Node's verbatim `/d /s /c "<joined>"` tail. */
function program(command: ChildProcess.StandardCommand) {
  const shell = command.options.shell
  if (!shell) {
    const at = Shell.name(command.command) === "pwsh" ? command.args.findIndex((arg) => /^-(?:c|command)$/i.test(arg)) : -1
    const args = at >= 0 && at < command.args.length - 1 ? command.args.with(at + 1, LOCATE + command.args[at + 1]) : command.args
    return { file: command.command, tail: args.map(quote).join(" ") }
  }
  return { file: shell === true ? (process.env.ComSpec ?? "cmd.exe") : shell, tail: `/d /s /c "${[command.command, ...command.args].join(" ")}"` }
}

// pwsh resolves its start location by listing every ancestor directory, which an AppContainer may not list (C:\Users),
// and then starts at the drive root, where relative paths and native children land. A drive rooted at the process
// directory gives it the real one without listing ancestors (measured on windows-latest).
const LOCATE = "New-PSDrive -Name orchestra -PSProvider FileSystem -Root ([Environment]::CurrentDirectory) | Out-Null; Set-Location orchestra:\\; "

/** One argument as the MSVC runtime (and Rust's std) parses it back. */
export function quote(arg: string) {
  if (arg !== "" && !/[ \t\n\v"]/.test(arg)) return arg
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`
}
