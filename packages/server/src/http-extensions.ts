import { Effect, Layer, Result } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

export type HttpExtension = { readonly mount: string; readonly handler: (request: Request) => Promise<Response | undefined> }

export function httpExtensionsLayer(extensions: readonly HttpExtension[]) {
  extensions.forEach((extension, index) => {
    if (
      !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(extension.mount) ||
      ["/api", "/openapi.json"].some((reserved) => extension.mount === reserved || extension.mount.startsWith(`${reserved}/`))
    ) throw new Error("Invalid HTTP extension mount")
    if (extensions.slice(0, index).some((previous) =>
      previous.mount === extension.mount ||
      previous.mount.startsWith(`${extension.mount}/`) ||
      extension.mount.startsWith(`${previous.mount}/`)
    )) throw new Error("Overlapping HTTP extension mounts")
  })

  if (extensions.length === 0) return Layer.empty
  return Layer.mergeAll(Layer.empty, ...extensions.map((extension) => {
    const handler = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      // Keep conversion inside the interruptible promise and never expose a handler's rejection cause.
      return yield* Effect.tryPromise((signal) =>
        extension.handler(Result.getOrThrow(HttpServerRequest.toWebResult(request, { signal }))),
      ).pipe(
        Effect.map((response) => response === undefined
          ? HttpServerResponse.empty({ status: 404 })
          : HttpServerResponse.fromWeb(response)),
        Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))),
      )
    })
    // Effect also registers the exact mount for a /* route; adding it separately duplicates every method.
    return HttpRouter.add("*", `${extension.mount}/*` as `/${string}`, handler)
  }))
}
