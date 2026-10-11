export * as OmniSpawner from "./omni-spawner"

// The Effect ChildProcessSpawner over hugr-omni (integration plan WP1: D-L1, D-L3..D-L6, D-L12, R2-1..R2-4, R2-17).
// cross-spawn-spawner.ts builds it when ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER is 1 or strict and hands it the legacy
// spawn function for what omni does not support: `1` delegates, `strict` refuses. A cmd.exe
// shell runs through omni too, with Node's verbatim command line (WP8b).
//
// Output (D-L5, R2-1). Every child is spawned with `backpressure: true` and its single omni consumer is claimed at
// spawn, so omni never drops. One pump per child moves omni's items into two host queues (stdout, stderr) and stops
// pulling while a queue holds HIGH_WATER bytes nobody took: the omni queue fills, then the child blocks on its writes,
// as with a legacy pipe nobody reads. A stream subscribed late replays from those queues; `all` merges both in the
// pump's order. A gap (`lostBefore`) fails the stream with a PlatformError, or, under GapPolicy "marker", becomes a
// visible marker line. Effect callers never get gapped bytes.
//
// Completion (D-L6). `exitCode` resolves when the root exited and the output ended, or DRAIN_GRACE after the root
// exited; then the host streams end (a stream whose data was still unread in omni fails instead of ending short). The
// pump then keeps draining, so a descendant that holds the pipe never blocks: into the background registry's ring
// when the tree may still be adopted (OmniAdoption with policy "tool", R2-4), otherwise it discards. Kill and the scope
// release stop the tree with `forceKillAfter ?? 2000` (bounded); the release adopts through OmniAdoption.release.

import { Context, Deferred, Duration, Effect, Exit, Sink, Stream } from "effect"
import * as PlatformError from "effect/PlatformError"
import type * as Scope from "effect/Scope"
import type * as ChildProcess from "effect/unstable/process/ChildProcess"
import { ExitCode, makeHandle, ProcessId, type ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import path from "node:path"
import { describe, kind, millis, stdinConfig, toError, toPlatformError, transduce } from "./child-process-common"
import { Omni } from "./omni"
import { OmniAdoption } from "./omni-adoption"
import { OmniBackground } from "./omni-background"
import { drain } from "./omni-output"
import { Shell } from "./shell"

// The output pump and the drain grace live in omni-output.ts.
export { DRAIN_GRACE_MS } from "./omni-output"
/** How long a stopped tree gets to wind down when `forceKillAfter` is not set (D-L6). */
export const STOP_GRACE_MS = 2_000

/**
 * What a reader gets at a gap in a pipe stream. `fail` (default): the stream fails with a PlatformError. `marker`: a
 * visible line saying how many bytes were lost, then the stream goes on (the shell tool, R2-2). With backpressure a
 * gap cannot happen; this is the second line of defence. Read at spawn.
 */
export const GapPolicy = Context.Reference<"fail" | "marker">("@orchestra/OmniSpawner/GapPolicy", {
  defaultValue: () => "fail",
})

export type Binding = Awaited<ReturnType<typeof Omni.load>>
type Spawn = (
  command: ChildProcess.Command,
) => Effect.Effect<ChildProcessHandle, PlatformError.PlatformError, Scope.Scope>

/**
 * Builds the omni spawn function. Loads hugr-omni now and fails loudly (a defect) when the addon or the supervisor is
 * missing: a caller that asked for omni never falls back silently (D-L2).
 */
export const make = Effect.fnUntraced(function* (input: {
  mode: "on" | "strict"
  legacy: Spawn
  cwd: (opts: ChildProcess.CommandOptions) => Effect.Effect<string | undefined, PlatformError.PlatformError>
}) {
  const omni = yield* Effect.promise(() => Omni.load())
  const spawn: Spawn = Effect.fnUntraced(function* (command) {
    const reason = unsupported(command)
    if (reason === undefined && command._tag === "StandardCommand")
      return yield* start(omni, command, yield* input.cwd(command.options))
    if (input.mode === "strict")
      return yield* PlatformError.badArgument({
        module: "ChildProcess",
        method: "spawn",
        description: `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict runs ${reason} nowhere: omni does not support it and strict never delegates to legacy (${describe(command)})`,
      })
    Omni.count("delegations")
    yield* Effect.logDebug("omni delegation", { event: "omni.delegation", reason, command: describe(command) })
    return yield* input.legacy(command)
  })
  return spawn
})

/** Why omni cannot run this command as asked, or undefined when it can. */
export function unsupported(command: ChildProcess.Command) {
  if (command._tag === "PipedCommand") return "a piped command (pipeTo)"
  const opts = command.options
  const inherited = (["stdin", "stdout", "stderr"] as const).find((key) => kind(opts[key]) === "inherit")
  if (inherited) return `${inherited}: "inherit"`
  if (opts.additionalFds && Object.keys(opts.additionalFds).length > 0) return "additionalFds"
  if (opts.killSignal !== undefined && opts.killSignal !== "SIGTERM") return `killSignal ${opts.killSignal}`
  return undefined
}

/**
 * The program omni runs: the command itself, or `shell: true | string` made explicit by Shell.invocation (D-L4).
 * cmd.exe (where Shell.invocation gives undefined) parses its own command line, so it gets ComSpec with no arguments
 * and the tail Node builds, `/d /s /c "<joined>"`, verbatim (WP8b).
 */
export function program(command: ChildProcess.StandardCommand): { file: string; args: string[]; verbatim?: string } {
  const shell = command.options.shell
  if (!shell) return { file: command.command, args: [...command.args] }
  const explicit = Shell.invocation(shell, command.command, command.args)
  if (explicit) return explicit
  const file = shell === true ? (process.env.ComSpec ?? "cmd.exe") : shell
  return { file, args: [], verbatim: `/d /s /c "${[command.command, ...command.args].join(" ")}"` }
}

/**
 * The child's environment, always passed with inheritEnv:false (D-L3): process.env under `env` when the command
 * inherits (extendEnv, or no env at all, as Node does), otherwise `env` alone. HUGR_OMNI_* never reaches a child.
 */
export function environment(opts: ChildProcess.CommandOptions) {
  if (opts.extendEnv || opts.env === undefined) return Omni.childEnv(opts.env)
  return Object.fromEntries(
    Object.entries(opts.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !entry[0].toUpperCase().startsWith("HUGR_OMNI_"),
    ),
  )
}

const start = Effect.fnUntraced(function* (
  omni: Binding,
  command: ChildProcess.StandardCommand,
  cwd: string | undefined,
) {
  const opts = command.options
  const run = program(command)
  const policy = yield* GapPolicy
  const adoptable = yield* Effect.serviceOption(OmniAdoption.Service)
  const context = yield* Effect.context()
  const stdinCfg = stdinConfig(opts)
  const graceMs = millis(opts.forceKillAfter) ?? STOP_GRACE_MS
  const exit = Deferred.makeUnsafe<readonly [number | null, string | null], PlatformError.PlatformError>()
  const log = (effect: Effect.Effect<void>) => void Effect.runForkWith(context)(effect)
  // Set from omni's promises, which may settle before this generator resumes.
  const state: { root?: { exitCode: number | null; signal: string | null }; ended: boolean } = { ended: false }
  const settle = () => {
    if (state.root && state.ended)
      Deferred.doneUnsafe(exit, Exit.succeed([state.root.exitCode, state.root.signal] as const))
  }

  const [child, output] = yield* Effect.acquireRelease(
    Effect.try({
      try: () => {
        const child = omni.spawn(run.file, run.args, {
          windowsVerbatimArgs: run.verbatim,
          cwd,
          env: environment(opts),
          inheritEnv: false,
          text: false,
          backpressure: true,
          stdin: kind(stdinCfg.stream) === "ignore" ? "closed" : "pipe",
        })
        // Claimed now, synchronously, so no output is ever kept under omni's no-consumer budget.
        const output = drain(child.output[Symbol.asyncIterator](), {
          policy,
          overflow:
            adoptable._tag === "Some" && adoptable.value.policy === "tool"
              ? () => OmniBackground.sink(child)
              : undefined,
          ignored: { stdout: kind(opts.stdout) === "ignore", stderr: kind(opts.stderr) === "ignore" },
          gap: (stream, bytes) =>
            log(
              Effect.logWarning("omni gap", { event: "omni.gap", stream, bytes, policy, command: describe(command) }),
            ),
          ended: () => {
            state.ended = true
            settle()
          },
        })
        return [child, output] as const
      },
      catch: (err) => fromOmni("spawn", err, command),
    }),
    ([child, output], result) =>
      Effect.gen(function* () {
        const adoption = yield* Effect.serviceOption(OmniAdoption.Service)
        const adopting = Exit.isSuccess(result) && adoption._tag === "Some" && adoption.value.policy === "tool"
        output.close(adopting)
        if (adopting)
          yield* Effect.logInfo("omni adoption", { event: "omni.adoption", pid: child.pid, command: describe(command) })
        // Not adopted: stop here with the Effect-clock escalation; release()'s own stop is then a no-op.
        else yield* Effect.ignore(stop(child, opts.forceKillAfter, command))
        yield* OmniAdoption.release(child, result, { title: describe(command), graceMs })
      }).pipe(Effect.provide(context)),
  )
  Omni.count("spawns")
  yield* Effect.logDebug("omni spawn", { event: "omni.spawn", pid: child.pid, command: describe(command) })

  child.wait().then(
    (status) => {
      state.root = status
      output.rootExited()
      settle()
    },
    (err: unknown) => Deferred.doneUnsafe(exit, Exit.fail(fromOmni("wait", err, command))),
  )

  const write = (chunk: Uint8Array) =>
    Effect.tryPromise({ try: () => child.write(chunk), catch: (err) => fromOmni("write(stdin)", err, command) })
  const stdin: Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError> =
    kind(stdinCfg.stream) === "ignore"
      ? Sink.drain
      : Sink.forEach(write).pipe(
          Sink.mapEffect(() =>
            stdinCfg.endOnDone === false
              ? Effect.void
              : Effect.tryPromise({
                  try: () => child.closeStdin(),
                  catch: (err) => fromOmni("end(stdin)", err, command),
                }),
          ),
        )
  if (Stream.isStream(stdinCfg.stream)) yield* Effect.forkScoped(Stream.run(stdinCfg.stream, stdin))

  return makeHandle({
    pid: ProcessId(child.pid),
    stdin,
    stdout: transduce(output.stream(["stdout"]), opts.stdout),
    stderr: transduce(output.stream(["stderr"]), opts.stderr),
    all: output.stream(["stdout", "stderr"]),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    isRunning: Effect.map(Deferred.isDone(exit), (done) => !done),
    exitCode: Effect.flatMap(Deferred.await(exit), ([code, signal]) => {
      if (code !== null) return Effect.succeed(ExitCode(code))
      return Effect.fail(
        toPlatformError("exitCode", new Error(`Process interrupted due to receipt of signal: '${signal}'`), command),
      )
    }),
    kill: (options?: ChildProcess.KillOptions) =>
      stop(child, options?.forceKillAfter, command).pipe(
        Effect.andThen(Effect.sync(() => output.halt())),
        Effect.andThen(Deferred.await(exit)),
        Effect.asVoid,
      ),
    unref: Effect.fail(
      PlatformError.badArgument({
        module: "ChildProcess",
        method: "unref",
        description: "the omni spawner has no unref(): its children hold the host until they exit",
      }),
    ),
  })
})

/**
 * Stops the tree. With `forceKillAfter`, omni gets it as the grace and an Effect sleep of the same length forces the
 * stop, like legacy's SIGKILL escalation, so a test clock drives it too. Bounded either way (D-L6).
 */
function stop(child: Omni.Child, after: Duration.Input | undefined, command: ChildProcess.Command) {
  const ask = (graceMs: number) =>
    Effect.tryPromise({ try: () => child.stop({ graceMs }), catch: (err) => fromOmni("kill", err, command) })
  if (after === undefined) return ask(STOP_GRACE_MS)
  return Effect.timeoutOrElse(ask(millis(after) ?? STOP_GRACE_MS), { duration: after, orElse: () => ask(0) })
}

/** OmniError code → PlatformError tag (plan WP1). */
function fromOmni(method: string, err: unknown, command: ChildProcess.Command) {
  const code = typeof err === "object" && err !== null && "code" in err ? String(err.code) : undefined
  const tag = (
    {
      NOT_FOUND: "NotFound",
      INVALID_CWD: "NotFound",
      NOT_EXECUTABLE: "PermissionDenied",
      CLOSED: "BadResource",
    } as Record<string, PlatformError.SystemErrorTag>
  )[code ?? ""]
  if (code === "INVALID_ARGUMENT")
    return PlatformError.badArgument({ module: "ChildProcess", method, description: toError(err).message, cause: err })
  return toPlatformError(method, toError(err), command, tag ?? "Unknown")
}

/**
 * AppProcess.run through omni's own collection (R2-1), for a command that needs neither streaming nor a cap: omni
 * collects in native code, so an event-loop stall cannot cost output. The caller checks collectable() first.
 */
export const collect = Effect.fnUntraced(function* (
  omni: Binding,
  command: ChildProcess.StandardCommand,
  options: {
    combineOutput?: boolean
    signal?: AbortSignal
    timeout?: Duration.Input
    stdin?: string | Uint8Array
  },
) {
  const run = program(command)
  Omni.count("spawns")
  yield* Effect.logDebug("omni spawn", { event: "omni.spawn", collect: true, command: describe(command) })
  const signal = options.signal
  const result = yield* Effect.tryPromise({
    try: (interrupt) =>
      omni.run(run.file, run.args, {
        windowsVerbatimArgs: run.verbatim,
        cwd: command.options.cwd === undefined ? undefined : path.resolve(command.options.cwd),
        env: environment(command.options),
        inheritEnv: false,
        text: false,
        input: options.stdin,
        mergeStderr: options.combineOutput,
        maxOutputBytes: Number.MAX_SAFE_INTEGER,
        timeoutMs: millis(options.timeout),
        signal: signal ? AbortSignal.any([interrupt, signal]) : interrupt,
      }),
    catch: (err) => fromOmni("run", err, command),
  })
  if (result.reason === "timeout") return yield* Effect.fail(new Error("Timed out"))
  if (result.exitCode === null)
    return yield* Effect.fail(
      toPlatformError(
        "exitCode",
        new Error(`Process interrupted due to receipt of signal: '${result.signal}'`),
        command,
      ),
    )
  return { exitCode: result.exitCode, stdout: Buffer.from(result.stdout), stderr: Buffer.from(result.stderr) }
})

/** Whether AppProcess.run can use collect(): a plain command with no cap, no inspect hook and no streamed stdin. */
export function collectable(
  command: ChildProcess.Command,
  options?: { inspect?: unknown; maxOutputBytes?: number; maxErrorBytes?: number; stdin?: unknown },
): command is ChildProcess.StandardCommand {
  if (command._tag !== "StandardCommand" || unsupported(command) !== undefined) return false
  if (options?.inspect || options?.maxOutputBytes !== undefined || options?.maxErrorBytes !== undefined) return false
  if (options?.stdin !== undefined && typeof options.stdin !== "string" && !(options.stdin instanceof Uint8Array))
    return false
  return (["stdin", "stdout", "stderr"] as const).every((key) => kind(command.options[key]) === "pipe")
}
