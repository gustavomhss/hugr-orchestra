import { Cause, Effect, Exit, Layer, Option, Stream } from "effect"
import { Cookies, FindMyWay, HttpBody, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
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
    const mount = extension.mount.toLowerCase() as `/${string}`
    if (mounts.some((previous) => owns(previous, mount) || owns(mount, previous))) {
      throw new Error("Overlapping HTTP extension mounts")
    }
    mounts.push(mount)
    // This is a namespace lookup. It uses the same path matching as the server, independent of the request method.
    router.on("GET", mount, extension)
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
    const body = nativeRequestBody(request)
    if (body) yield* Effect.addFinalizer(() => Effect.sync(body.stop))
    return yield* Effect.tryPromise(async () => {
      const input = toRequest(request, controller.signal, body?.stream)
      if (router.find("GET", new URL(input.url).pathname)?.handler !== extension) return HttpServerResponse.empty({ status: 404 })
      const response = await extension.handler(input)
      if (controller.signal.aborted && response?.body && !response.body.locked) {
        await response.body.cancel(controller.signal.reason).catch(() => undefined)
        return HttpServerResponse.empty({ status: 404 })
      }
      return response === undefined
        ? HttpServerResponse.empty({ status: 404 })
        : toResponse(response, request, controller.signal)
    }).pipe(
      Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))),
      Effect.interruptible,
    )
  }), { global: true })
}

function owns(mount: string, pathname: string) {
  return pathname === mount || pathname.startsWith(`${mount}/`)
}

function toRequest(
  request: HttpServerRequest.HttpServerRequest,
  signal: AbortSignal,
  body?: ReadableStream<Uint8Array>,
) {
  if (request.source instanceof Request) return request.source
  const base = Option.getOrThrow(HttpServerRequest.toURL(request.modify({ url: "/" })))
  const target = request.url.startsWith("/") ? request.url : requestTarget(new URL(request.url))
  // Keep the admitted Host as the authority even for an absolute-form target or a path starting with //.
  const url = new URL(base.origin + target)
  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers: request.headers, signal }
  if (body) {
    init.body = body
    init.duplex = "half"
  }
  return new Request(url, init)
}

function requestTarget(url: URL) {
  return url.pathname + url.search
}

function nativeRequestBody(request: HttpServerRequest.HttpServerRequest) {
  const source = request.source
  if (!(source instanceof IncomingMessage) || request.method === "GET" || request.method === "HEAD" ||
    !(Number(request.headers["content-length"]) > 0 || request.headers["transfer-encoding"])) return undefined

  // The server can discard an unread upload itself. Start reading only at the handler's first pull.
  const iterator = source.iterator({ destroyOnReturn: false })
  const state = { started: false, stopped: false }
  const stop = () => {
    if (state.stopped) return
    state.stopped = true
    if (!state.started) return
    // Release partial consumption without destroying the connection before an early response.
    if (!source.destroyed && !source.readableEnded) source.resume()
    void iterator.return?.().catch(() => undefined)
  }
  return {
    stop,
    stream: new ReadableStream<Uint8Array>({
      async pull(stream) {
        if (state.stopped) {
          stream.close()
          return
        }
        state.started = true
        const next = await iterator.next()
        if (state.stopped) return
        if (next.done) stream.close()
        else stream.enqueue(next.value)
      },
      cancel: stop,
    }, { highWaterMark: 0 }),
  }
}

function toResponse(
  response: Response,
  request: HttpServerRequest.HttpServerRequest,
  signal: AbortSignal,
): HttpServerResponse.HttpServerResponse {
  if (request.source instanceof Request) {
    // The Web adapter passes through raw Web Responses. Keep their Headers through its stream scope handling.
    const raw = HttpServerResponse.raw(response, { status: response.status, statusText: response.statusText })
    return request.method === "HEAD" ? Object.assign(raw, { headers: new Headers(response.headers) }) : raw
  }
  const normalized = HttpServerResponse.fromWeb(response)
  const converted = response.body && request.method !== "HEAD"
    ? HttpServerResponse.setBody(normalized, HttpBody.stream(
        Stream.fromReadableStream({ evaluate: () => abortableBody(response.body!, signal), onError: (error) => error }),
        response.headers.get("content-type") ?? undefined,
      ))
    : normalized
  const setCookie = response.headers.getSetCookie()
  if (setCookie.length === 0) return converted
  // Effect's parsed cookie map is keyed by name. Preserve the original fields, including repeated names and attributes.
  // The Node adapter passes header arrays to ServerResponse.writeHead.
  return Object.assign(HttpServerResponse.replaceCookies(converted, Cookies.empty), {
    headers: { ...converted.headers, "set-cookie": setCookie },
  })
}

function abortableBody(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader()
  const state = { released: false }
  const release = () => {
    if (state.released) return
    state.released = true
    signal.removeEventListener("abort", abort)
    reader.releaseLock()
  }
  const abort = () => { void reader.cancel(signal.reason).catch(() => undefined).finally(release) }
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  return new ReadableStream<Uint8Array>({
    async pull(stream) {
      if (state.released) {
        stream.close()
        return
      }
      try {
        const next = await reader.read()
        if (next.done) {
          stream.close()
          release()
          return
        }
        stream.enqueue(next.value)
      } catch (error) {
        release()
        throw error
      }
    },
    async cancel(reason) {
      if (state.released) return
      try {
        await reader.cancel(reason)
      } finally {
        release()
      }
    },
  }, { highWaterMark: 0 })
}
