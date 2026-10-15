// How the legacy (cross-spawn) spawner reads a command: its stdin/stdout/stderr options, its extra file descriptors,
// and a pipeTo chain unrolled into one spawn per stage. Pure Effect; cross-spawn-spawner.ts does the spawning.

import * as Effect from "effect/Effect"
import type * as PlatformError from "effect/PlatformError"
import * as Predicate from "effect/Predicate"
import type * as Scope from "effect/Scope"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import type { ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import { flatten } from "./child-process-common"

type SpawnCommand = (
  command: ChildProcess.Command,
) => Effect.Effect<ChildProcessHandle, PlatformError.PlatformError, Scope.Scope>

export const stdin = (opts: ChildProcess.CommandOptions): ChildProcess.StdinConfig => {
  const cfg: ChildProcess.StdinConfig = { stream: "pipe", encoding: "utf-8", endOnDone: true }
  if (Predicate.isUndefined(opts.stdin)) return cfg
  if (typeof opts.stdin === "string") return { ...cfg, stream: opts.stdin }
  if (Stream.isStream(opts.stdin)) return { ...cfg, stream: opts.stdin }
  return {
    stream: opts.stdin.stream,
    encoding: opts.stdin.encoding ?? cfg.encoding,
    endOnDone: opts.stdin.endOnDone ?? cfg.endOnDone,
  }
}

export const stdio = (opts: ChildProcess.CommandOptions, key: "stdout" | "stderr"): ChildProcess.StdoutConfig => {
  const cfg = opts[key]
  if (Predicate.isUndefined(cfg)) return { stream: "pipe" }
  if (typeof cfg === "string") return { stream: cfg }
  if (Sink.isSink(cfg)) return { stream: cfg }
  return { stream: cfg.stream }
}

export const fds = (opts: ChildProcess.CommandOptions) => {
  if (Predicate.isUndefined(opts.additionalFds)) return []
  return Object.entries(opts.additionalFds)
    .flatMap(([name, config]) => {
      const fd = ChildProcess.parseFdName(name)
      return Predicate.isUndefined(fd) ? [] : [{ fd, config }]
    })
    .toSorted((a, b) => a.fd - b.fd)
}

const source = (handle: ChildProcessHandle, from: ChildProcess.PipeFromOption | undefined) => {
  const opt = from ?? "stdout"
  switch (opt) {
    case "stdout":
      return handle.stdout
    case "stderr":
      return handle.stderr
    case "all":
      return handle.all
    default: {
      const fd = ChildProcess.parseFdName(opt)
      return Predicate.isNotUndefined(fd) ? handle.getOutputFd(fd) : handle.stdout
    }
  }
}

/** A pipeTo chain as one handle: each stage reads the previous stage's chosen output on stdin or an extra fd. */
export const pipeline = (command: ChildProcess.PipedCommand, spawnCommand: SpawnCommand) => {
  const flat = flatten(command)
  const [head, ...tail] = flat.commands
  let handle = spawnCommand(head)
  for (let i = 0; i < tail.length; i++) {
    const next = tail[i]
    const opts = flat.opts[i] ?? {}
    const sin = stdin(next.options)
    const stream = Stream.unwrap(Effect.map(handle, (x) => source(x, opts.from)))
    const to = opts.to ?? "stdin"
    if (to === "stdin") {
      handle = spawnCommand(
        ChildProcess.make(next.command, next.args, {
          ...next.options,
          stdin: { ...sin, stream },
        }),
      )
      continue
    }
    const fd = ChildProcess.parseFdName(to)
    if (Predicate.isUndefined(fd)) {
      handle = spawnCommand(
        ChildProcess.make(next.command, next.args, {
          ...next.options,
          stdin: { ...sin, stream },
        }),
      )
      continue
    }
    handle = spawnCommand(
      ChildProcess.make(next.command, next.args, {
        ...next.options,
        additionalFds: {
          ...next.options.additionalFds,
          [ChildProcess.fdName(fd) as `fd${number}`]: { type: "input", stream },
        },
      }),
    )
  }
  return handle
}
