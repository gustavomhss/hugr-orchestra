export * as OmniSpawner from "./omni-spawner"

// The Effect ChildProcessSpawner over hugr-omni (integration plan WP1: D-L1, D-L3..D-L6, D-L12, R2-1..R2-4, R2-17).
// cross-spawn-spawner.ts builds it when OPENCODE_EXPERIMENTAL_OMNI_SPAWNER is 1 or strict and hands it the legacy
// spawn function for what omni does not support: `1` delegates, `strict` refuses (cmd.exe always delegates, D-L4).
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
// pump then keeps draining and discards, so a descendant that holds the pipe never blocks. Kill and the scope
// release stop the tree with `forceKillAfter ?? 2000` (bounded); the release adopts through OmniAdoption.release.

import { Cause, Context, Deferred, Duration, Effect, Exit, Sink, Stream } from "effect"
import type * as Arr from "effect/Array"
import * as PlatformError from "effect/PlatformError"
import type * as Scope from "effect/Scope"
import type * as ChildProcess from "effect/unstable/process/ChildProcess"
import { ExitCode, makeHandle, ProcessId, type ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import path from "node:path"
import { describe, kind, millis, stdinConfig, toError, toPlatformError, transduce } from "./child-process-common"
import { Omni } from "./omni"
import { OmniAdoption } from "./omni-adoption"
import { Shell } from "./shell"

/** After the root exits, how long descendants may hold the output open before the host streams end (D-L6). */
export const DRAIN_GRACE_MS = 2_000
/** How long a stopped tree gets to wind down when `forceKillAfter` is not set (D-L6). */
export const STOP_GRACE_MS = 2_000
/** Host-side bytes per stream nobody took yet; above it the pump stops pulling and omni's backpressure takes over. */
const HIGH_WATER = 8 * 1024 * 1024

/**
 * What a reader gets at a gap in a pipe stream. `fail` (default): the stream fails with a PlatformError. `marker`: a
 * visible line saying how many bytes were lost, then the stream goes on (the shell tool, R2-2). With backpressure a
 * gap cannot happen; this is the second line of defence. Read at spawn.
 */
export const GapPolicy = Context.Reference<"fail" | "marker">("@opencode/OmniSpawner/GapPolicy", {
  defaultValue: () => "fail",
})

export type Binding = Awaited<ReturnType<typeof Omni.load>>
type Spawn = (
  command: ChildProcess.Command,
) => Effect.Effect<ChildProcessHandle, PlatformError.PlatformError, Scope.Scope>
type Kind = "stdout" | "stderr"
type Item = { stream: "stdout" | "stderr" | "pty"; data: Uint8Array; lostBefore?: number }

/** The one delegation `strict` still allows (D-L4): cmd.exe quoting differs, so it stays on legacy until WP8b. */
const CMD = "a cmd.exe shell"

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
    if (input.mode === "strict" && reason !== CMD)
      return yield* PlatformError.badArgument({
        module: "ChildProcess",
        method: "spawn",
        description: `OPENCODE_EXPERIMENTAL_OMNI_SPAWNER=strict runs ${reason} nowhere: omni does not support it and strict never delegates to legacy (${describe(command)})`,
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
  if (opts.shell && program(command) === undefined) return CMD
  const inherited = (["stdin", "stdout", "stderr"] as const).find((key) => kind(opts[key]) === "inherit")
  if (inherited) return `${inherited}: "inherit"`
  if (opts.additionalFds && Object.keys(opts.additionalFds).length > 0) return "additionalFds"
  if (opts.killSignal !== undefined && opts.killSignal !== "SIGTERM") return `killSignal ${opts.killSignal}`
  return undefined
}

/** The program omni runs: the command itself, or `shell: true | string` made explicit by Shell.invocation (D-L4). */
export function program(command: ChildProcess.StandardCommand) {
  const shell = command.options.shell
  if (!shell) return { file: command.command, args: [...command.args] }
  return Shell.invocation(shell, command.command, command.args)
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
  if (!run) return yield* Effect.die(new Error("omni-spawner: start() reached a command it does not support"))
  const policy = yield* GapPolicy
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
        output.close()
        const adoption = yield* Effect.serviceOption(OmniAdoption.Service)
        if (Exit.isSuccess(result) && adoption._tag === "Some" && adoption.value.policy === "tool")
          yield* Effect.logInfo("omni adoption", { event: "omni.adoption", pid: child.pid, command: describe(command) })
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
      Effect.tryPromise({
        try: () => child.stop({ graceMs: millis(options?.forceKillAfter) ?? STOP_GRACE_MS }),
        catch: (err) => fromOmni("kill", err, command),
      }).pipe(Effect.andThen(Effect.sync(() => output.halt())), Effect.andThen(Deferred.await(exit)), Effect.asVoid),
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
 * The host side of one child's output: the pump, the two queues, the readers and the drain grace. Plain JS, driven
 * by omni's promises; readers wait on it through Effect callbacks.
 */
function drain(
  source: AsyncIterator<Item>,
  input: {
    policy: "fail" | "marker"
    ignored: Record<Kind, boolean>
    gap: (stream: Kind, bytes: number) => void
    ended: () => void
  },
) {
  let seq = 0
  let ended = false
  let discard = false
  let halted = false
  let paused: (() => void) | undefined
  let graceDue = false
  let grace: ReturnType<typeof setTimeout> | undefined
  const queues = {
    stdout: { items: [] as { seq: number; data: Uint8Array }[], bytes: 0 },
    stderr: { items: [] as { seq: number; data: Uint8Array }[], bytes: 0 },
  }
  const failed: Partial<Record<Kind, PlatformError.PlatformError>> = {}
  const subscribed = { stdout: false, stderr: false }
  const waiters = new Set<() => void>()
  const wake = () => [...waiters].forEach((waiter) => waiter())
  const full = () => (["stdout", "stderr"] as const).filter((key) => queues[key].bytes >= HIGH_WATER)

  void (async () => {
    try {
      for (;;) {
        if (!discard && full().length > 0) {
          if (halted) expire(true)
          else await new Promise<void>((resume) => (paused = resume))
        }
        const next = await source.next()
        if (next.done) break
        push(next.value)
      }
    } catch (err) {
      const error = systemError("Unknown", "output", `reading the output failed: ${toError(err).message}`, err)
      for (const key of ["stdout", "stderr"] as const) failed[key] ??= error
    }
    finish()
  })()

  function push(item: Item) {
    if (discard) return
    const key: Kind = item.stream === "stderr" ? "stderr" : "stdout"
    if (input.ignored[key] || failed[key]) return
    if (item.lostBefore) {
      input.gap(key, item.lostBefore)
      if (input.policy === "fail") {
        failed[key] = systemError("InvalidData", `fromOmni(${key})`, `${item.lostBefore} bytes of ${key} were lost`)
        return wake()
      }
      enqueue(key, new TextEncoder().encode(`\n[omni: ${item.lostBefore} bytes of ${key} were lost here]\n`))
    }
    if (item.data.length > 0) enqueue(key, item.data)
    wake()
  }

  function enqueue(key: Kind, data: Uint8Array) {
    queues[key].items.push({ seq: seq++, data })
    queues[key].bytes += data.length
  }

  function finish() {
    if (ended) return
    ended = true
    clearTimeout(grace)
    discard = true
    wake()
    input.ended()
  }

  // The grace ran out: the host streams end. A queue the pump had stopped for still had data in omni, so that
  // stream fails rather than end short. A slow reader that subscribed postpones the grace until it catches up.
  function expire(force: boolean) {
    if (ended) return
    if (!force && paused && full().every((key) => subscribed[key])) {
      graceDue = true
      return
    }
    // A stalled pump left output in omni that no reader will get: every stream fails instead of ending short.
    if (paused || force)
      for (const key of ["stdout", "stderr"] as const)
        failed[key] ??= systemError(
          "BadResource",
          `fromOmni(${key})`,
          `${key} was not read before the drain grace ended`,
        )
    resume()
    finish()
  }

  function resume() {
    const wakeup = paused
    paused = undefined
    wakeup?.()
    if (graceDue) {
      graceDue = false
      arm()
    }
  }

  function arm() {
    clearTimeout(grace)
    if (!ended) grace = setTimeout(() => expire(false), DRAIN_GRACE_MS)
  }

  function take(kinds: readonly Kind[]) {
    const lists = kinds.map((key) => queues[key].items)
    const batch =
      lists.length === 1
        ? (lists[0] ?? []).map((item) => item.data)
        : [...(lists[0] ?? []), ...(lists[1] ?? [])].toSorted((a, b) => a.seq - b.seq).map((item) => item.data)
    for (const key of kinds) queues[key] = { items: [], bytes: 0 }
    if (paused && full().length === 0) resume()
    return batch
  }

  const pull = (kinds: readonly Kind[]) =>
    Effect.callback<Arr.NonEmptyReadonlyArray<Uint8Array>, PlatformError.PlatformError | Cause.Done>((done) => {
      const attempt = () => {
        const [head, ...rest] = take(kinds)
        const error = kinds.map((key) => failed[key]).find((x) => x !== undefined)
        const result =
          head !== undefined
            ? Effect.succeed<Arr.NonEmptyReadonlyArray<Uint8Array>>([head, ...rest])
            : error
              ? Effect.fail(error)
              : ended
                ? Cause.done()
                : undefined
        if (result) done(result)
        return result !== undefined
      }
      if (attempt()) return undefined
      const waiter = () => {
        if (attempt()) waiters.delete(waiter)
      }
      waiters.add(waiter)
      return Effect.sync(() => waiters.delete(waiter))
    })

  return {
    stream: (kinds: readonly Kind[]): Stream.Stream<Uint8Array, PlatformError.PlatformError> =>
      Stream.fromPull(
        Effect.sync(() => {
          for (const key of kinds) subscribed[key] = true
          return pull(kinds)
        }),
      ),
    rootExited: () => arm(),
    /** The tree was stopped: nothing will read faster any more, so a stalled pump ends the streams now. */
    halt: () => {
      halted = true
      if (paused) expire(true)
    },
    /** The spawn scope closed: readers are gone; the pump discards from now on and never blocks the child. */
    close: () => {
      resume()
      finish()
    },
  }
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

function systemError(tag: PlatformError.SystemErrorTag, method: string, description: string, cause?: unknown) {
  return PlatformError.systemError({ _tag: tag, module: "ChildProcess", method, description, cause })
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
  if (!run) return yield* Effect.die(new Error("omni-spawner: collect() reached a command it does not support"))
  Omni.count("spawns")
  yield* Effect.logDebug("omni spawn", { event: "omni.spawn", collect: true, command: describe(command) })
  const signal = options.signal
  const result = yield* Effect.tryPromise({
    try: (interrupt) =>
      omni.run(run.file, run.args, {
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
