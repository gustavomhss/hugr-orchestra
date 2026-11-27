import { Cause, Effect, Exit, Layer, Result } from "effect"
import { FindMyWay, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { IncomingMessage } from "node:http"

export type HttpExtension = { readonly mount: string; readonly handler: (request: Request) => Promise<Response | undefined> }

export function isHttpExtensionMount(mount: string) {
  const path = mount.toLowerCase()
  return /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(mount) && path !== "/api" && !path.startsWith("/api/")
}

export function httpExtensionsLayer(extensions: readonly HttpExtension[]) {
  extensions.forEach((extension, index) => {
    if (!isHttpExtensionMount(extension.mount)) throw new Error("Invalid HTTP extension mount")
    const mount = extension.mount.toLowerCase()
    if (extensions.slice(0, index).some((previous) => {
      const other = previous.mount.toLowerCase()
      return other === mount || other.startsWith(`${mount}/`) || mount.startsWith(`${other}/`)
    })) throw new Error("Overlapping HTTP extension mounts")
  })

  return Layer.mergeAll(Layer.empty, ...extensions.map((extension) =>
    // Effect registers the exact mount as well as the wildcard.
    HttpRouter.add("*", subtree(extension.mount), Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const context = yield* Effect.context<never>()
      const controller = new AbortController()
      const abort = () => controller.abort()
      if (request.source instanceof IncomingMessage) {
        // The handler promise can settle before a streamed response finishes.
        // The socket can abort pending stream work before Effect cancels its reader.
        const socket = request.source.socket
        socket.once("close", abort)
        yield* Effect.addFinalizer(() => Effect.sync(() => { socket.off("close", abort) }))
        if (socket.destroyed) abort()
      }
      yield* Effect.addFinalizer((exit) => Effect.sync(() => {
        if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)) abort()
      }))
      return yield* Effect.tryPromise(() =>
        extension.handler(Result.getOrThrow(HttpServerRequest.toWebResult(request, { signal: controller.signal, context }))),
      ).pipe(
        Effect.map((response) => response === undefined
          ? HttpServerResponse.empty({ status: 404 })
          : HttpServerResponse.fromWeb(response)),
        Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))),
      )
    })),
  ))
}

/** Global policies run before routing. Match both registrations using the same URL normalization as the server router. */
export function extensionRequestMatcher(extensions: readonly HttpExtension[]) {
  if (extensions.length === 0) return undefined
  const router = FindMyWay.make<true>()
  for (const extension of extensions) {
    router.on("GET", extension.mount as `/${string}`, true)
    router.on("GET", subtree(extension.mount), true)
  }
  return (url: string) => router.find("GET", url) !== undefined
}

function subtree(mount: string) {
  return `${mount}/*` as `/${string}`
}
