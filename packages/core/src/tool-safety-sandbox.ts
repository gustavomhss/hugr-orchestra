export * as ToolSafetySandbox from "./tool-safety-sandbox"

import path from "path"
import which from "which"
import { lstat } from "node:fs/promises"
import { Effect, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { ToolSafety } from "./tool-safety"
import { ToolSafetySandboxRuntime } from "./tool-safety-sandbox-runtime"
import { SandboxParents } from "./sandbox-parents"

/** Tool-child environment only. Never applied to provider adapters or the server process. */
export function environment(input: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(input).filter(([name, value]) =>
    value !== undefined && !/(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIAL)/i.test(name) &&
    !["SSH_AUTH_SOCK", "SSH_ASKPASS", "GIT_ASKPASS", "ORCHESTRA_AUTH_CONTENT"].includes(name) &&
    !/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bsk_live_[A-Za-z0-9]{20,}\b/.test(value)))
}

/** Discovery performs filesystem checks only; confinement starts when the caller spawns the command. */
export const available = (executable?: string) => Effect.tryPromise({
  try: async () => {
    const binary = await which(executable ?? "srt", { nothrow: true })
    if (binary || executable || process.platform !== "darwin") return binary
    return which("/usr/bin/sandbox-exec", { nothrow: true })
  },
  catch: () => new ToolSafety.Denied({ reason: "sandbox-binary-acquisition" }),
})

export const backend = Effect.fn("ToolSafetySandbox.backend")(function* () {
  const binary = yield* available()
  return binary ? { kind: binary === "/usr/bin/sandbox-exec" ? "seatbelt" as const : "srt" as const, binary } : undefined
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
  const endpointGrants = Array.from(requestedEndpoints ?? [], (entry) => ({ ...entry }))
  yield* Effect.forEach(endpointGrants, (entry) => Effect.gen(function* () {
    if (typeof entry.directory !== "string" || !path.isAbsolute(entry.directory) || /[*?\[\]\0]/.test(entry.directory))
      return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-directory" })
    if (entry.host !== "127.0.0.1") return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-host" })
    if (!Number.isSafeInteger(entry.port) || entry.port < 1 || entry.port > 65535)
      return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-port" })
  }), { discard: true })
  if (!profile?.requireSandbox && !profile?.sandbox?.enabled && grants.length === 0 && endpointGrants.length === 0) return ordinary
  // Exact endpoint/socket capabilities never permit unconfined fallback, including during runtime acquisition.
  if (endpointGrants.length && process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-exact-policy-unsupported" })
  if (grants.length && process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-platform-unsupported" })
  if (endpointGrants.length && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-domain-policy-unenforceable" })
  if (grants.length && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-domain-policy-unenforceable" })
  const discovered = grants.length || endpointGrants.length ? undefined : yield* pick(true)
  if (discovered?.kind === "none") {
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
  // SRT domain proxies do not enforce raw endpoint grants. Our measured seatbelt localhost filter also admits
  // host LAN IPv4 at the same port, so it cannot honor the requested exact 127.0.0.1 capability either.
  if ((endpointGrants.length && process.platform === "linux") || endpoints.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-exact-policy-unsupported" })
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
  // Exact grants use our outbound-only seatbelt policy, even if SRT is installed on the Mac.
  const sandbox = discovered ?? (yield* available("/usr/bin/sandbox-exec").pipe(
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
  ])]
  const deny = yield* Effect.forEach(entries, (entry) => policyPath(fs, directory, entry, seatbelt))
  const protectedWrites = yield* Effect.forEach(profile?.protectedWrites ?? [], (entry) => policyPath(fs, directory, entry, seatbelt))
  if (protectedWrites.length && profile?.allowedConfigEdits?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-config-write-exception-unenforceable" })
  if (sockets.some((socket) => deny.some((entry) => FSUtil.contains(entry, socket))))
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-denied-path" })
  const parents = options?.prepareParents === true
    ? yield* SandboxParents.plan(fs, directory, requested, [...deny, ...protectedWrites])
    : []
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
  const invocation = command.options.shell
    ? [typeof command.options.shell === "string" ? command.options.shell : "/bin/sh", "-c", [command.command, ...command.args].join(" ")]
    : [command.command, ...command.args]
  if (seatbelt) {
    // Denials override allow-default. Dependency reads remain available, but writes outside physical roots do not.
    // file-write* also covers mode, flag, owner and xattr changes (chmod, chflags), so those stay inside the roots.
    // /dev/null stays writable so ordinary redirections work.
    const outside = `(require-all (require-not (literal "/dev/null")) ${roots.map((root) => `(require-not (subpath ${JSON.stringify(root)}))`).join(" ")})`
    const policy = ["(version 1)", "(allow default)", "(deny network*)", "(deny appleevent-send)", `(deny file-write* ${outside})`,
      ...sockets.map((socket) => `(allow network-outbound (remote unix-socket (literal ${JSON.stringify(socket)})))`),
      ...deny.map((entry) => `(deny file-read* file-write* (subpath ${JSON.stringify(entry)}))`),
      ...protectedWrites.map((entry) => `(deny file-write* (subpath ${JSON.stringify(entry)}))`),
    ].join("\n")
    if (options?.prepareParents === true) yield* SandboxParents.prepare(fs, directory, parents)
    yield* ToolSafety.reportShell({ shellWrites: "enforced", shellSandbox: { kind: sandbox.kind } })
    return ChildProcess.make(sandbox.binary, ["-p", policy, ...invocation], {
      ...command.options, cwd, shell: false, env: confined, extendEnv: false,
    })
  }
  const temp = yield* fs.makeTempDirectoryScoped({ prefix: "orchestra-tool-sandbox-" }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-policy-directory-acquisition" })),
  )
  const policy = path.join(temp, "settings.json")
  yield* fs.writeFileString(policy, JSON.stringify({
    filesystem: { allowRead: [], denyRead: deny, allowWrite: roots, denyWrite: [...deny, ...protectedWrites] },
    network: { allowedDomains: profile?.sandbox?.allowedDomains ?? [], deniedDomains: [], allowUnixSockets: sockets, allowLocalBinding: false },
    enableWeakerNestedSandbox: false, enableWeakerNetworkIsolation: false, allowAppleEvents: false,
    ...(sandbox.ripgrep ? { ripgrep: { command: sandbox.ripgrep } } : {}),
  }), { mode: 0o600 }).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-policy-write" })))
  if (options?.prepareParents === true) yield* SandboxParents.prepare(fs, directory, parents)
  yield* ToolSafety.reportShell({ shellWrites: "enforced", shellSandbox: { kind: sandbox.kind } })
  // srt quotes the words after `--` itself; a pre-quoted single word would run as one program name.
  return ChildProcess.make(sandbox.command, [...sandbox.args, "--settings", policy, "--", ...invocation], {
    ...command.options, cwd, shell: false, env: { ...confined, ...sandbox.env }, extendEnv: false,
  })
})

/**
 * The sandbox for this host: `srt` on PATH, else seatbelt on macOS, else on Linux the fetched sandbox runtime run by
 * this process's own JavaScript runtime. `start` lets a Linux host begin fetching that runtime on first need.
 */
const pick = Effect.fnUntraced(function* (start: boolean) {
  if (process.platform !== "darwin" && process.platform !== "linux")
    return { kind: "none" as const, reason: `sandbox-platform-unsupported: ${process.platform}` }
  const binary = yield* available()
  if (binary === "/usr/bin/sandbox-exec") return { kind: "seatbelt" as const, binary }
  if (binary) return { kind: "srt" as const, command: binary, args: [], env: {}, ripgrep: undefined }
  const runtime = yield* ToolSafetySandboxRuntime.resolve(start)
  if (runtime.reason !== undefined) return { kind: "none" as const, reason: runtime.reason }
  return {
    kind: "srt" as const,
    command: process.execPath,
    args: [ToolSafetySandboxRuntime.cli(runtime.directory)],
    // A compiled Bun binary runs scripts only when told to; Electron runs as Node only when told to.
    env: process.versions.bun ? { BUN_BE_BUN: "1" } : process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {},
    ripgrep: ToolSafetySandboxRuntime.ripgrep(runtime.directory),
  }
})

/** Resolve existing symlinks and missing leaves before handing paths to an OS policy. */
const canonical = Effect.fnUntraced(function* (fs: FSUtil.Interface, target: string): Effect.fn.Return<string, ToolSafety.Denied> {
  return yield* fs.realPath(target).pipe(
    Effect.catchReason("PlatformError", "NotFound", () => Effect.gen(function* () {
      const parent = path.dirname(target)
      if (parent === target) return yield* new ToolSafety.Denied({ reason: "sandbox-deny-root-acquisition" })
      return path.join(yield* canonical(fs, parent), path.basename(target))
    })),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-deny-path-acquisition" })),
  )
})

const policyPath = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, entry: string, seatbelt: boolean) {
  const target = path.resolve(directory, entry)
  // Seatbelt supports literal subtrees, not arbitrary shell globs. A trailing /** names that subtree.
  const literal = seatbelt && target.endsWith("/**") ? target.slice(0, -3) : target
  if (/[*?[]/.test(literal) && (seatbelt || process.platform === "linux")) return yield* new ToolSafety.Denied({
    reason: seatbelt ? "sandbox-seatbelt-glob-policy-unenforceable" : "sandbox-linux-glob-policy-unenforceable",
  })
  return yield* canonical(fs, literal)
})
