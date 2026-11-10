export * as HttpGuardedClient from "./http-guarded-client"

import { lookup as dnsLookup } from "dns/promises"
import http from "node:http"
import https from "node:https"
import { isIP } from "node:net"
import { Context, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import * as HttpClientError from "effect/unstable/http/HttpClientError"
import { makeGlobalNode } from "./app-node"
import { reach, type Reach } from "../tool/http-reach"

export type HopPolicy = Reach | "direct"

export interface Resolution {
  readonly address: string
  readonly family: 4 | 6
}

export type LookupAll = (hostname: string) => Promise<ReadonlyArray<Resolution>>

const defaultLookup: LookupAll = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4,
  }))

/**
 * Picks the one address the socket will actually dial, from the addresses returned at connect time (never from a
 * separate preflight). `direct` (the initial fetch) keeps the caller's permission semantics; redirect hops refuse
 * link-local always and non-public from a public origin. Mixed answers keep only allowed addresses.
 */
export function selectApprovedAddress(
  hostname: string,
  fromReach: HopPolicy,
  addresses: ReadonlyArray<Resolution>,
): { readonly ok: true; readonly address: string } | { readonly ok: false; readonly reason: string } {
  const clean = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  const literal = isIP(clean)
  const candidates = literal !== 0 ? [{ address: clean, family: literal }] : addresses
  if (candidates.length === 0) return { ok: false, reason: "the host does not resolve" }
  if (fromReach === "direct") return { ok: true, address: candidates[0]!.address }
  const reaches = candidates.map((entry) => reach(entry.address))
  if (reaches.includes("link-local")) {
    return { ok: false, reason: "the target is a link-local address" }
  }
  const worst = (["loopback", "private"] as const).find((value) => reaches.includes(value)) ?? "public"
  if (fromReach === "public" && worst !== "public") {
    return { ok: false, reason: `a public host may not redirect to a ${worst} address` }
  }
  const approved = candidates.filter((entry) => {
    const entryReach = reach(entry.address)
    return !(fromReach === "public" && entryReach !== "public")
  })
  if (approved.length === 0) return { ok: false, reason: "no address is allowed for this origin" }
  return { ok: true, address: approved[0]!.address }
}

export interface GuardedSessionDeps {
  readonly lookup?: LookupAll | undefined
  /**
   * Test seam: replaces the pinned client wholesale. Production callers never pass this; a caller-supplied client
   * carries no dial-time guarantee, by construction.
   */
  readonly client?: HttpClient.HttpClient | undefined
}

function encodeBody(request: HttpClientRequest.HttpClientRequest): Uint8Array | string | undefined {
  // WebFetch and skill downloads are GETs with no body; other body kinds are encoded as text if they carry any.
  const body = request.body as { readonly _tag: string; readonly body?: unknown }
  if (body._tag === "Empty") return undefined
  if (body.body instanceof Uint8Array) return body.body
  if (typeof body.body === "string") return body.body
  return undefined
}

/**
 * An HttpClient that dials through node:http/https with a per-request `lookup`. The lookup re-resolves the hostname
 * at connect time and returns only approved addresses for the current hop policy, so the check and the dial are the
 * same resolution. URL, Host and (via `servername`) TLS SNI stay at the original hostname; the raw socket is the
 * only thing bound to the approved address. TLS verification still uses the hostname (not the IP).
 */
/**
 * The guarded client never buffers more than this. WebFetch applies its own 5 MiB limit downstream of the response,
 * and the transport refuses to accept a body larger than the cap so a chunked response cannot allocate beyond it.
 */
export const GUARDED_RESPONSE_MAX_BYTES = 5 * 1024 * 1024

export function makePinnedClient(
  currentFromReach: () => HopPolicy,
  lookup: LookupAll = defaultLookup,
  maxBytes: number = GUARDED_RESPONSE_MAX_BYTES,
  closeBag?: Set<import("node:http").ClientRequest>,
) {
  return HttpClient.make((request, url) =>
    Effect.callback((resume) => {
      const pinnedLookup = (hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        void (async () => {
          try {
            const addresses = await lookup(hostname)
            const selected = selectApprovedAddress(hostname, currentFromReach(), addresses)
            if (!selected.ok) return callback(new Error(selected.reason))
            if (options.all) return callback(null, [{ address: selected.address, family: isIP(selected.address) }])
            return callback(null, selected.address, isIP(selected.address))
          } catch (error) {
            return callback(error instanceof Error ? error : new Error(String(error)))
          }
        })()
      }
      const body = encodeBody(request)
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value.join(", ") : value
      if (body !== undefined && body.length > 0 && headers["content-length"] === undefined) {
        headers["content-length"] = String(body.length)
      }
      const transport = url.protocol === "https:" ? https : http
      const req = transport.request(
        {
          host: url.hostname,
          port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
          path: `${url.pathname}${url.search}${url.hash}`,
          method: request.method,
          headers,
          lookup: pinnedLookup as never,
          // Keep the URL hostname as SNI/Host; the socket addresses come only from the pinned lookup.
          servername: url.hostname,
          rejectUnauthorized: true,
        },
        (response) => {
          const chunks: Buffer[] = []
          let received = 0
          // Some runtimes emit string chunks for HTTP responses; normalize before concat.
          response.on("data", (chunk: Buffer | string) => {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            if (received + buf.byteLength > maxBytes) {
              // Destroy the socket and refuse the rest instead of allocating past the cap. WebFetch's own cap is
              // applied downstream; this bound is the transport's own guard, before any buffering happens.
              response.destroy()
              req.destroy()
              resume(
                Effect.fail(
                  new HttpClientError.HttpClientError({
                    reason: new HttpClientError.TransportError({ request, cause: new Error("the response body exceeds the limit") }),
                  }),
                ),
              )
              return
            }
            chunks.push(buf)
            received += buf.byteLength
          })
          response.on("end", () => {
            const data = Buffer.concat(chunks)
            void resume(
              Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  new Response(data, {
                    status: response.statusCode ?? 0,
                    headers: Object.fromEntries(
                      Object.entries(response.headers).flatMap(([key, value]) =>
                        value === undefined ? [] : [[key, Array.isArray(value) ? value.join(", ") : value]] as const
                      ),
                    ),
                  }),
                ),
              ),
            )
          })
          response.on("error", (error) => resume(Effect.fail(new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({ request, cause: error }),
          }))))
        },
      )
      req.on("error", (error) => {
        resume(Effect.fail(new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause: error }),
        })))
      })
      if (body !== undefined && body.length > 0) req.write(body)
      req.end()
      closeBag?.add(req)
      return Effect.sync(() => {
        req.destroy()
        closeBag?.delete(req)
      })
    })
  )
}

export interface GuardedSession {
  readonly setPolicy: (fromReach: HopPolicy) => void
  readonly client: HttpClient.HttpClient
  readonly close: Effect.Effect<void>
}

/**
 * One guarded session per redirect-following execution. The hop policy is installed immediately before each execute;
 * hops are sequential and the socket is dialed before the next policy is installed. Callers must run this inside a
 * scope and keep the scope open until the response body is consumed.
 */
export function makeSessionValue(deps: GuardedSessionDeps = {}): GuardedSession {
  let fromReach: HopPolicy = "direct"
  const openRequests = new Set<import("node:http").ClientRequest>()
  return {
    setPolicy: (next: HopPolicy) => {
      fromReach = next
    },
    client: deps.client ?? makePinnedClient(() => fromReach, deps.lookup ?? defaultLookup, GUARDED_RESPONSE_MAX_BYTES, openRequests),
    // Destroy every still-open request. The session is scoped to one execution; this aborts in-flight sockets so a
    // cancelled or timed-out fetch does not keep a response streaming into a closed page.
    close: deps.client
      ? Effect.void
      : Effect.sync(() => {
          for (const req of openRequests) req.destroy()
          openRequests.clear()
        }),
  }
}

export const makeGuardedSession = (deps: GuardedSessionDeps = {}) => Effect.sync(() => makeSessionValue(deps))

/**
 * The guarded-transport seam: production resolves a pinned session per execution; tests replace this node with a
 * fake client session (see `tool-webfetch.test.ts`), which never performs I/O beyond the test double.
 */
export class GuardedFetch extends Context.Service<GuardedFetch, {
  readonly makeSession: (deps?: GuardedSessionDeps) => GuardedSession
}>()("@orchestra/v2/GuardedFetch") {}

export const layer = Layer.succeed(
  GuardedFetch,
  GuardedFetch.of({ makeSession: (deps) => makeSessionValue(deps) }),
)

export const node = makeGlobalNode({ service: GuardedFetch, layer, deps: [] })
