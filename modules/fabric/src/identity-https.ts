export * as FabricIdentityHttps from "./identity-https"

import { request } from "node:https"
import type { IncomingMessage } from "node:http"
import type { Socket } from "node:net"
import { checkServerIdentity } from "node:tls"
import { Effect } from "effect"
import { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityDiscoveryContract } from "./identity-discovery-contract"

export const endpoints = Object.freeze({
  metadata: "https://login.microsoftonline.com/organizations/v2.0/.well-known/openid-configuration",
  keys: "https://login.microsoftonline.com/organizations/discovery/v2.0/keys",
})

/** Fixed public GETs. Any explicit address/CA is trusted host networking, never request/workspace input. */
export function read(
  kind: keyof typeof endpoints,
  options: Pick<FabricIdentityDiscoveryContract.Options, "network"> & { timeoutMs: number },
) {
  const maximum = kind === "metadata" ? 65536 : 262144
  return Effect.scoped(
    Effect.gen(function* () {
      const abort = new AbortController()
      const state = {
        response: undefined as IncomingMessage | undefined,
        socket: undefined as Socket | undefined,
        closed: false,
      }
      const req = yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            request(endpoints[kind], {
              method: "GET",
              signal: abort.signal,
              agent: false,
              rejectUnauthorized: true,
              minVersion: "TLSv1.2",
              checkServerIdentity,
              ...(options.network
                ? { hostname: options.network.address, port: options.network.port, ca: options.network.ca }
                : {}),
              servername: "login.microsoftonline.com",
              maxHeaderSize: 16384,
              headers: {
                Host: "login.microsoftonline.com",
                Accept: "application/json",
                "Accept-Encoding": "identity",
                Connection: "close",
              },
            }),
          catch: unavailable,
        }),
        (req) =>
          Effect.sync(() => {
            state.closed = true
            abort.abort()
            state.response?.destroy()
            req.destroy()
            state.socket?.destroy()
          }),
      )
      req.once("socket", (socket) => {
        state.socket = socket
        if (state.closed) socket.destroy()
      })
      return yield* Effect.callback<string, FabricIdentityTokens.Failure>((resume) => {
        const result = { done: false, size: 0, chunks: [] as Buffer[] }
        const fail = () => {
          if (result.done) return
          result.done = true
          resume(Effect.fail(unavailable()))
        }
        req.on("error", fail)
        req.once("response", (incoming) => {
          state.response = incoming
          incoming.on("error", fail)
          incoming.on("aborted", fail)
          if (state.closed) {
            incoming.destroy()
            req.destroy()
            state.socket?.destroy()
            return
          }
          const type = incoming.headers["content-type"]
          const encoding = incoming.headers["content-encoding"]
          const length = incoming.headers["content-length"]
          const headerBytes = incoming.rawHeaders.reduce((size, field) => size + Buffer.byteLength(field) + 2, 0)
          if (
            incoming.statusCode !== 200 ||
            headerBytes > 16384 ||
            typeof type !== "string" ||
            !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type.trim()) ||
            (encoding !== undefined && encoding !== "identity") ||
            (length !== undefined &&
              (!/^[0-9]+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > maximum))
          ) {
            fail()
            return
          }
          incoming.on("data", (chunk: Buffer) => {
            if (result.done) return
            if (result.size + chunk.length > maximum) {
              fail()
              return
            }
            result.size += chunk.length
            result.chunks.push(chunk)
          })
          incoming.once("end", () => {
            if (result.done) return
            if (!incoming.complete || incoming.aborted || (length !== undefined && result.size !== Number(length))) {
              fail()
              return
            }
            result.done = true
            resume(
              Effect.try({
                try: () => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(result.chunks)),
                catch: unavailable,
              }),
            )
          })
        })
        req.end()
      }).pipe(Effect.timeoutOrElse({ duration: options.timeoutMs, orElse: () => Effect.fail(unavailable()) }))
    }),
  )
}

function unavailable() {
  return new FabricIdentityTokens.Failure({ code: "unavailable", message: "Fabric identity discovery is unavailable" })
}
