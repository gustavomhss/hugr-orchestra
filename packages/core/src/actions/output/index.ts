export * as ActionsOutput from "./index"

import { Actions } from "@orchestra/schema/actions"
import { Deferred, Effect, Exit, Scope, Stream } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { OutputArtifacts } from "./artifacts"
import { OutputDownload } from "./download"
import { OutputHeaders } from "./headers"
import { OutputNative } from "./native"
import { OutputTarget } from "./target"

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const bound = <A, R>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError, R>) => effect.pipe(
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition,
      bindingID: binding.id, provider: binding.provider.kind })))
  return {
    artifacts: (binding: Actions.Binding, value: Actions.ResourceListInput) => bound(binding,
      OutputArtifacts.list(input.transport, input.reader, binding, value).pipe(Effect.timeoutOrElse({ duration: "30 seconds",
        orElse: () => Effect.fail(OutputNative.error(binding, "transport_failed", "CI artifact inventory deadline exceeded")) }))),
    info: (binding: Actions.Binding, value: Actions.TransferInput): Effect.Effect<OutputHeaders.Info, ActionsError> => bound(binding,
      Effect.scoped(Effect.gen(function* () {
        const target = yield* OutputTarget.resolve(input.transport, input.reader, binding, value)
        if (binding.provider.kind === "github") return target.info
        const opened = yield* OutputDownload.open(input.transport, input.reader, binding, value, target)
        const info = yield* OutputNative.checked(binding, () => OutputHeaders.info(binding, opened.info, opened.response.headers))
        yield* opened.response.close
        return info
      })).pipe(Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Effect.fail(OutputNative.error(binding, "transfer_failed", "CI output metadata deadline exceeded")) }))),
    read: (binding: Actions.Binding, value: Actions.TransferInput): Stream.Stream<Uint8Array, ActionsError> => Stream.unwrap(bound(binding,
      Effect.gen(function* () {
        const scope = yield* Scope.make()
        yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
        const failure = yield* Deferred.make<never, ActionsError>()
        // Closing child scope tears down socket/process directly; pull-based stream
        // timeouts alone cannot release resources under a blocked consumer.
        yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.gen(function* () {
          const error = OutputNative.error(binding, "transfer_failed", "CI output transfer deadline exceeded")
          yield* Deferred.fail(failure, error)
          // Finish resource finalizers even if downstream disposes this watchdog.
          yield* Scope.close(scope, Exit.fail(error)).pipe(Effect.uninterruptible)
        }))))
        const stream = yield* Effect.gen(function* () {
          const target = yield* OutputTarget.resolve(input.transport, input.reader, binding, value)
          if (binding.provider.kind === "github") return input.transport.bytes(binding, target.request)
          const opened = yield* OutputDownload.open(input.transport, input.reader, binding, value, target, true)
          if (opened.response.status === 206 || opened.response.headers["content-range"] !== undefined)
            return yield* OutputNative.error(binding, "transfer_failed", "CI output endpoint returned an unrequested partial transfer")
          yield* OutputNative.checked(binding, () => OutputHeaders.info(binding, opened.info, opened.response.headers))
          return opened.response.body
        }).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(failure)))
        // Bind the channel's actual resource scope, not merely its service context.
        // Nested Stream.unwrap (GH spawn) acquires in this watchdog-owned scope.
        const pull = yield* Stream.toPull(stream).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(failure)))
        // Preserve deadline failure across downstream-held chunks and cached EOF.
        return Stream.fromPull(Effect.succeed(Effect.gen(function* () {
          if (yield* Deferred.isDone(failure)) return yield* Deferred.await(failure)
          const exit = yield* pull.pipe(Effect.raceFirst(Deferred.await(failure)), Effect.exit)
          if (yield* Deferred.isDone(failure)) return yield* Deferred.await(failure)
          return yield* exit
        }))).pipe(
          Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition,
            bindingID: binding.id, provider: binding.provider.kind })))
      }))),
  }
}
