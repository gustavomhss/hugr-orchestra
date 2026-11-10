export * as FabricIdentityGuardedHttps from "./identity-guarded-https"

import { connect, checkServerIdentity } from "node:tls"
import { Effect } from "effect"
import { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityDiscoveryContract } from "./identity-discovery-contract"

/** One real TLS socket, admitted in the caller's fiber before an HTTP client may write anything to it. */
export function post<E, R>(
  body: string,
  options: Readonly<{
    network?: FabricIdentityDiscoveryContract.Options["network"]
    timeoutMs: number
    signal?: AbortSignal
    correlationID: string
    admit: Effect.Effect<void, E, R>
  }>,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      yield* options.admit
      const { Client } = yield* Effect.tryPromise({ try: () => import("undici/index.js"), catch: unavailable })
      const state = { handed: false, closed: false }
      const socket = yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            const socket = connect({
              host: options.network?.address ?? "login.microsoftonline.com",
              port: options.network?.port ?? 443,
              ca: options.network?.ca,
              servername: "login.microsoftonline.com",
              rejectUnauthorized: true,
              minVersion: "TLSv1.2",
              checkServerIdentity,
              ALPNProtocols: ["http/1.1"],
            })
            // A socket error may race admission or teardown; the awaited handshake/request independently reports refusal.
            socket.on("error", () => {})
            return socket
          },
          catch: unavailable,
        }),
        (socket) =>
          Effect.sync(() => {
            state.closed = true
            socket.destroy()
          }),
      )
      const abort = () => socket.destroy()
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          options.signal?.addEventListener("abort", abort, { once: true })
          if (options.signal?.aborted) socket.destroy()
        }),
        () => Effect.sync(() => options.signal?.removeEventListener("abort", abort)),
      )
      yield* Effect.callback<void, FabricIdentityTokens.Failure>((resume) => {
        const done = { value: false }
        const fail = () => {
          if (done.value) return
          done.value = true
          resume(Effect.fail(unavailable()))
        }
        const secure = () => {
          if (done.value) return
          if (
            !socket.authorized ||
            socket.destroyed ||
            checkServerIdentity("login.microsoftonline.com", socket.getPeerCertificate())
          ) {
            fail()
            return
          }
          done.value = true
          resume(Effect.void)
        }
        socket.once("secureConnect", secure)
        socket.once("error", fail)
        socket.once("close", fail)
        if (socket.destroyed) fail()
        return Effect.sync(() => {
          socket.off("secureConnect", secure)
          socket.off("error", fail)
          socket.off("close", fail)
        })
      })
      // No HTTP bytes have been queued. This is the actual child Effect/frame, not a callback's runPromise.
      yield* options.admit
      if (socket.destroyed || options.signal?.aborted) return yield* unavailable()
      const client = yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            new Client("https://login.microsoftonline.com", {
              pipelining: 0,
              allowH2: false,
              maxRequestsPerClient: 1,
              maxHeaderSize: 16384,
              maxResponseSize: 262144,
              headersTimeout: options.timeoutMs,
              bodyTimeout: options.timeoutMs,
              connect: (_request, callback) => {
                // Match an actual asynchronous connector; a synchronous callback can run inside Client's resume loop.
                queueMicrotask(() => {
                  if (state.handed || state.closed || socket.destroyed || options.signal?.aborted) {
                    callback(unavailable(), null)
                    return
                  }
                  state.handed = true
                  callback(null, socket)
                })
              },
            }),
          catch: unavailable,
        }),
        (client) => Effect.promise(() => client.destroy()),
      )
      return yield* Effect.tryPromise({
        try: async () => {
          const response = await client.request({
            method: "POST",
            path: "/organizations/oauth2/v2.0/token?client-request-id=" + options.correlationID,
            body,
            signal: options.signal,
            headers: {
              Host: "login.microsoftonline.com",
              Accept: "application/json",
              "Accept-Encoding": "identity",
              "Content-Type": "application/x-www-form-urlencoded",
              "Content-Length": String(Buffer.byteLength(body)),
              Connection: "close",
            },
          })
          const type = response.headers["content-type"]
          const encoding = response.headers["content-encoding"]
          const length = response.headers["content-length"]
          if (
            (response.statusCode !== 200 && response.statusCode !== 400) ||
            typeof type !== "string" ||
            !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type.trim()) ||
            (encoding !== undefined && encoding !== "identity") ||
            (length !== undefined &&
              (typeof length !== "string" ||
                !/^[0-9]+$/.test(length) ||
                !Number.isSafeInteger(Number(length)) ||
                Number(length) > 262144))
          )
            throw unavailable()
          const result = { size: 0, chunks: [] as Buffer[] }
          for await (const chunk of response.body) {
            if (result.size + chunk.length > 262144) throw unavailable()
            result.size += chunk.length
            result.chunks.push(chunk)
          }
          if (length !== undefined && result.size !== Number(length)) throw unavailable()
          return {
            status: response.statusCode,
            headers: { "content-type": type },
            body: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(result.chunks)),
          }
        },
        catch: unavailable,
      })
    }).pipe(Effect.timeoutOrElse({ duration: options.timeoutMs, orElse: () => Effect.fail(unavailable()) })),
  )
}

function unavailable() {
  return new FabricIdentityTokens.Failure({
    code: "unavailable",
    message: "Fabric contextual TLS transport is unavailable",
  })
}
