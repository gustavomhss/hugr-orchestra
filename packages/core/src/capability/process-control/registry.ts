export * as CapabilityProcessRegistry from "./registry"

import { Capability } from "@orchestra/schema/capability"
import { Cause, Clock, Context, Deferred, Effect, Exit, Layer, Option, Queue, Scope, Semaphore, Stream } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcess } from "effect/unstable/process"
import { makeGlobalNode } from "../../effect/app-node"
import { AppProcess } from "../../process"
import type { CapabilityProcessContract } from "./contract"
import { CapabilityProcessOutput } from "./output"

export class Service extends Context.Service<Service, CapabilityProcessContract.Registry>()("@orchestra/CapabilityProcessRegistry") {}

/** Trusted construction limits. Production uses the defaults through `layer`; only tests shrink them. */
export type Options = Readonly<{ capacity?: number; retainMs?: number; maxExited?: number; stopWaitMs?: number }>

type ExitInfo = typeof CapabilityProcessContract.Exit.Type
type Entry = { owner: Capability.Owner; exitedAt?: number; readonly live: CapabilityProcessContract.Live }

export const make = (options: Options = {}) => Effect.gen(function* () {
  const appProcess = yield* AppProcess.Service
  const registryScope = yield* Effect.scope
  const retainMs = options.retainMs ?? 30 * 60_000
  const maxExited = options.maxExited ?? 32
  const entries = new Map<Capability.JobID, Entry>()
  const startedAt = yield* Clock.currentTimeMillis

  // Exited entries stay readable for retainMs and at most maxExited of them are kept, oldest evicted first.
  const prune = Effect.map(Clock.currentTimeMillis, (now) => {
    const exited = [...entries]
      .flatMap(([id, entry]) => entry.exitedAt === undefined ? [] : [{ id, at: entry.exitedAt }])
      .toSorted((a, b) => a.at - b.at)
    exited.forEach((item, index) => {
      if (item.at + retainMs <= now || index < exited.length - maxExited) entries.delete(item.id)
    })
  })

  const start = (spec: CapabilityProcessContract.StartInput) => Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
    yield* prune
    if (entries.has(spec.ref.id)) return yield* denied()
    // The process Scope belongs to the registry, so the handle outlives the caller fiber.
    const scope = yield* Scope.fork(registryScope)
    const stdin = yield* Queue.unbounded<Uint8Array, Cause.Done>()
    const handle = yield* restore(spec.prepare(spec.command).pipe(
      Effect.flatMap((command) => Effect.gen(function* () {
        if (command._tag !== "StandardCommand") return yield* unsupported("Piped commands are not supported")
        return yield* appProcess.spawn(ChildProcess.make(command.command, command.args, {
          ...command.options, stdout: "pipe", stderr: "pipe", forceKillAfter: "2 seconds",
          stdin: { stream: Stream.fromQueue(stdin), endOnDone: true },
        }))
      })),
      Scope.provide(scope),
      Effect.tapCause((cause) => Effect.logWarning("process start failed", cause)),
      Effect.mapError((error) => error instanceof Capability.Failure
        ? error
        : new Capability.Failure({ code: "acquisition_failed", message: "Process could not be started" })),
    )).pipe(Effect.onExit((exit) => Exit.isSuccess(exit) ? Effect.void : Scope.close(scope, exit)))

    const lock = yield* Semaphore.make(1)
    const done = yield* Deferred.make<ExitInfo>()
    const output = CapabilityProcessOutput.make({ capacity: options.capacity ?? 1024 * 1024 })
    const state: { input: "open" | "closed"; exit?: ExitInfo; stopped: boolean } = { input: "open", stopped: false }
    const writable = Effect.suspend(() => state.input === "closed" || state.exit
      ? unsupported("Process input is closed")
      : Effect.void)
    const entry: Entry = {
      owner: spec.owner,
      live: {
        ref: spec.ref,
        owner: () => entry.owner,
        output,
        input: () => state.input,
        exit: () => state.exit,
        write: (bytes) => lock.withPermits(1)(writable.pipe(Effect.andThen(Queue.offer(stdin, bytes)), Effect.asVoid)),
        closeInput: () => lock.withPermits(1)(writable.pipe(
          Effect.andThen(Effect.sync(() => { state.input = "closed" })),
          Effect.andThen(Queue.end(stdin)),
          Effect.asVoid,
        )),
        stop: () => lock.withPermits(1)(Effect.gen(function* () {
          if (state.exit) return "local-stop" as const
          state.stopped = true
          // The kill keeps escalating in the process Scope even when this caller stops waiting.
          yield* Effect.forkIn(Effect.ignore(handle.kill({ forceKillAfter: "2 seconds" })), scope)
          const exited = yield* Deferred.await(done).pipe(Effect.timeoutOption(options.stopWaitMs ?? 5_000))
          return Option.isSome(exited) ? "local-stop" as const : "incomplete" as const
        })),
        exited: Deferred.await(done),
        transfer: (from, to) => lock.withPermits(1)(Effect.suspend(() => {
          if (!sameOwner(entry.owner, from)) return Effect.fail(denied())
          if (state.exit) return unsupported("Process is not running")
          entry.owner = to
          return Effect.void
        })),
      },
    }
    entries.set(spec.ref.id, entry)

    yield* Effect.gen(function* () {
      // handle.all merges stdout and stderr in arrival order.
      yield* Stream.runForEach(handle.all, (bytes) => Effect.sync(() => output.append(bytes))).pipe(
        Effect.catchCause((cause) => Effect.logWarning("process output pump failed", cause)),
      )
      const exit = yield* handle.exitCode.pipe(
        Effect.map((code): ExitInfo => ({ code })),
        Effect.catch((error) => Effect.succeed({ signal: signalOf(error) })),
      )
      state.exit = exit
      entry.exitedAt = yield* Clock.currentTimeMillis
      output.end()
      yield* spec.settle({ exit, stopped: state.stopped }).pipe(
        Effect.catchCause((cause) => Effect.logError("process settle failed", cause)),
      )
      // exited resolves only after settlement, so callers observe the durable job already settled.
      yield* Deferred.succeed(done, exit)
      yield* prune
    }).pipe(Effect.ensuring(Scope.close(scope, Exit.void)), Effect.forkIn(registryScope))
    return entry.live
  }))

  const get = (ref: Capability.JobRef, owner: Capability.Owner) => prune.pipe(Effect.flatMap(() => {
    const entry = entries.get(ref.id)
    return entry && sameOwner(entry.owner, owner) ? Effect.succeed(entry.live) : Effect.fail(denied())
  }))

  const list = (owner: Capability.Owner) => prune.pipe(Effect.map(() =>
    [...entries.values()].filter((entry) => sameOwner(entry.owner, owner)).slice(-32).map((entry) => entry.live)))

  const live = () => new Set([...entries.values()].filter((entry) => !entry.live.exit()).map((entry) => entry.live.ref.id))

  return Service.of({ start, get, list, live, startedAt })
})

export const layer = Layer.effect(Service, make())
export const node = makeGlobalNode({ service: Service, layer, deps: [AppProcess.node] })

// Unknown, foreign and evicted IDs must be indistinguishable.
function denied() {
  return new Capability.Failure({ code: "target_denied", message: "Process is not available" })
}

function unsupported(message: string) {
  return Effect.fail(new Capability.Failure({ code: "unsupported_operation", message }))
}

function sameOwner(a: Capability.Owner, b: Capability.Owner) {
  return a.projectID === b.projectID && a.sessionID === b.sessionID && a.agentID === b.agentID &&
    a.location.directory === b.location.directory && a.location.workspaceID === b.location.workspaceID
}

// The spawner reports a signal exit only as this message (cross-spawn-spawner exitCode).
function signalOf(error: PlatformError) {
  return /signal: '([^']+)'/.exec(String(error.cause))?.[1] ?? "unknown"
}
