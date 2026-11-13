export * as ReviewLocalReadProcess from "./local-read-process"

import path from "path"
import { tmpdir } from "os"
import { lstat, mkdtemp, realpath, rm } from "fs/promises"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FSUtil } from "../fs-util"
import type { AppProcess } from "../process"
import { ResearchProcess } from "../research-toolkit/process"
import { ToolSafety } from "../tool-safety"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "../tool-safety-sandbox-runtime"

export type Limits = { readonly timeoutMs: number; readonly maxBytes: number; readonly maxRssBytes: number }
export const LIMITS: Limits = { timeoutMs: 30_000, maxBytes: 256 * 1024, maxRssBytes: 512 * 1024 * 1024 }
export type Input = { readonly executable: string; readonly args: ReadonlyArray<string>; readonly root: string; readonly limits?: Partial<Limits> }
export type Result = { readonly outcome: ResearchProcess.Outcome } | { readonly denied: string }

/** Host-only literal argv. Requires pre-provisioned pinned sandbox; grants projection, executable, scratch home and host toolchain reads. */
export function run(input: Input, execute: typeof ResearchProcess.run = ResearchProcess.run): Effect.Effect<Result, never, FSUtil.Service | AppProcess.Service> {
  return Effect.scoped(Effect.gen(function* () {
    if (process.platform !== "linux" || process.arch !== "x64") return denied("read-sandbox-unsupported-host")
    const limits = checked(input)
    if (!limits) return denied("read-sandbox-input-invalid")
    const physical = yield* Effect.tryPromise({ try: () => inspect(input), catch: () => false })
    if (!physical) return denied("read-sandbox-input-invalid")
    // Status only: provisioning belongs to explicit host preparation, never this execution path.
    const runtime = yield* ToolSafetySandboxRuntime.resolve(false)
    if (runtime.reason !== undefined || !(yield* ToolSafetySandboxRuntime.seccomp(runtime.directory))) return denied("read-sandbox-unavailable")
    const home = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => mkdtemp(path.join(tmpdir(), "orchestra-local-read-")).then((made) => realpath(made)), catch: () => "read-sandbox-home-unavailable" }),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    )
    const wrapped = yield* ToolSafetySandbox.wrap(ChildProcess.make(input.executable, input.args, {
      cwd: input.root, shell: false, extendEnv: false,
      env: { PATH: "/usr/bin:/bin", HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
        XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, TMPDIR: home, TMP: home, TEMP: home,
        LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NO_COLOR: "1", TERM: "dumb", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    })).pipe(
      Effect.provideService(ToolSafety.NativeContext, { directory: input.root }),
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: [],
        sandbox: { enabled: true, scratch: true, readRoots: [input.root, input.executable, home], unconfinedFallback: false } }),
    )
    const prefix = process.versions.bun ? ["--no-env-file", "--config=/dev/null", ToolSafetySandboxRuntime.cli(runtime.directory)] : [ToolSafetySandboxRuntime.cli(runtime.directory)]
    // wrap may prefer a PATH srt. It cannot qualify this lane; never execute an unverified launcher or ordinary fallback.
    if (wrapped._tag !== "StandardCommand" || wrapped.command !== process.execPath || prefix.some((arg, index) => wrapped.args[index] !== arg)) return denied("read-sandbox-unverified-launcher")
    return { outcome: yield* execute({ command: wrapped.command, args: wrapped.args, cwd: input.root,
      env: Object.fromEntries(Object.entries(wrapped.options.env ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      ...limits }) }
  })).pipe(Effect.catch(() => Effect.succeed(denied("read-sandbox-unavailable"))))
}

function checked(input: Input) {
  if (!path.isAbsolute(input.root) || !path.isAbsolute(input.executable) || /\0/.test(input.root + input.executable) ||
    !Array.isArray(input.args) || input.args.length > 10_000 || input.args.some((arg) => typeof arg !== "string" || arg.includes("\0")) ||
    input.args.reduce((bytes, arg) => bytes + Buffer.byteLength(arg) + 1, 0) > 1024 * 1024) return
  const limits = { timeoutMs: input.limits?.timeoutMs ?? LIMITS.timeoutMs, maxBytes: input.limits?.maxBytes ?? LIMITS.maxBytes, maxRssBytes: input.limits?.maxRssBytes ?? LIMITS.maxRssBytes }
  if (Object.entries(limits).some(([key, value]) => !Number.isSafeInteger(value) || value < 1 || value > LIMITS[key as keyof Limits])) return
  return limits
}

async function inspect(input: Input) {
  const root = await lstat(input.root)
  const binary = await lstat(input.executable)
  if (!root.isDirectory() || root.isSymbolicLink() || !binary.isFile() || binary.isSymbolicLink()) return false
  if (await realpath(input.root) !== input.root || await realpath(input.executable) !== input.executable || FSUtil.contains(input.root, input.executable)) return false
  return !FSUtil.contains(input.root, await realpath(tmpdir()))
}

function denied(reason: string): Result {
  return { denied: reason }
}
