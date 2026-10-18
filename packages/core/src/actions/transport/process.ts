export * as ActionsProcess from "./process"

import { Actions } from "@orchestra/schema/actions"
import { Deferred, Effect, Exit, Fiber, Scope, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../process"
import { ActionsError } from "../error"
import { ActionsCli } from "./cli"
import { ActionsResponse } from "./response"

const METADATA_LIMIT = 2 * 1024 * 1024
const STDERR_LIMIT = 16 * 1024

export const capture = Effect.fn("ActionsTransport.capture")(function* (
  proc: AppProcess.Interface,
  provider: Actions.Provider,
  command: ChildProcess.Command,
  stdin: Stream.Stream<Uint8Array, ActionsError> = Stream.empty,
) {
  return yield* Effect.scoped(Effect.gen(function* () {
    if (provider.kind !== "github") return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab API calls require the HTTPS transport", "definitely_unsent")
    // A producer's unsent error cannot describe the CLI call after stdin starts.
    return yield* collect(proc, provider, command, stdin).pipe(
      Effect.mapError((cause) => cause instanceof ActionsError
        ? new ActionsError({ ...cause, message: cause.message, disposition: "unknown" })
        : ActionsCli.error(provider, "transport_failed", "Provider CLI process failed")),
    )
  })).pipe(
    Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Effect.fail(ActionsCli.error(provider, "transport_failed", "Provider CLI metadata deadline exceeded")) }),
  )
})

export function bytes(proc: AppProcess.Interface, provider: Actions.Provider, command: ChildProcess.Command) {
  return Stream.unwrap(Effect.gen(function* () {
    if (provider.kind !== "github") return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab API calls require the HTTPS transport", "definitely_unsent")
    const scope = yield* Scope.make()
    // Successful early stream disposal cannot adopt a live transfer child.
    yield* Effect.addFinalizer((exit) => Scope.close(scope, Exit.isFailure(exit) ? exit : Exit.interrupt()))
    const stopped = yield* Deferred.make<never, ActionsError>()
    yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.gen(function* () {
      const error = ActionsCli.error(provider, "transfer_failed", "Provider CLI byte transfer deadline exceeded")
      yield* Deferred.fail(stopped, error)
      yield* Scope.close(scope, Exit.fail(error)).pipe(Effect.uninterruptible)
    }))))
    const handle = yield* proc.spawn(command).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(stopped)))
    // Expected signal termination is data, not an unobserved failed monitor fiber.
    const exited = yield* handle.exitCode.pipe(Effect.exit, Effect.forkIn(scope))
    const stderr = yield* AppProcess.collectStream(handle.stderr, STDERR_LIMIT).pipe(Effect.exit, Effect.forkIn(scope))
    const tail = Stream.fromEffect(Effect.gen(function* () {
      const code = yield* Fiber.join(exited).pipe(Effect.flatMap((exit) => exit))
      const diagnostic = yield* Fiber.join(stderr).pipe(Effect.flatMap((exit) => exit))
      if (code !== 0) {
        const error = ActionsResponse.failure(provider, code, diagnostic.buffer)
        return yield* new ActionsError({ ...error, message: error.message, disposition: error.disposition, kind: error.kind === "transport_failed" ? "transfer_failed" : error.kind })
      }
    })).pipe(Stream.drain)
    const pull = yield* Stream.toPull(Stream.concat(handle.stdout, tail)).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(stopped)))
    const stderrFailure = Fiber.join(stderr).pipe(Effect.flatMap((exit) => Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.never))
    return Stream.fromPull(Effect.succeed(Effect.gen(function* () {
      if (yield* Deferred.isDone(stopped)) return yield* Deferred.await(stopped)
      const exit = yield* pull.pipe(Effect.raceFirst(stderrFailure), Effect.raceFirst(Deferred.await(stopped)), Effect.exit)
      if (yield* Deferred.isDone(stopped)) return yield* Deferred.await(stopped)
      return yield* exit
    })))
  })).pipe(
    Stream.mapError((cause) => cause instanceof ActionsError ? cause : ActionsCli.error(provider, "transfer_failed", "Provider CLI byte transfer failed")),
  )
}

const collect = Effect.fn("ActionsTransport.collect")(function* (
  proc: AppProcess.Interface, provider: Actions.Provider, command: ChildProcess.Command,
  stdin: Stream.Stream<Uint8Array, ActionsError> = Stream.empty,
) {
  const handle = yield* proc.spawn(command)
  const result = yield* Effect.all({
    stdout: bounded(handle.stdout, provider, METADATA_LIMIT),
    stderr: bounded(handle.stderr, provider, STDERR_LIMIT),
    exitCode: handle.exitCode, input: Stream.run(stdin, handle.stdin),
  }, { concurrency: "unbounded" })
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
})

function bounded<E>(stream: Stream.Stream<Uint8Array, E>, provider: Actions.Provider, limit: number) {
  return Stream.runFoldEffect(stream, () => ({ chunks: [] as Uint8Array[], size: 0 }), (state, chunk) => {
    if (state.size + chunk.byteLength > limit)
      return Effect.fail(ActionsCli.error(provider, "metadata_truncated", "Provider CLI output exceeded the metadata capture limit"))
    state.chunks.push(chunk)
    state.size += chunk.byteLength
    return Effect.succeed(state)
  }).pipe(Effect.map((state) => Buffer.concat(state.chunks)))
}
