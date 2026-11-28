import { Cause, Deferred, Effect } from "effect"
import { HttpRouter, HttpServerError, HttpServerRequest } from "effect/unstable/http"
import { IncomingMessage } from "node:http"

export const layer = HttpRouter.middleware(
  (effect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      if (!(request.source instanceof IncomingMessage)) return yield* effect
      const source = request.source
      const socket = source.socket
      const aborted = yield* Deferred.make<never>()
      const interrupt = Effect.failCause(Cause.annotate(Cause.interrupt(), HttpServerError.ClientAbort.annotation))
      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          const onAbort = () => Deferred.doneUnsafe(aborted, interrupt)
          source.on("aborted", onAbort)
          socket.on("close", onAbort)
          if (source.aborted || socket.destroyed) onAbort()
          return onAbort
        }),
        () =>
          Deferred.isDone(aborted).pipe(
            Effect.flatMap((done) => (done ? interrupt : Effect.raceFirst(effect, Deferred.await(aborted)))),
          ),
        (onAbort) =>
          Effect.sync(() => {
            source.off("aborted", onAbort)
            socket.off("close", onAbort)
          }),
      )
    }),
  { global: true },
)
