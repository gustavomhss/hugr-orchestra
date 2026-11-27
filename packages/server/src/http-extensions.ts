import { Cause, Effect, Exit, Layer, Option, Stream } from "effect"
import { Cookies, FindMyWay, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { IncomingMessage } from "node:http"

export type HttpExtension = { readonly mount: string; readonly handler: (request: Request) => Promise<Response | undefined> }

const reservedMounts = ["/api", "/experimental", "/openapi.json"]
const fetchForbiddenMethods = new Set(["CONNECT", "TRACE", "TRACK"])

export function isHttpExtensionMount(mount: string) {
  return /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(mount) &&
    !reservedMounts.some((reserved) => owns(reserved, mount.toLowerCase()))
}

export function httpExtensionsLayer(extensions: readonly HttpExtension[]) {
  if (extensions.length === 0) return Layer.empty
  const router = FindMyWay.make<HttpExtension>()
  const mounts: string[] = []
  for (const extension of extensions) {
    if (!isHttpExtensionMount(extension.mount)) throw new Error("Invalid HTTP extension mount")
    const mount = extension.mount.toLowerCase()
    if (mounts.some((previous) => owns(previous, mount) || owns(mount, previous))) {
      throw new Error("Overlapping HTTP extension mounts")
    }
    mounts.push(mount)
    // This is a namespace lookup. It uses the same path matching as the server, independent of the request method.
    router.on("GET", mount as `/${string}`, extension)
    router.on("GET", `${mount}/*`, extension)
  }

  return HttpRouter.middleware((next) => Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const extension = router.find("GET", request.url)?.handler
    if (!extension) return yield* next
    if (fetchForbiddenMethods.has(request.method)) return HttpServerResponse.empty({ status: 405 })

    const controller = new AbortController()
    const abort = () => controller.abort()
    if (request.source instanceof IncomingMessage) {
      // Observe socket close before Effect waits for cancellation of the response's body.
      const socket = request.source.socket
      socket.once("close", abort)
      yield* Effect.addFinalizer(() => Effect.sync(() => { socket.off("close", abort) }))
      if (socket.destroyed) abort()
    }
    yield* Effect.addFinalizer((exit) => Effect.sync(() => {
      if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)) abort()
    }))
    return yield* Effect.tryPromise(async () => {
      const input = toRequest(request, controller.signal)
      if (router.find("GET", new URL(input.url).pathname)?.handler !== extension) return undefined
      return extension.handler(input)
    }).pipe(
      Effect.map((response) => response === undefined
        ? HttpServerResponse.empty({ status: 404 })
        : toResponse(response, request.source instanceof Request)),
      Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))),
    )
  }), { global: true })
}

function owns(mount: string, pathname: string) {
  return pathname === mount || pathname.startsWith(`${mount}/`)
}

function toRequest(request: HttpServerRequest.HttpServerRequest, signal: AbortSignal) {
  if (request.source instanceof Request) return request.source
  const base = Option.getOrThrow(HttpServerRequest.toURL(request.modify({ url: "/" })))
  const target = request.url.startsWith("/") ? request.url : requestTarget(new URL(request.url))
  // Keep the admitted Host as the authority even for an absolute-form target or a path starting with //.
  const url = new URL(base.origin + target)
  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers: request.headers, signal }
  if (request.method !== "GET" && request.method !== "HEAD" &&
    (Number(request.headers["content-length"]) > 0 || request.headers["transfer-encoding"])) {
    // Releasing the iterator must not destroy an incomplete upload before the handler can send its response.
    const stream = request.source instanceof IncomingMessage
      ? Stream.fromAsyncIterable(request.source.iterator({ destroyOnReturn: false }), (error) => error)
      : request.stream
    init.body = Stream.toReadableStream(stream)
    init.duplex = "half"
  }
  return new Request(url, init)
}

function requestTarget(url: URL) {
  return url.pathname + url.search
}

function toResponse(response: Response, web: boolean): HttpServerResponse.HttpServerResponse {
  const converted = HttpServerResponse.fromWeb(response)
  const setCookie = response.headers.getSetCookie()
  if (setCookie.length === 0) return converted
  // Effect's parsed cookie map is keyed by name. Preserve the original fields, including repeated names and attributes.
  // The Web adapter accepts native Headers, and the Node adapter passes header arrays to ServerResponse.writeHead.
  return Object.assign(HttpServerResponse.setCookies(converted, Cookies.empty), {
    headers: web ? new Headers(response.headers) : { ...converted.headers, "set-cookie": setCookie },
  })
}
