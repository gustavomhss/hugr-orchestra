// What the legacy (cross-spawn) and the omni Effect spawners share: flattening a piped command, turning a failure into
// a PlatformError that names the command, and reading the stdio options. No process is started from here.

import type * as Arr from "effect/Array"
import * as Duration from "effect/Duration"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import * as PlatformError from "effect/PlatformError"
import type * as ChildProcess from "effect/unstable/process/ChildProcess"

export const toError = (err: unknown): Error =>
  err instanceof globalThis.Error ? err : new globalThis.Error(String(err))

export const toTag = (err: NodeJS.ErrnoException): PlatformError.SystemErrorTag => {
  switch (err.code) {
    case "ENOENT":
      return "NotFound"
    case "EACCES":
      return "PermissionDenied"
    case "EEXIST":
      return "AlreadyExists"
    case "EISDIR":
      return "BadResource"
    case "ENOTDIR":
      return "BadResource"
    case "EBUSY":
      return "Busy"
    case "ELOOP":
      return "BadResource"
    default:
      return "Unknown"
  }
}

export const flatten = (command: ChildProcess.Command) => {
  const commands: Array<ChildProcess.StandardCommand> = []
  const opts: Array<ChildProcess.PipeOptions> = []

  const walk = (cmd: ChildProcess.Command): void => {
    switch (cmd._tag) {
      case "StandardCommand":
        commands.push(cmd)
        return
      case "PipedCommand":
        walk(cmd.left)
        opts.push(cmd.options)
        walk(cmd.right)
        return
    }
  }

  walk(command)
  if (commands.length === 0) throw new Error("flatten produced empty commands array")
  const [head, ...tail] = commands
  return {
    commands: [head, ...tail] as Arr.NonEmptyReadonlyArray<ChildProcess.StandardCommand>,
    opts,
  }
}

/** The command as one line, the way PlatformError.pathOrDescriptor shows it: `a x | b y`. */
export const describe = (command: ChildProcess.Command) =>
  flatten(command)
    .commands.map((x) => `${x.command} ${x.args.join(" ")}`)
    .join(" | ")

export const toPlatformError = (
  method: string,
  err: NodeJS.ErrnoException,
  command: ChildProcess.Command,
  tag: PlatformError.SystemErrorTag = toTag(err),
): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: tag,
    module: "ChildProcess",
    method,
    pathOrDescriptor: describe(command),
    syscall: err.syscall,
    cause: err,
  })

/** The plain shape of a stdio option: "pipe" (also for "overlapped"), "inherit", "ignore", "stream" or "sink". */
export function kind(cfg: unknown): string {
  if (cfg === undefined) return "pipe"
  if (cfg === "overlapped") return "pipe"
  if (typeof cfg === "string") return cfg
  if (Stream.isStream(cfg)) return "stream"
  if (Sink.isSink(cfg)) return "sink"
  if (typeof cfg === "object" && cfg !== null && "stream" in cfg) return kind(cfg.stream)
  return "pipe"
}

export function stdinConfig(opts: ChildProcess.CommandOptions): {
  stream: ChildProcess.CommandInput
  endOnDone?: boolean
} {
  if (opts.stdin === undefined) return { stream: "pipe" }
  if (typeof opts.stdin === "string" || Stream.isStream(opts.stdin)) return { stream: opts.stdin }
  return { stream: opts.stdin.stream, endOnDone: opts.stdin.endOnDone }
}

export function transduce(
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
  cfg: ChildProcess.CommandOptions["stdout"],
) {
  const sink = Sink.isSink(cfg)
    ? cfg
    : cfg && typeof cfg === "object" && Sink.isSink(cfg.stream)
      ? cfg.stream
      : undefined
  return sink ? Stream.transduce(stream, sink) : stream
}

export function millis(input: Duration.Input | undefined) {
  return input === undefined ? undefined : Duration.toMillis(input)
}

export * as ChildProcessCommon from "./child-process-common"
