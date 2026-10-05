export * as ToolSafetySandbox from "./tool-safety-sandbox"

import path from "path"
import which from "which"
import { Effect, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { ToolSafety } from "./tool-safety"

/** Tool-child environment only. Never applied to provider adapters or the server process. */
export function environment(input: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(input).filter(([name, value]) =>
    value !== undefined && !/(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIAL)/i.test(name) &&
    !["SSH_AUTH_SOCK", "SSH_ASKPASS", "GIT_ASKPASS"].includes(name) &&
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

/** Caller keeps this Scope open through child exit; policy file is removed on success/failure/cancellation. */
export const wrap = Effect.fn("ToolSafetySandbox.wrap")(function* (
  command: ChildProcess.Command,
): Effect.fn.Return<ChildProcess.Command, ToolSafety.Denied, FSUtil.Service | Scope.Scope> {
  const profile = yield* ToolSafety.RuntimeProfile
  if (command._tag !== "StandardCommand") {
    if (profile?.requireSandbox || profile?.sandbox?.enabled)
      return yield* new ToolSafety.Denied({ reason: "sandbox-pipeline-unbound" })
    return ChildProcess.pipeTo(yield* wrap(command.left), yield* wrap(command.right), command.options)
  }
  const env = environment(command.options.extendEnv === false
    ? command.options.env ?? {}
    : { ...process.env, ...command.options.env })
  const ordinary = ChildProcess.make(command.command, command.args, { ...command.options, env, extendEnv: false })
  if (!profile?.requireSandbox && !profile?.sandbox?.enabled) return ordinary
  if (process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-platform-unavailable" })
  const binary = yield* available()
  if (!binary) return yield* new ToolSafety.Denied({ reason: "required-process-sandbox-unavailable" })
  const seatbelt = binary === "/usr/bin/sandbox-exec"
  if (seatbelt && profile.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-seatbelt-domain-policy-unenforceable" })
  const fs = yield* FSUtil.Service
  const native = yield* ToolSafety.NativeContext
  if (!native) return yield* new ToolSafety.Denied({ reason: "sandbox-native-placement-missing" })
  const directory = yield* fs.realPath(native.directory).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-native-placement-acquisition" })),
  )
  const cwd = yield* fs.realPath(command.options.cwd ?? process.cwd()).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-cwd-acquisition" })),
  )
  const roots = yield* Effect.forEach(profile.writeRoots ?? [directory], (root) => Effect.gen(function* () {
    const actual = yield* fs.realPath(path.resolve(directory, root)).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-write-root-acquisition" })),
    )
    const info = yield* fs.stat(actual).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-write-root-stat" })))
    if (info.type !== "Directory") return yield* new ToolSafety.Denied({ reason: "sandbox-write-root-not-directory" })
    return actual
  }))
  const entries = [...new Set([
    Global.Path.data, Global.Path.state, path.join(Global.Path.home, ".ssh"), path.join(Global.Path.home, ".aws"),
    path.join(Global.Path.home, ".git-credentials"), path.join(Global.Path.home, ".npmrc"),
    ...(profile.managedPaths ?? []), ...(profile.sandbox?.denyPaths ?? []), ...(profile.neverTouch ?? []),
  ])]
  const deny = yield* Effect.forEach(entries, (entry) => policyPath(fs, directory, entry, seatbelt))
  const protectedWrites = yield* Effect.forEach(profile.protectedWrites ?? [], (entry) => policyPath(fs, directory, entry, seatbelt))
  if (protectedWrites.length && profile.allowedConfigEdits?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-config-write-exception-unenforceable" })
  const invocation = command.options.shell
    ? [typeof command.options.shell === "string" ? command.options.shell : "/bin/sh", "-c", [command.command, ...command.args].join(" ")]
    : [command.command, ...command.args]
  if (seatbelt) {
    // Denials override allow-default. Dependency reads remain available, but writes outside physical roots do not.
    const outside = roots.length ? `(require-all ${roots.map((root) => `(require-not (subpath ${JSON.stringify(root)}))`).join(" ")})` : ""
    const policy = ["(version 1)", "(allow default)", "(deny network*)", "(deny appleevent-send)", `(deny file-write* ${outside})`,
      ...deny.map((entry) => `(deny file-read* file-write* (subpath ${JSON.stringify(entry)}))`),
      ...protectedWrites.map((entry) => `(deny file-write* (subpath ${JSON.stringify(entry)}))`),
    ].join("\n")
    return ChildProcess.make(binary, ["-p", policy, ...invocation], {
      ...command.options, cwd, shell: false, env, extendEnv: false,
    })
  }
  const temp = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-tool-sandbox-" }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-policy-directory-acquisition" })),
  )
  const policy = path.join(temp, "settings.json")
  yield* fs.writeFileString(policy, JSON.stringify({
    filesystem: { allowRead: [], denyRead: deny, allowWrite: roots, denyWrite: [...deny, ...protectedWrites] },
    network: { allowedDomains: profile.sandbox?.allowedDomains ?? [], deniedDomains: [], allowUnixSockets: [], allowLocalBinding: false },
    enableWeakerNestedSandbox: false, enableWeakerNetworkIsolation: false, allowAppleEvents: false,
  }), { mode: 0o600 }).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-policy-write" })))
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  return ChildProcess.make(binary, ["--settings", policy, "--", invocation.map(quote).join(" ")], {
    ...command.options, cwd, shell: false, env, extendEnv: false,
  })
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
