export * as ToolSafetySandbox from "./tool-safety-sandbox"

import os from "os"
import path from "path"
import which from "which"
import { closeSync, lstatSync, openSync, unlinkSync, type BigIntStats } from "node:fs"
import { lstat, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises"
import { Context, Effect, Result, Schedule, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { ToolSafety } from "./tool-safety"
import { ToolSafetyAppContainer } from "./tool-safety-appcontainer"
import { ToolSafetyGitHost } from "./tool-safety-git-host"
import { ToolSafetySandboxHomes } from "./tool-safety-sandbox-homes"
import { ToolSafetySandboxRuntime } from "./tool-safety-sandbox-runtime"
import { SandboxParents } from "./sandbox-parents"
import { SandboxProjectConfig } from "./sandbox-project-config"
import { Shell } from "./shell"
import { TcpProxy } from "./tcp-proxy"

export { toolchain, homeGrants } from "./tool-safety-sandbox-homes"

/** Tool-child environment only. Never applied to provider adapters or the server process. */
export function environment(input: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(input).filter(([name, value]) =>
    value !== undefined && !/(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIAL)/i.test(name) &&
    !["SSH_AUTH_SOCK", "SSH_ASKPASS", "GIT_ASKPASS", "ORCHESTRA_AUTH_CONTENT"].includes(name) &&
    !/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bsk_live_[A-Za-z0-9]{20,}\b/.test(value)))
}

/** The macOS seatbelt launcher. A host without it (or with this pointed elsewhere) has no seatbelt sandbox. */
export const Seatbelt = Context.Reference<string>("@orchestra/ToolSafetySandbox/Seatbelt", {
  defaultValue: () => "/usr/bin/sandbox-exec",
})

/** Discovery performs filesystem checks only; confinement starts when the caller spawns the command. */
export const available = (executable?: string) => Effect.gen(function* () {
  const seatbelt = yield* Seatbelt
  return yield* Effect.tryPromise({
    try: async () => {
      const binary = await which(executable ?? "srt", { nothrow: true })
      if (binary || executable || process.platform !== "darwin") return binary
      return which(seatbelt, { nothrow: true })
    },
    catch: () => new ToolSafety.Denied({ reason: "sandbox-binary-acquisition" }),
  })
})

export const backend = Effect.fn("ToolSafetySandbox.backend")(function* () {
  const binary = yield* available()
  return binary ? { kind: binary === (yield* Seatbelt) ? "seatbelt" as const : "srt" as const, binary } : undefined
})

/** The write-jail fact this host would give a sandbox-bound command now, without starting an acquisition. */
export const status = Effect.fn("ToolSafetySandbox.status")(function* () {
  const picked = yield* pick(false).pipe(Effect.catch((error) => Effect.succeed({ kind: "none" as const, reason: error.reason })))
  return (picked.kind === "none"
    ? { shellWrites: "unenforced", shellSandbox: { kind: "none", reason: picked.reason } }
    : { shellWrites: "enforced", shellSandbox: { kind: picked.kind } }) satisfies ToolSafety.ShellFact
})

/** Caller keeps this Scope open through child exit; policy file is removed on success/failure/cancellation. */
export const wrap = Effect.fn("ToolSafetySandbox.wrap")(function* (
  command: ChildProcess.Command,
  /** Native host only, after the shell's permission approval; prehooks must leave this absent. */
  options?: { readonly prepareParents?: boolean },
): Effect.fn.Return<ChildProcess.Command, ToolSafety.Denied, FSUtil.Service | Scope.Scope> {
  const profile = yield* ToolSafety.RuntimeProfile
  if (command._tag !== "StandardCommand") {
    if (profile?.requireSandbox || profile?.sandbox?.enabled || profile?.sandbox?.allowedUnixSockets?.length || profile?.sandbox?.allowedLoopbackEndpoints?.length)
      return yield* new ToolSafety.Denied({ reason: "sandbox-pipeline-unbound" })
    return ChildProcess.pipeTo(yield* wrap(command.left), yield* wrap(command.right), command.options)
  }
  const env = environment(command.options.extendEnv === false
    ? command.options.env ?? {}
    : { ...process.env, ...command.options.env })
  const ordinary = ChildProcess.make(command.command, command.args, { ...command.options, env, extendEnv: false })
  const requestedSockets = profile?.sandbox?.allowedUnixSockets
  if (requestedSockets !== undefined && !Array.isArray(requestedSockets))
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-invalid-grants" })
  const grants = yield* Effect.forEach(requestedSockets ?? [], (entry) => Effect.gen(function* () {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry) ||
      typeof entry.directory !== "string" || typeof entry.path !== "string")
      return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-invalid-entry" })
    if (!path.isAbsolute(entry.directory) || !path.isAbsolute(entry.path) || /[*?\[\]\0]/.test(entry.directory + entry.path))
      return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-invalid-path" })
    return { directory: entry.directory, path: entry.path }
  }))
  const requestedEndpoints = profile?.sandbox?.allowedLoopbackEndpoints
  if (requestedEndpoints !== undefined && !Array.isArray(requestedEndpoints))
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-grants" })
  if (requestedEndpoints && requestedEndpoints.length > 32)
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-resource-limit" })
  const endpointGrants = Array.from(requestedEndpoints ?? [], (entry) => ({ ...entry }))
  yield* Effect.forEach(endpointGrants, (entry) => Effect.gen(function* () {
    if (typeof entry.directory !== "string" || !path.isAbsolute(entry.directory) || /[*?\[\]\0]/.test(entry.directory))
      return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-directory" })
    if (entry.host !== "127.0.0.1") return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-host" })
    if (!Number.isSafeInteger(entry.port) || entry.port < 1 || entry.port > 65535)
      return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-port" })
  }), { discard: true })
  const reads = profile?.sandbox?.readRoots
  if (!profile?.requireSandbox && !profile?.sandbox?.enabled && grants.length === 0 && endpointGrants.length === 0 && !reads) return ordinary
  // Exact endpoint/socket capabilities never permit unconfined fallback, including during runtime acquisition.
  if (endpointGrants.length && !["darwin", "linux", "win32"].includes(process.platform))
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-exact-policy-unsupported" })
  if (grants.length && process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-platform-unsupported" })
  if (endpointGrants.length && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-domain-policy-unenforceable" })
  if (grants.length && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-domain-policy-unenforceable" })
  const discovered = grants.length || endpointGrants.length ? undefined : yield* pick(true, false, command).pipe(
    // A first Linux runtime acquisition runs in the background. Confined reads never run unconfined, so they wait for it.
    Effect.repeat({
      while: (picked) => reads !== undefined && picked.kind === "none" && picked.reason === "sandbox-runtime-acquiring",
      schedule: Schedule.spaced("1 second"),
      times: 180,
    }),
  )
  if (discovered?.kind === "none") {
    if (reads) return yield* new ToolSafety.Denied({ reason: `shell-read-sandbox-unavailable: ${discovered.reason}` })
    if (!profile?.sandbox?.unconfinedFallback) return yield* new ToolSafety.Denied({
      reason: process.platform === "darwin" || process.platform === "linux"
        ? "required-process-sandbox-unavailable" : "sandbox-platform-unavailable",
    })
    // Owner fallback remains available only without an exact network capability.
    yield* ToolSafety.reportShell({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: discovered.reason } })
    return ordinary
  }
  if (discovered?.kind === "seatbelt" && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-seatbelt-domain-policy-unenforceable" })
  const fs = yield* FSUtil.Service
  const native = yield* ToolSafety.NativeContext
  if (!native) return yield* new ToolSafety.Denied({ reason: "sandbox-native-placement-missing" })
  const directory = yield* fs.realPath(native.directory).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-native-placement-acquisition" })),
  )
  const endpoints = yield* Effect.forEach(endpointGrants, (entry) => Effect.gen(function* () {
    const placement = yield* fs.realPath(entry.directory).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-directory-acquisition" })),
    )
    return placement === directory ? [entry.port] : []
  })).pipe(Effect.map((entries) => [...new Set(entries.flat())]))
  const sockets = yield* Effect.forEach(grants, (entry) => Effect.gen(function* () {
    const placement = yield* fs.realPath(entry.directory).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-unix-socket-directory-acquisition" })),
    )
    if (placement !== directory) return []
    // Bun's realpath rejects Unix socket leaves on macOS (EOPNOTSUPP). Resolve the parent, then lstat the exact leaf.
    const parent = yield* fs.realPath(path.dirname(entry.path)).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-unix-socket-path-acquisition" })),
    )
    const socket = path.join(parent, path.basename(entry.path))
    const info = yield* Effect.tryPromise({
      try: () => lstat(socket),
      catch: () => new ToolSafety.Denied({ reason: "sandbox-unix-socket-stat-acquisition" }),
    })
    if (!info.isSocket()) return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-not-socket" })
    return [socket]
  })).pipe(Effect.map((entries) => [...new Set(entries.flat())]))
  // SRT 0.0.78's allowUnixSockets is macOS-only; Linux only exposes allowAllUnixSockets.
  // Never silently widen an exact-path grant to all AF_UNIX endpoints.
  if (grants.length && process.platform === "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-exact-policy-unsupported" })
  // Exact grants use our outbound-only seatbelt policy, even if SRT is installed on the Mac. Linux endpoints use srt's
  // own strict-allowlist proxy, only from the pinned, hash-verified runtime (an `srt` on PATH is unverified and may
  // lack seccomp, which would leave Unix sockets open); without a ready pinned srt they refuse below and never run unconfined.
  const sandbox = discovered ?? (process.platform !== "darwin" ? yield* pick(true, endpointGrants.length > 0, command) : yield* available(yield* Seatbelt).pipe(
    Effect.map((binary) => binary
      ? { kind: "seatbelt" as const, binary }
      : { kind: "none" as const, reason: "sandbox-seatbelt-unavailable" }),
  ))
  if (sandbox.kind === "none") {
    return yield* new ToolSafety.Denied({ reason: endpointGrants.length
      ? "sandbox-loopback-endpoint-backend-unavailable" : "sandbox-unix-socket-backend-unavailable" })
  }
  const seatbelt = sandbox.kind === "seatbelt"
  if (seatbelt && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-seatbelt-domain-policy-unenforceable" })
  if (profile?.sandbox?.scratch && readonlyGoCache(env.GOFLAGS ?? ""))
    return yield* new ToolSafety.Denied({ reason: "sandbox-go-readonly-cache-unsupported" })
  const cwd = yield* fs.realPath(command.options.cwd ?? process.cwd()).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-cwd-acquisition" })),
  )
  // Roots follow ToolSafety.before: a file or a path not created yet resolves through its nearest existing ancestor.
  const requested = (profile?.writeRoots ?? [directory]).map((root) => path.resolve(directory, root))
  const declared = yield* Effect.forEach(requested, (root) => canonical(fs, root).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-write-root-acquisition" })),
  ))
  const entries = [...new Set([
    Global.Path.data, Global.Path.state, path.join(Global.Path.home, ".ssh"), path.join(Global.Path.home, ".aws"),
    path.join(Global.Path.home, ".git-credentials"), path.join(Global.Path.home, ".npmrc"),
    ...(profile?.managedPaths ?? []), ...(profile?.sandbox?.denyPaths ?? []), ...(profile?.neverTouch ?? []),
    // Deny missing names too: credentials may be created after this policy is allocated.
    ...(reads ? yield* ToolSafetySandboxHomes.secrets(env, cwd) : []),
  ])]
  const deny = yield* Effect.forEach(entries, (entry) => policyPath(fs, directory, entry, seatbelt))
  const protectedWrites = yield* Effect.forEach(profile?.protectedWrites ?? [], (entry) => policyPath(fs, directory, entry, seatbelt))
  if (protectedWrites.length && profile?.allowedConfigEdits?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-config-write-exception-unenforceable" })
  // Project config runs on the host (LSP, formatter and MCP commands, plugins), so a sandboxed command never writes it.
  // This is separate from the profile's list: an owner-approved edit-tool exception does not reach the shell.
  const guarded = [...new Set([...protectedWrites, ...(yield* SandboxProjectConfig.protectedPaths(fs, [directory, cwd, ...declared]))])]
  if (sockets.some((socket) => deny.some((entry) => FSUtil.contains(entry, socket))))
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-denied-path" })
  const parents = options?.prepareParents === true
    ? yield* SandboxParents.plan(fs, directory, requested, [...deny, ...guarded])
    : []
  const invocation = command.options.shell
    ? [typeof command.options.shell === "string" ? command.options.shell : "/bin/sh", "-c", [command.command, ...command.args].join(" ")]
    : [command.command, ...command.args]
  // Only owned route-adapted clients consume these host services; kernel TCP remains denied.
  const proxy = endpoints.length && seatbelt ? yield* TcpProxy.open(endpoints, deny) : undefined
  const scratch = profile?.sandbox?.scratch
    ? yield* fs.makeTempDirectoryScoped({ prefix: "orchestra-tool-scratch-" }).pipe(
        Effect.flatMap((created) => fs.realPath(created)),
        Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-scratch-acquisition" })),
      )
    : undefined
  const roots = scratch ? [...declared, scratch] : declared
  // Toolchain caches move into the scratch dir: the real ones lie outside the roots and are not writable in the jail.
  const confined = scratch ? {
    ...env, TMPDIR: scratch, TMP: scratch, TEMP: scratch,
    GOCACHE: path.join(scratch, "go-build"), GOMODCACHE: path.join(scratch, "go-mod"), XDG_CACHE_HOME: path.join(scratch, "cache"),
    // Go's default read-only module directories prevent scoped scratch cleanup; keep only this child's cache writable.
    GOFLAGS: [env.GOFLAGS, "-modcacherw"].filter(Boolean).join(" "),
    npm_config_cache: path.join(scratch, "npm"), BUN_INSTALL_CACHE_DIR: path.join(scratch, "bun"),
    PIP_CACHE_DIR: path.join(scratch, "pip"), UV_CACHE_DIR: path.join(scratch, "uv"),
  } : env
  if (scratch) yield* Effect.forEach(["go-build", "go-mod", "cache", "npm", "bun", "pip", "uv"], (name) =>
    fs.makeDirectory(path.join(scratch, name)).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-scratch-cache-acquisition" })),
    ), { discard: true })
  if (sandbox.kind === "appcontainer") {
    // Git cannot start in the AppContainer: exactly one read-only git call runs on the host, any other one is held.
    const git = ToolSafetyGitHost.words(command)
    if (git) {
      const host = yield* ToolSafetyGitHost.command({ words: git, command, cwd, directory, writes: roots, env: confined })
      yield* ToolSafety.reportShell({ shellWrites: "enforced", shellSandbox: { kind: sandbox.kind, reason: "git-host-read-only" } })
      return host
    }
    const launched = yield* ToolSafetyAppContainer.command({
      command, supervisor: sandbox.supervisor, cwd, directory, roots: declared, scratch, deny, guards: guarded,
      // The guard journal must be the same location for every Orchestra instance on the machine, or one instance's
      // restore would race another's protection. It is keyed per user (%LOCALAPPDATA%, or its default when this
      // process's environment lacks it), never per instance-state dir; multiple OS users sharing one checkout is out of
      // scope.
      journal: path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "orchestra", "appcontainer-guard"),
      env: confined, ports: endpoints, domains: profile?.sandbox?.allowedDomains?.length ?? 0,
    }).pipe(Effect.result)
    // A policy the ACLs cannot express is an unavailable sandbox for this command, never for an exact endpoint.
    if (launched._tag === "Failure") {
      if (endpoints.length || !profile?.sandbox?.unconfinedFallback) return yield* launched.failure
      yield* ToolSafety.reportShell({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: launched.failure.reason } })
      return ordinary
    }
    if (options?.prepareParents === true) yield* SandboxParents.prepare(fs, directory, parents)
    yield* ToolSafety.reportShell({ shellWrites: "enforced", shellSandbox: { kind: sandbox.kind } })
    return launched.success
  }
  // Confined reads: the granted roots, the write roots and the host toolchain. A toolchain path inside a denied path
  // stays denied; a granted root inside one (saved tool output under data) is carved out of it.
  const granted = reads ? yield* existing(fs, reads) : []
  const readable = reads ? [...new Set([...roots, ...granted, ...[...(yield* ToolSafetySandboxHomes.contained(fs, ToolSafetySandboxHomes.homeGrants(confined))), ...(yield* ToolSafetySandboxHomes.programRoots(fs, [
    ...ToolSafetySandboxHomes.programs(confined),
    ...(sandbox.kind === "srt" && sandbox.directory ? [{ entry: sandbox.directory, prefix: false }] : []),
  ]))].filter((entry) => !deny.some((denied) => FSUtil.contains(denied, entry)))])] : undefined
  const carved = granted.filter((entry) => deny.some((denied) => denied !== entry && FSUtil.contains(denied, entry)))
  if (seatbelt) {
    // Denials override allow-default. Dependency reads remain available, but writes outside physical roots do not.
    // file-write* also covers mode, flag, owner and xattr changes (chmod, chflags), so those stay inside the roots.
    // /dev/null stays writable so ordinary redirections work.
    const outside = `(require-all (require-not (literal "/dev/null")) ${roots.map((root) => `(require-not (subpath ${JSON.stringify(root)}))`).join(" ")})`
    // Confined reads deny every path outside the readable set. "/" and macOS's /etc, /tmp and /var links stay readable
    // as single entries; directory metadata stays readable so realpath() can walk to an allowed path (srt does the same).
    const unreadable = readable && `(require-all ${["/", "/etc", "/tmp", "/var"].map((entry) => `(require-not (literal ${JSON.stringify(entry)}))`).join(" ")} ${
      readable.map((entry) => `(require-not (subpath ${JSON.stringify(entry)}))`).join(" ")})`
    const policy = ["(version 1)", "(allow default)", "(deny network*)", "(deny appleevent-send)", `(deny file-write* ${outside})`,
      ...(unreadable ? [`(deny file-read* ${unreadable})`, "(allow file-read-metadata (vnode-type DIRECTORY))"] : []),
      ...[...sockets, ...(proxy?.sockets ?? [])].map((socket) => `(allow network-outbound (remote unix-socket (literal ${JSON.stringify(socket)})))`),
      ...deny.map((entry) => `(deny file-read* file-write* (subpath ${JSON.stringify(entry)}))`),
      ...guarded.map((entry) => `(deny file-write* (subpath ${JSON.stringify(entry)}))`),
      // The last matching rule wins: a carved-out root is readable again, and a denied path inside it is denied again.
      ...carved.map((entry) => `(allow file-read* (subpath ${JSON.stringify(entry)}))`),
      ...deny.filter((entry) => carved.some((root) => root !== entry && FSUtil.contains(root, entry)))
        .map((entry) => `(deny file-read* file-write* (subpath ${JSON.stringify(entry)}))`),
    ].join("\n")
    if (options?.prepareParents === true) yield* SandboxParents.prepare(fs, directory, parents)
    yield* ToolSafety.reportShell({ shellWrites: "enforced", shellSandbox: { kind: sandbox.kind } })
    return ChildProcess.make(sandbox.binary, ["-p", policy, ...invocation], {
      ...command.options, cwd, shell: false, env: { ...confined, ...proxy?.env }, extendEnv: false,
    })
  }
  if (options?.prepareParents === true) yield* SandboxParents.prepare(fs, directory, parents)
  // srt binds only write roots that exist and leaves a missing one read-only, so a command could never create its
  // declared output file (go.sum, gen/out.ts). Each missing root whose parent exists gets an empty file for this
  // command, removed when it ends unless the command wrote it. A missing root meant as a directory stays unwritable.
  yield* Effect.forEach(roots, (root) => roots.some((other) => other !== root && FSUtil.contains(other, root)) ||
    [...deny, ...protectedWrites].some((entry) => FSUtil.contains(entry, root))
    ? Effect.void
    : Effect.asVoid(Effect.acquireRelease(Effect.sync(() => placeholder(root)), (created) => Effect.sync(() => created && release(root, created)))),
  { discard: true })
  // srt re-mounts a landing's readable paths read-only after its write roots, so a readable path holding an existing
  // write root (a bound root inside the worktree) would cover it. Denying that root's reads too makes it a deeper landing
  // of its own, which srt processes later and restores writable.
  const nested = readable
    ? yield* Effect.filter(roots.filter((root) => readable.some((entry) => entry !== root && FSUtil.contains(entry, root))), fs.existsSafe)
    : []
  const temp = yield* fs.makeTempDirectoryScoped({ prefix: "orchestra-tool-sandbox-" }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-policy-directory-acquisition" })),
  )
  const policy = path.join(temp, "settings.json")
  // bwrap blocks creating an absent deny path by binding /dev/null there, which its nodev bind makes unreadable:
  // `grep -r`, `ls -l` and `find` fail on the ghost. srt binds a read-only empty directory instead when the absent name
  // is the parent of another deny path: just as uncreatable, and it reads as empty. Include srt 0.0.78's mandatory cwd
  // denies (linuxGetCwdMandatoryDenyPaths), not only Orchestra config. The git leaves apply only to a real .git directory;
  // a worktree's .git file must never get child mounts. Policy preparation creates no host-side placeholders.
  const absent = process.platform === "linux"
    ? yield* Effect.filter([...guarded, ...[
        ".gitconfig", ".gitmodules", ".bashrc", ".bash_profile", ".zshrc", ".zprofile", ".profile", ".ripgreprc", ".mcp.json",
        ".vscode", ".idea", ".claude/commands", ".claude/agents",
        ...(yield* fs.isDir(path.join(cwd, ".git"))) ? [".git/hooks", ".git/config"] : [],
      ].map((entry) => path.join(cwd, entry))], (entry) => fs.isDir(path.dirname(entry)).pipe(
        Effect.map((directory) => directory && !lstatSync(entry, { throwIfNoEntry: false }))))
    : []
  // Plain TCP clients (libpq, SQLx, PGLS) cannot speak CONNECT. This host-written forwarder runs first inside the same
  // sandbox and network namespace, on this process's own runtime: it listens on each granted 127.0.0.1 port there,
  // tunnels every connection through srt's proxy (which still enforces the allowlist), runs the command as its child and
  // exits with it. A port it cannot bind refuses the command. Its directory is denied writes, and it holds no privilege
  // the command lacks: the namespace has no other route.
  const forwarder = endpoints.length ? path.join(temp, "orchestra-endpoint-forwarder.cjs") : undefined
  if (forwarder) yield* fs.writeFileString(forwarder, FORWARDER, { mode: 0o400 }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-forwarder-write" })),
  )
  yield* fs.writeFileString(policy, JSON.stringify({
    // srt expands a "/" read deny into the root's children (never /proc, /dev or /sys) and re-mounts allowRead paths.
    // Under confined reads the endpoint forwarder still needs its own script and this process's runtime.
    filesystem: {
      allowRead: readable ? [...readable, ...(forwarder ? [temp] : [])] : [],
      denyRead: readable ? ["/", ...deny, ...nested] : deny,
      allowWrite: roots,
      denyWrite: [...deny, ...guarded, ...(forwarder ? [temp] : []), ...absent.map((entry) => path.join(entry, "orchestra-guard"))],
    },
    // An exact endpoint is an IP-literal host:port entry; its network namespace has no other route. Domain and
    // endpoint grants are mutually exclusive above. Never allowAllUnixSockets: it would expose host daemons.
    network: {
      allowedDomains: [...profile?.sandbox?.allowedDomains ?? [], ...endpoints.map((port) => `127.0.0.1:${port}`)],
      deniedDomains: [], strictAllowlist: true, allowUnixSockets: sockets, allowAllUnixSockets: false, allowLocalBinding: false,
    },
    enableWeakerNestedSandbox: false, enableWeakerNetworkIsolation: false, allowAppleEvents: false,
    ...(sandbox.ripgrep ? { ripgrep: { command: sandbox.ripgrep } } : {}),
  }), { mode: 0o600 }).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-policy-write" })))
  yield* ToolSafety.reportShell({ shellWrites: "enforced", shellSandbox: { kind: sandbox.kind } })
  // srt quotes the words after `--` itself; a pre-quoted single word would run as one program name.
  return ChildProcess.make(sandbox.command, [...sandbox.args, "--settings", policy, "--",
    ...forwarder ? [process.execPath, ...RUNTIME_FLAGS, forwarder, endpoints.join(";")] : [], ...invocation], {
    ...command.options, cwd, shell: false, extendEnv: false,
    // srt replaces the child's TMPDIR with CLAUDE_CODE_TMPDIR, by default a /tmp/claude that does not exist in the jail;
    // pin it to the command's own (its scratch directory when it has one).
    env: { ...confined, ...sandbox.env, CLAUDE_CODE_TMPDIR: confined.TMPDIR ?? os.tmpdir(),
      ...endpoints.length ? { ORCHESTRA_TCP_PROXY_CONNECT: endpoints.join(";") } : {} },
  })
})

/**
 * Language servers and formatters execute workspace-controlled code (binaries, configs, plugins, build scripts), so
 * they never run with the host's authority. No network; the shell sandbox's denied paths stay unreadable; writes reach
 * only `write` and a fresh scratch directory that becomes TMPDIR and the cache dirs. macOS uses seatbelt, Linux only
 * the pinned, hash-verified srt with its seccomp filter; anywhere else, or without a ready backend, this refuses and
 * nothing runs unconfined. The caller keeps the Scope open until the child exits.
 */
export const confine = Effect.fn("ToolSafetySandbox.confine")(function* (input: {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  /** Existing files inside `cwd` the program may rewrite in place. */
  readonly write?: ReadonlyArray<string>
}) {
  if (process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ToolSafety.Denied({ reason: `sandbox-platform-unsupported: ${process.platform}` })
  const sandbox = process.platform === "darwin"
    ? yield* available("/usr/bin/sandbox-exec").pipe(Effect.map((binary) => binary
        ? { kind: "seatbelt" as const, binary }
        : { kind: "none" as const, reason: "sandbox-seatbelt-unavailable" }))
    : yield* pick(true, true).pipe(Effect.flatMap((picked) => picked.kind === "none" && picked.reason === "sandbox-runtime-acquiring"
        ? ToolSafetySandboxRuntime.settled().pipe(Effect.andThen(pick(false, true)))
        : Effect.succeed(picked)))
  if (sandbox.kind === "none") return yield* new ToolSafety.Denied({ reason: sandbox.reason })
  // Language servers and formatters are not launched through the Windows AppContainer yet.
  if (sandbox.kind === "appcontainer") return yield* new ToolSafety.Denied({ reason: "sandbox-platform-unsupported: appcontainer" })
  // A granted file is checked through the same physical path the policy grants, so a symlink planted at it or at a
  // parent cannot carry the grant outside cwd.
  const write = yield* Effect.forEach(input.write ?? [], (file) => io("sandbox-write-file-acquisition", () => realpath(file)))
  if (write.length) {
    const cwd = yield* io("sandbox-cwd-acquisition", () => realpath(input.cwd))
    if (write.some((file) => !FSUtil.contains(cwd, file)))
      return yield* new ToolSafety.Denied({ reason: "sandbox-write-file-outside-cwd" })
  }
  const deny = yield* Effect.forEach([Global.Path.data, Global.Path.state, path.join(Global.Path.home, ".ssh"),
    path.join(Global.Path.home, ".aws"), path.join(Global.Path.home, ".git-credentials"), path.join(Global.Path.home, ".npmrc")],
  (entry) => io("sandbox-deny-path-acquisition", () => physical(entry)))
  const scratch = yield* temporary("orchestra-confined-")
  const env = {
    ...environment(input.env), TMPDIR: scratch, TMP: scratch, TEMP: scratch, XDG_CACHE_HOME: path.join(scratch, "cache"),
    GOCACHE: path.join(scratch, "go-build"), CARGO_TARGET_DIR: path.join(scratch, "target"),
  }
  const roots = [scratch, ...write]
  if (sandbox.kind === "seatbelt") {
    const outside = `(require-all (require-not (literal "/dev/null")) ${roots.map((root) => `(require-not (subpath ${JSON.stringify(root)}))`).join(" ")})`
    const policy = ["(version 1)", "(allow default)", "(deny network*)", "(deny appleevent-send)", `(deny file-write* ${outside})`,
      ...deny.map((entry) => `(deny file-read* file-write* (subpath ${JSON.stringify(entry)}))`)].join("\n")
    return { command: sandbox.binary, args: ["-p", policy, input.command, ...input.args], env }
  }
  // The policy lives outside every writable root, so the program cannot rewrite it.
  const settings = path.join(yield* temporary("orchestra-confined-policy-"), "settings.json")
  yield* io("sandbox-policy-write", () => writeFile(settings, JSON.stringify({
    filesystem: { allowRead: [], denyRead: deny, allowWrite: roots, denyWrite: deny },
    network: { allowedDomains: [], deniedDomains: [], strictAllowlist: true, allowUnixSockets: [], allowAllUnixSockets: false, allowLocalBinding: false },
    enableWeakerNestedSandbox: false, enableWeakerNetworkIsolation: false, allowAppleEvents: false,
    ...(sandbox.ripgrep ? { ripgrep: { command: sandbox.ripgrep } } : {}),
  }), { mode: 0o600 }))
  // srt's launcher runs on the host before any confinement, with the workspace as its cwd: under Bun it must not load
  // that directory's bunfig.toml (whose preload runs code) or .env.
  return {
    command: sandbox.command,
    args: [...(process.versions.bun ? ["--no-env-file", "--config=/dev/null"] : []), ...sandbox.args, "--settings", settings, "--", input.command, ...input.args],
    env: { ...env, ...sandbox.env },
  }
})

/**
 * Whether launching `command` may run workspace-controlled code even though the program itself is trusted: it lies
 * inside `directory` (before or after symlinks), it is a package or version-manager runner (`npx`, `uv run`, `mise exec`
 * load whatever the workspace names), or it is a version-manager shim, which resolves its real binary from workspace
 * files (`.tool-versions` `path:` versions, mise.toml, .python-version, .node-version, rust-toolchain.toml, ...).
 * Over-confining costs a sandbox launch; under-confining runs workspace code with the host's authority.
 */
export async function runsWorkspaceCode(directory: string, command: string, args: ReadonlyArray<string>, cwd: string) {
  if (runner(path.basename(command), args)) return true
  const program = path.isAbsolute(command) || /[\\/]/.test(command)
    ? path.resolve(cwd, command)
    : await which(command, { nothrow: true })
  if (!program) return false
  if (FSUtil.contains(path.resolve(directory), program)) return true
  const real = await physical(program)
  return FSUtil.contains(await physical(directory), real) || SHIM_DIRECTORY.test(program) || SHIM_DIRECTORY.test(real) ||
    VERSION_MANAGERS.has(programName(path.basename(real))) || await execsVersionManager(real)
}

const VERSION_MANAGERS = new Set(["asdf", "mise", "rtx", "rbenv", "pyenv", "nodenv", "goenv", "jenv", "volta", "volta-shim", "proto", "proto-shim"])
const SHIM_DIRECTORY = /[\\/](?:shims|\.?volta[\\/]bin|\.proto[\\/]bin)[\\/]/

// Programs that run a package script, a dependency's binary or workspace code on behalf of the workspace, by the
// subcommands that do so (`true`: any invocation).
const RUNNERS: Record<string, true | ReadonlyArray<string>> = {
  npx: true, bunx: true, pnpx: true, uvx: true, yarn: true, corepack: true,
  npm: ["exec", "x", "run", "run-script", "start", "test"], pnpm: ["exec", "dlx", "x", "run", "start", "test"],
  bun: ["x", "run", "test"], bundle: ["exec"], bundler: ["exec"], pipx: ["run"], uv: ["run", "tool", "x"],
  poetry: ["run"], pipenv: ["run"], pdm: ["run"], hatch: ["run"], rye: ["run"], go: ["run"], cargo: ["run"],
}

function programName(base: string) {
  return base.replace(/\.(?:exe|cmd|bat|ps1)$/i, "")
}

function runner(base: string, args: ReadonlyArray<string>) {
  const name = programName(base)
  if (VERSION_MANAGERS.has(name)) return true
  if (/^(?:python|py)[\d.]*$/.test(name)) return args.includes("-m")
  const subcommands = RUNNERS[name]
  return subcommands === true || (subcommands !== undefined && args.some((arg) => subcommands.includes(arg)))
}

// A shim script ends in `exec <version manager> ...`; a native or binary shim never starts with a shebang.
async function execsVersionManager(file: string) {
  const handle = await open(file, "r").catch(() => undefined)
  if (!handle) return false
  const head = await handle.read(Buffer.alloc(4096), 0, 4096, 0).catch(() => undefined)
  await handle.close()
  const text = head?.buffer.subarray(0, head.bytesRead).toString("utf8")
  return !!text?.startsWith("#!") && /\bexec\b[^\n]*\b(?:asdf|mise|rtx|rbenv|pyenv|nodenv|goenv|jenv|volta|proto)\b/.test(text)
}

// A path with its existing part resolved through symlinks; a missing leaf keeps its name.
async function physical(target: string): Promise<string> {
  return realpath(target).catch(async () => {
    const parent = path.dirname(target)
    return parent === target ? target : path.join(await physical(parent), path.basename(target))
  })
}

const io = <A>(reason: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new ToolSafety.Denied({ reason }) })

const temporary = (prefix: string) => Effect.acquireRelease(
  io("sandbox-scratch-acquisition", () => mkdtemp(path.join(os.tmpdir(), prefix)).then((created) => realpath(created))),
  (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
)

/**
 * The sandbox for this host: `srt` on PATH, else seatbelt on macOS, else on Linux the fetched sandbox runtime run by
 * this process's own JavaScript runtime; on Windows the omni supervisor's AppContainer mode, for pwsh and cmd only.
 * `start` lets a Linux host begin fetching that runtime on first need.
 * `pinned` (exact endpoint grants) ignores PATH and accepts only the verified runtime that ships its seccomp filter.
 */
const pick = Effect.fnUntraced(function* (start: boolean, pinned = false, command?: ChildProcess.StandardCommand) {
  if (process.platform === "win32") {
    const supervisor = yield* ToolSafetyAppContainer.Launcher
    if (!supervisor) return { kind: "none" as const, reason: "sandbox-appcontainer-launcher-unavailable" }
    // Without a command, the shell this host's shell tool uses by default.
    if (!(command ? ToolSafetyAppContainer.confinable(command) : ToolSafetyAppContainer.shell(Shell.acceptable())))
      return { kind: "none" as const, reason: "sandbox-appcontainer-shell-unsupported" }
    return { kind: "appcontainer" as const, supervisor }
  }
  if (process.platform !== "darwin" && process.platform !== "linux")
    return { kind: "none" as const, reason: `sandbox-platform-unsupported: ${process.platform}` }
  const binary = pinned ? undefined : yield* available()
  if (binary && binary === (yield* Seatbelt)) return { kind: "seatbelt" as const, binary }
  if (binary) return { kind: "srt" as const, command: binary, args: [], env: {}, ripgrep: undefined, directory: undefined }
  const runtime = yield* ToolSafetySandboxRuntime.resolve(start)
  if (runtime.reason !== undefined) return { kind: "none" as const, reason: runtime.reason }
  // Without apply-seccomp srt only logs a debug warning and leaves AF_UNIX connects open.
  if (pinned && !(yield* ToolSafetySandboxRuntime.seccomp(runtime.directory)))
    return { kind: "none" as const, reason: "sandbox-seccomp-unavailable" }
  return {
    kind: "srt" as const,
    command: process.execPath,
    args: [...RUNTIME_FLAGS, ToolSafetySandboxRuntime.cli(runtime.directory)],
    // A compiled Bun binary runs scripts only when told to; Electron runs as Node only when told to.
    env: process.versions.bun ? { BUN_BE_BUN: "1" } : process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {},
    ripgrep: ToolSafetySandboxRuntime.ripgrep(runtime.directory),
    // Confined reads keep the runtime readable: srt starts its seccomp helper from it inside the jail.
    directory: runtime.directory,
  }
})

/** An exclusively created empty file at a missing write root whose parent exists, with its identity; else undefined. */
function placeholder(root: string) {
  return Result.try(() => {
    closeSync(openSync(root, "wx", 0o644))
    return lstatSync(root, { bigint: true })
  }).pipe(Result.getOrUndefined)
}

/** Removes the placeholder only while it is the same empty file nobody wrote (a write or truncation moves mtime). */
function release(root: string, created: BigIntStats) {
  Result.try(() => {
    const info = lstatSync(root, { bigint: true })
    if (info.isFile() && info.dev === created.dev && info.ino === created.ino && info.size === 0n &&
      info.mtimeNs === created.mtimeNs && info.ctimeNs === created.ctimeNs) unlinkSync(root)
  })
}

/**
 * The entries that exist, each with its physical path. A link stays listed too: seatbelt checks the link itself before
 * following it (/etc/localtime). A missing entry has nothing to allow.
 */
const existing = (fs: FSUtil.Interface, entries: ReadonlyArray<string>) =>
  Effect.forEach(entries, (entry) => fs.realPath(entry).pipe(
    Effect.map((real) => [path.resolve(entry), real]),
    Effect.catch(() => Effect.succeed([])),
  )).pipe(Effect.map((found) => [...new Set(found.flat())]))

// Go cmd/internal/quoted.Split: ASCII whitespace, quotes only at field start, no unescaping or concatenation.
// Malformed quotes/boolean values stay Go errors. SetFromGOFLAGS applies matching flags in order, last wins.
// An absent setting is not an explicit read-only request; confined scratch may supply its writable default.
export function readonlyGoCache(input: string) {
  const tokens: string[] = []
  let rest = input
  while (rest.length) {
    rest = rest.replace(/^[ \t\n\r]+/, "")
    if (!rest.length) break
    const quote = rest[0] === "'" || rest[0] === '"'
    const end = quote ? rest.indexOf(rest[0], 1) : rest.search(/[ \t\n\r]/)
    if (quote && end === -1) return false
    tokens.push(quote ? rest.slice(1, end) : end === -1 ? rest : rest.slice(0, end))
    rest = end === -1 ? "" : rest.slice(end + (quote ? 1 : 0))
  }
  const settings = tokens.filter((token) => /^--?modcacherw(?:=|$)/.test(token))
  if (settings.some((token) => !/^--?modcacherw(?:=(?:1|t|T|true|TRUE|True|0|f|F|false|FALSE|False))?$/.test(token))) return false
  return /^--?modcacherw=(?:0|f|F|false|FALSE|False)$/.test(settings.at(-1) ?? "")
}

/** Resolve existing symlinks and missing leaves before handing paths to an OS policy. */
const canonical = ToolSafetySandboxHomes.canonical

const policyPath = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, entry: string, seatbelt: boolean) {
  const target = path.resolve(directory, entry)
  // Seatbelt and srt on Linux enforce literal subtrees, not arbitrary shell globs. A trailing /** names that subtree.
  // Windows' AppContainer ACLs take no globs at all.
  const literal = (seatbelt || process.platform === "linux") && target.endsWith("/**") ? target.slice(0, -3) : target
  if (/[*?[]/.test(literal) && (seatbelt || process.platform !== "darwin")) return yield* new ToolSafety.Denied({
    reason: seatbelt ? "sandbox-seatbelt-glob-policy-unenforceable"
      : process.platform === "win32" ? "sandbox-appcontainer-glob-policy-unenforceable" : "sandbox-linux-glob-policy-unenforceable",
  })
  return yield* canonical(fs, literal)
})

// Bun loads ./bunfig.toml (whose preload runs code) and ./.env from its cwd, which is the command's writable workspace.
// srt's launcher runs on the host before any confinement, and the forwarder's environment becomes the command's, so
// neither may read them. Node and Electron-as-Node load neither.
const RUNTIME_FLAGS = process.versions.bun ? ["--no-env-file", "--config=/dev/null"] : []

// CommonJS for Node, Bun and Electron-as-Node alike. Exit 125 names a refusal before the command ran.
const FORWARDER = String.raw`"use strict"
const net = require("net")
const { spawn } = require("child_process")
const { constants } = require("os")
const fail = (reason, code = 125) => {
  process.stderr.write("orchestra-endpoint-forwarder:" + reason + "\n")
  process.exit(code)
}
const ports = (process.argv[2] || "").split(";").map(Number)
if (ports.some((port) => !Number.isSafeInteger(port) || port < 1 || port > 65535)) fail("invalid-ports")
const proxy = URL.canParse(process.env.HTTP_PROXY || "") ? new URL(process.env.HTTP_PROXY) : undefined
if (!proxy || proxy.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(proxy.hostname) || !/^\d+$/.test(proxy.port))
  fail("invalid-proxy")
const auth = proxy.username
  ? "Proxy-Authorization: Basic " +
    Buffer.from(decodeURIComponent(proxy.username) + ":" + decodeURIComponent(proxy.password)).toString("base64") + "\r\n"
  : ""
const tunnel = (port) => (client) => {
  // Bun drops bytes that arrive on a paused socket, so early client bytes are held until the tunnel is up.
  const early = []
  const hold = (chunk) => early.push(chunk)
  client.on("data", hold)
  const upstream = net.connect({ host: "127.0.0.1", port: Number(proxy.port), allowHalfOpen: true })
  const close = () => {
    client.destroy()
    upstream.destroy()
  }
  client.on("error", close)
  upstream.on("error", close)
  upstream.once("connect", () =>
    upstream.write("CONNECT 127.0.0.1:" + port + " HTTP/1.1\r\nHost: 127.0.0.1:" + port + "\r\n" + auth + "\r\n"))
  let head = Buffer.alloc(0)
  const reply = (chunk) => {
    head = Buffer.concat([head, chunk])
    const end = head.indexOf("\r\n\r\n")
    if (end === -1) return head.length > 16384 && close()
    upstream.off("data", reply)
    if (!/^HTTP\/1\.[01] 200 /.test(head.toString("latin1", 0, end))) return close()
    if (head.length > end + 4) client.write(head.subarray(end + 4))
    client.off("data", hold)
    for (const chunk of early) upstream.write(chunk)
    upstream.pipe(client)
    client.pipe(upstream)
  }
  upstream.on("data", reply)
}
const start = () => {
  const child = spawn(process.argv[3], process.argv.slice(4), { stdio: "inherit" })
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal))
  child.once("error", (error) => fail("spawn-failed:" + error.code, 127))
  child.once("exit", (code, signal) => process.exit(code ?? 128 + (constants.signals[signal] || 0)))
}
let pending = ports.length
for (const port of ports)
  net.createServer({ allowHalfOpen: true }, tunnel(port))
    .once("error", (error) => fail("listen-failed:" + port + ":" + error.code))
    .listen(port, "127.0.0.1", () => --pending || start())
`
