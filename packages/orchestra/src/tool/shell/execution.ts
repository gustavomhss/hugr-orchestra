export * as ShellExecution from "./execution"

import { Effect, Exit, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetyGit } from "@orchestra/core/tool-safety-git"
import { AppProcess } from "@orchestra/core/process"
import { OmniSpawner } from "@orchestra/core/omni-spawner"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Shell } from "@orchestra/core/shell"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { InstanceState } from "@/effect/instance-state"
import { BackgroundProcess } from "@/background/process"
import { Seats, type Seat } from "@/maestro/seats"
import { nativeProfiles } from "@/maestro/roster"
import type { InstanceContext } from "@/project/instance-context"
import type { Tool } from "@/tool/tool"
import { ShellScan } from "./scan"
import { TRUNCATION_DIR } from "@/tool/truncation-dir"
import path from "path"

type Input = { shell: string; command: string; cwd: string; env: NodeJS.ProcessEnv; prepareParents: boolean }

function command(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  if (process.platform === "win32" && Shell.ps(shell)) {
    return ChildProcess.make(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd,
      env,
      stdin: "ignore",
      detached: false,
    })
  }

  return ChildProcess.make(command, [], {
    shell,
    cwd,
    env,
    stdin: "ignore",
    detached: process.platform !== "win32",
  })
}
/**
 * A native seat cannot ask the owner, so on macOS and Linux its commands run in the OS sandbox with reads confined to its
 * worktree (and the git directories a linked worktree keeps outside it), saved tool output, the external directories its
 * native profile grants, the backend toolkit for the toolkit seat, and the host toolchain (ToolSafetySandbox.toolchain).
 * A host without a sandbox refuses the command. Maestro and other agents keep argument checks and asks only; Windows has
 * no read sandbox, so seats there keep only the argument checks (ShellScan).
 */
const seatProfile = Effect.fn("ShellTool.seatProfile")(function* (
  fs: FSUtil.Interface,
  profile: ToolSafety.Profile | undefined,
  seat: Seat,
  instance: InstanceContext,
) {
  const worktree = instance.worktree === "/" ? instance.directory : instance.worktree
  const external = nativeProfiles[seat.id]?.external_directory
  const granted =
    typeof external === "object"
      ? Object.entries(external)
          .filter((rule) => rule[1] === "allow" && rule[0] !== "*")
          .map((rule) => rule[0].replace(/[\\/]\*$/, ""))
      : []
  // A linked worktree's `.git` file names its git directory, whose `commondir` names the repository's shared one.
  const text = (file: string) => fs.readFileStringSafe(file).pipe(Effect.catch(() => Effect.succeed(undefined)))
  const gitdir = (yield* text(path.join(worktree, ".git")))?.match(/^gitdir: (.+)$/m)?.[1].trim()
  const gitdirs = gitdir ? [path.resolve(worktree, gitdir)] : []
  const common = gitdirs.length ? (yield* text(path.join(gitdirs[0], "commondir")))?.trim() : undefined
  return {
    ...profile,
    requireSandbox: true,
    writeRoots: profile?.writeRoots ?? [worktree],
    sandbox: {
      ...profile?.sandbox,
      enabled: true,
      scratch: true,
      readRoots: [
        worktree,
        instance.directory,
        ...gitdirs,
        ...(common ? [path.resolve(gitdirs[0], common)] : []),
        TRUNCATION_DIR,
        ...granted,
        ...(seat.toolkit ? [yield* BackendToolkit.Root] : []),
      ],
    },
  } satisfies ToolSafety.Profile
})

/** The shell execution boundary, also used when the host gate prepares a process start. */
export const wrap = Effect.fn("ShellExecution.wrap")(function* (fs: FSUtil.Interface, input: Input, ctx: Tool.Context) {
  const profile = yield* ToolSafety.RuntimeProfile
  const instance = yield* InstanceState.context
  const seat = Seats.find(ctx.agentID)
  const sandboxed =
    seat && (process.platform === "darwin" || process.platform === "linux")
      ? yield* seatProfile(fs, profile, seat, instance)
      : profile
  const env = ToolSafetySandbox.environment(input.env)
  yield* ToolSafetyGit.before({
    command: input.command,
    directory: instance.directory,
    projectDirectory: instance.worktree === "/" ? instance.directory : instance.worktree,
    cwd: input.cwd,
    env,
    managedPaths: profile?.managedPaths,
    neverTouch: profile?.neverTouch,
  }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provide(LayerNode.compile(AppProcess.node)), Effect.orDie)
  return yield* ToolSafetySandbox.wrap(command(input.shell, input.command, input.cwd, env), {
    prepareParents: input.prepareParents,
  }).pipe(
    Effect.provideService(FSUtil.Service, fs),
    Effect.provideService(ToolSafety.NativeContext, { directory: instance.directory, projectID: instance.project.id }),
    Effect.provideService(ToolSafety.RuntimeProfile, sandboxed),
  )
})

type Prepared = {
  command: string
  originalCommand: string
  prepareParents: boolean
  cwd: string
  agentID?: string
  wrapped: ChildProcess.Command
  resources: Scope.Closeable
  onTake: () => void
}
const prepared = new Map<string, Prepared>()
const key = (ctx: Tool.Context) => `${ctx.sessionID}/${ctx.callID}`

function preparedFor(ctx: Tool.Context, input: Pick<Input, "command" | "cwd">) {
  const lease = ctx.callID ? prepared.get(key(ctx)) : undefined
  if (lease && (lease.command !== input.command || lease.cwd !== input.cwd || lease.agentID !== ctx.agentID))
    throw new Error("Shell execution handoff does not match this call")
  return lease
}

/** Approve the requested command, never the jail launcher; a trusted handoff carries its prior approval. */
export const approve = Effect.fn("ShellExecution.approve")(function* (
  fs: FSUtil.Interface,
  spawner: ChildProcessSpawner["Service"],
  input: Pick<Input, "shell" | "command" | "cwd">,
  ctx: Tool.Context,
) {
  const lease = preparedFor(ctx, input)
  if (lease) return { command: lease.originalCommand, prepareParents: lease.prepareParents }
  const prepareParents = yield* ShellScan.approve(ctx, input).pipe(
    Effect.provideService(FSUtil.Service, fs),
    Effect.provideService(ChildProcessSpawner, spawner),
  )
  return { command: input.command, prepareParents }
})

/** A trusted gate may transfer its already wrapped command; model input alone can never bypass wrapping. */
export const handoff = Effect.fn("ShellExecution.handoff")(function* (ctx: Tool.Context, lease: Prepared) {
  if (!ctx.callID || prepared.has(key(ctx))) return yield* Effect.die(new Error("Duplicate shell execution handoff"))
  prepared.set(key(ctx), lease)
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      if (prepared.get(key(ctx)) === lease) prepared.delete(key(ctx))
    }),
  ).pipe(Scope.provide(lease.resources))
})

/** The foreground scope transfers sandbox resources to the adopted tree, or closes them after child release. */
export const spawn = Effect.fn("ShellExecution.spawn")(function* (
  fs: FSUtil.Interface,
  spawner: ChildProcessSpawner["Service"],
  adoptable: BackgroundProcess.Interface["adoptable"],
  input: Input,
  ctx: Tool.Context,
) {
  const lease = preparedFor(ctx, input)
  const resources = lease?.resources ?? (yield* Scope.make())
  const ownership = { retained: false }
  // Registered before spawn: child release transfers ownership before foreground cleanup runs.
  yield* Effect.addFinalizer(() => (ownership.retained ? Effect.void : Scope.close(resources, Exit.void)))
  if (lease) {
    prepared.delete(key(ctx))
    lease.onTake()
  }
  const wrapped = lease?.wrapped ?? (yield* wrap(fs, input, ctx).pipe(Scope.provide(resources)))
  return yield* spawner.spawn(wrapped).pipe(
    Effect.provideService(OmniSpawner.GapPolicy, "marker"),
    adoptable(ctx.sessionID, {
      onAdopt: Effect.sync(() => {
        ownership.retained = true
      }),
      finalize: Scope.close(resources, Exit.void),
    }),
  )
})
