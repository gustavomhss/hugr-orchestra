export * as OutputSigned from "./signed"

import { request } from "node:https"
import type { IncomingMessage } from "node:http"
import type { Socket } from "node:net"
import { checkServerIdentity } from "node:tls"
import { NodeStream } from "@effect/platform-node"
import { Actions } from "@orchestra/schema/actions"
import { Deferred, Effect, Exit, Scope, Stream } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { OutputNative } from "./native"

export function destination(binding: Actions.Binding, location: string | undefined, base?: URL) {
  const url = location !== undefined && URL.parse(location, base)
  if (!location || location.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(location) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(location) || !url || url.protocol !== "https:" || !url.hostname ||
    url.username || url.password || url.hash || location.includes("#"))
    throw OutputNative.error(binding, "host_mismatch", "Signed CI output destination must be credential-free HTTPS without fragments or controls")
  return url
}

// Bare Node HTTPS. Deliberately accepts neither native credentials, client TLS
// material, cookies nor caller headers. Every redirect is separately validated.
export const open = Effect.fn("ActionsOutput.signedOpen")(function* (
  binding: Actions.Binding, url: URL,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  yield* OutputNative.checked(binding, () => destination(binding, url.href))
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
  return yield* Effect.gen(function* () {
    const response = yield* Deferred.make<IncomingMessage, ActionsError>()
    const failure = yield* Deferred.make<never, ActionsError>()
    const state = { response: undefined as IncomingMessage | undefined, socket: undefined as Socket | undefined,
      error: undefined as ActionsError | undefined }
    const abort = new AbortController()
    const req = yield* Effect.acquireRelease(Effect.try({
      try: () => request(url, {
        method: "GET", agent: false, signal: abort.signal, rejectUnauthorized: true, minVersion: "TLSv1.2",
        checkServerIdentity, maxHeaderSize: 16 * 1024,
        headers: { Accept: "application/octet-stream", Connection: "close" },
      }),
      catch: () => OutputNative.error(binding, "transfer_failed", "Signed CI output request could not be opened"),
    }), (req) => Effect.sync(() => { abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy() }))
    const fail = (error: ActionsError) => {
      state.error ??= error
      Deferred.doneUnsafe(response, Exit.fail(state.error))
      Deferred.doneUnsafe(failure, Exit.fail(state.error))
    }
    req.on("error", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output HTTPS or TLS request failed")))
    req.on("socket", (socket) => { state.socket = socket })
    req.once("response", (incoming) => {
      state.response = incoming
      incoming.on("error", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response failed")))
      incoming.on("aborted", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response ended prematurely")))
      Deferred.doneUnsafe(response, Exit.succeed(incoming))
    })
    // Own watchdog closes socket even when downstream holds a chunk forever.
    yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.sync(() => {
      fail(OutputNative.error(binding, "transfer_failed", "Signed CI output deadline exceeded"))
      abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy()
    }))))
    req.end()
    const incoming = yield* Deferred.await(response).pipe(Effect.timeoutOrElse({ duration: "30 seconds",
      orElse: () => Effect.fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response header deadline exceeded")) }))
    return { status: incoming.statusCode ?? 0,
      headers: Object.fromEntries(Object.entries(incoming.headers)
        .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
        .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])),
      body: NodeStream.fromReadable<Uint8Array, ActionsError>({ evaluate: () => incoming,
        onError: () => state.error ?? OutputNative.error(binding, "transfer_failed", "Signed CI output response failed") }).pipe(
        Stream.concat(Stream.fromEffect(Effect.suspend(() => incoming.complete && !incoming.aborted ? Effect.void
          : Effect.fail(state.error ?? OutputNative.error(binding, "transfer_failed", "Signed CI output response ended prematurely")))).pipe(Stream.drain)),
        Stream.interruptWhen(Deferred.await(failure)), Stream.mapError((error) => state.error ?? error)),
      close: Scope.close(scope, Exit.void) }
  }).pipe(Scope.provide(scope), Effect.tapError(() => Scope.close(scope, Exit.void)))
})

export const follow = Effect.fn("ActionsOutput.signedFollow")(function* (
  binding: Actions.Binding, location: string, base: URL, hops = 0,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  if (hops >= 3) return yield* OutputNative.error(binding, "transfer_failed", "Signed CI output redirect limit exceeded")
  const url = yield* OutputNative.checked(binding, () => destination(binding, location, base))
  const response = yield* open(binding, url)
  if (![301, 302, 303, 307, 308].includes(response.status)) return response
  const next = response.headers.location
  yield* response.close
  if (!next) return yield* OutputNative.error(binding, "transfer_failed", "Signed CI output redirect has no Location")
  return yield* follow(binding, next, url, hops + 1)
})
