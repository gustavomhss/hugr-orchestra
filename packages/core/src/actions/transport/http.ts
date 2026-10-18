export * as ActionsHttp from "./http"

import { request } from "node:https"
import type { IncomingMessage } from "node:http"
import type { Socket } from "node:net"
import { checkServerIdentity } from "node:tls"
import { NodeStream } from "@effect/platform-node"
import { Actions } from "@orchestra/schema/actions"
import { Cause, Deferred, Effect, Exit, Fiber, Scope, Stream } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCli } from "./cli"
import { ActionsCredentials } from "./credentials"
import { ActionsResponse } from "./response"

const certificateFailures = new Set([
  "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "CERT_REVOKED", "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID",
])

export function requestError(provider: Actions.Provider, cause: unknown, phase: "handshake" | "http_possible") {
  const verification = cause instanceof Error && "code" in cause && typeof cause.code === "string" && certificateFailures.has(cause.code)
  return ActionsCli.error(provider, "transport_failed", verification ? "GitLab TLS verification failed" : "GitLab HTTPS request failed",
    verification && phase === "handshake" ? "definitely_unsent" : "unknown")
}

export const metadata = Effect.fn("ActionsTransport.httpsMetadata")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request,
  body: Stream.Stream<Uint8Array, ActionsError> = input.body === undefined ? Stream.empty : Stream.make(new TextEncoder().encode(JSON.stringify(input.body))),
  contentType = "application/json",
) {
  return yield* Effect.scoped(Effect.gen(function* () {
    const handle = yield* open(provider, snapshot, input, body, contentType, "30 seconds")
    const response = yield* handle.response
    const result = yield* responseBytes(provider, response, handle).pipe(Stream.runFoldEffect(() => ({ size: 0, chunks: [] as Uint8Array[] }), (state, chunk) => {
      if (state.size + chunk.length > 2 * 1024 * 1024)
        return Effect.fail(ActionsCli.error(provider, "metadata_truncated", "GitLab metadata capture limit exceeded"))
      state.size += chunk.length
      state.chunks.push(chunk)
      return Effect.succeed(state)
    }))
    yield* Fiber.join(handle.input)
    return yield* ActionsResponse.http(provider, response.statusCode ?? 0, headers(response), Buffer.concat(result.chunks))
  }))
})

export function bytes(provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request) {
  return Stream.unwrap(Effect.gen(function* () {
    const handle = yield* open(provider, snapshot, input, Stream.empty, "application/octet-stream", "5 minutes")
    const response = yield* handle.response
    if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) > 299) {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400)
        return yield* ActionsCli.error(provider, "host_mismatch", "Authenticated GitLab redirects require explicit credential-free transfer")
      return yield* ActionsResponse.failure(provider, 1, Buffer.alloc(0), response.statusCode, headers(response), true)
    }
    return responseBytes(provider, response, handle)
  }))
}

export const openRaw = Effect.fn("ActionsTransport.httpsOpenRaw")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.BoundRequest,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  if (provider.kind !== "gitlab" || input.method !== "GET" || input.body !== undefined)
    return yield* ActionsCli.error(provider, "invalid_input", "Native raw opening requires a GitLab GET without a body", "definitely_unsent")
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
  const handle = yield* open(provider, snapshot, input, Stream.empty, "application/octet-stream", "5 minutes").pipe(Scope.provide(scope))
  const response = yield* handle.response
  return {
    status: response.statusCode ?? 0, headers: headers(response), body: responseBytes(provider, response, handle),
    close: Scope.close(scope, Exit.void),
  }
})

const open = Effect.fn("ActionsTransport.httpsOpen")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request,
  body: Stream.Stream<Uint8Array, ActionsError>, contentType: string, deadline: "30 seconds" | "5 minutes",
) {
  const endpoint = yield* ActionsCli.endpoint(provider, input)
  const origin = URL.parse(provider.apiOrigin)
  const url = origin && URL.parse(`${origin.origin}/api/v4/${endpoint}`)
  if (!origin || !url || url.protocol !== "https:" || url.origin !== origin.origin || url.host !== provider.hostname)
    return yield* ActionsCli.error(provider, "host_mismatch", "GitLab HTTPS destination differs from the binding origin", "definitely_unsent")
  const response = yield* Deferred.make<IncomingMessage, ActionsError>()
  const failure = yield* Deferred.make<never, ActionsError>()
  const abort = new AbortController()
  const state = { error: undefined as ActionsError | undefined, response: undefined as IncomingMessage | undefined, socket: undefined as Socket | undefined,
    phase: "handshake" as "handshake" | "http_possible" }
  const req = yield* Effect.acquireRelease(Effect.try({
    try: () => request(url, {
      method: input.method, agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2", signal: abort.signal,
      ca: snapshot.ca, cert: snapshot.cert, key: snapshot.key,
      // Verification success precedes authenticated HTTP. Keep this transition
      // sticky: later renegotiation/certificate/TLS failures cannot prove unsent.
      checkServerIdentity: (hostname, certificate) => {
        const error = checkServerIdentity(hostname, certificate)
        if (!error) state.phase = "http_possible"
        return error
      },
      headers: { ...snapshot.headers, "Content-Type": contentType, Connection: "close" },
    }),
    catch: () => ActionsCli.error(provider, "invalid_input", "GitLab HTTPS request could not be constructed safely", "definitely_unsent"),
  }), (req) => Effect.sync(() => { abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy() }))
  const fail = (error: ActionsError) => {
    state.error ??= error
    Deferred.doneUnsafe(response, Exit.fail(state.error))
    Deferred.doneUnsafe(failure, Exit.fail(state.error))
  }
  req.on("error", (cause) => {
    fail(requestError(provider, cause, state.phase))
  })
  req.on("socket", (socket) => {
    state.socket = socket
    socket.once("secureConnect", () => { state.phase = "http_possible" })
  })
  req.once("response", (incoming) => {
    state.phase = "http_possible"
    state.response = incoming
    incoming.on("error", () => fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response failed")))
    incoming.on("aborted", () => fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response ended prematurely")))
    Deferred.doneUnsafe(response, Exit.succeed(incoming))
  })
  yield* Effect.forkScoped(Effect.sleep(deadline).pipe(Effect.andThen(Effect.sync(() => {
    fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS deadline exceeded"))
    abort.abort()
    state.response?.destroy()
    state.socket?.destroy()
    req.destroy()
  }))))
  const sent = yield* Effect.forkScoped(Stream.runForEach(body, (chunk) => Effect.callback<void, ActionsError>((resume) => {
    const progress = { written: false, returned: false, drained: false, blocked: false }
    const done = () => {
      if (!progress.returned || !progress.written || (progress.blocked && !progress.drained)) return
      req.off("drain", drain)
      resume(Effect.void)
    }
    const drain = () => { progress.drained = true; done() }
    // Bun can signal drain synchronously during write. Install before writing;
    // wait on callback plus backpressure instead of accumulating the whole body.
    req.once("drain", drain)
    progress.blocked = !req.write(chunk, (error) => {
      if (error) { req.off("drain", drain); resume(Effect.fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS upload failed"))); return }
      progress.written = true; done()
    })
    progress.returned = true
    done()
    return Effect.sync(() => req.off("drain", drain))
  }).pipe(Effect.andThen(Effect.callback<void>((resume) => {
    // Let the Node/Bun I/O pump consume a chunk before the next producer pull.
    const turn = setImmediate(() => resume(Effect.void))
    return Effect.sync(() => clearImmediate(turn))
  })))).pipe(
    Effect.andThen(Effect.callback<void>((resume) => {
      const finished = () => resume(Effect.void)
      req.once("finish", finished)
      req.end()
      return Effect.sync(() => req.off("finish", finished))
    })),
    Effect.raceFirst(Deferred.await(failure)),
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "unknown" })),
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause)
      return Effect.fail(error instanceof ActionsError ? error : ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS upload producer failed"))
    }),
    Effect.tapError((error) => Effect.sync(() => { fail(error); abort.abort(); state.socket?.destroy(); req.destroy() })),
  ))
  return { response: Deferred.await(response).pipe(Effect.raceFirst(Deferred.await(failure))), failure: Deferred.await(failure), input: sent, state }
})

function responseBytes(provider: Actions.Provider, response: IncomingMessage, handle: Effect.Success<ReturnType<typeof open>>) {
  return NodeStream.fromReadable<Uint8Array, ActionsError>({ evaluate: () => response,
    onError: () => handle.state.error ?? ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response failed"),
  }).pipe(
    Stream.concat(Stream.fromEffect(Effect.suspend(() => response.complete && !response.aborted ? Effect.void
      : Effect.fail(handle.state.error ?? ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response ended prematurely")))).pipe(Stream.drain)),
    Stream.interruptWhen(handle.failure),
    Stream.mapError((error) => handle.state.error ?? error),
  )
}

function headers(response: IncomingMessage) {
  return Object.fromEntries(Object.entries(response.headers).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]))
}
