export * as HttpRedirect from "./http-redirect"

import { lookup } from "dns/promises"
import { isIP } from "net"
import { Effect, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { HttpGuardedClient } from "../effect/http-guarded-client"
import { reach, type Reach } from "./http-reach"

export const MAX_HOPS = 5

export class Blocked extends Schema.TaggedErrorClass<Blocked>()("HttpRedirect.Blocked", {
  from: Schema.String,
  to: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `Redirect from ${this.from} to ${this.to} refused: ${this.reason}`
  }
}

export class TooManyRedirects extends Schema.TaggedErrorClass<TooManyRedirects>()("HttpRedirect.TooManyRedirects", {
  url: Schema.String,
  limit: Schema.Number,
}) {
  override get message() {
    return `Stopped after ${this.limit} redirects at ${this.url}`
  }
}

/** The refusals a caller reports to the model by name; every other failure stays a generic transport error. */
export const isRefusal = (error: unknown): error is Blocked | TooManyRedirects =>
  error instanceof Blocked || error instanceof TooManyRedirects

export type { Reach } from "./http-reach"
export { reach } from "./http-reach"

const statuses = new Set([301, 302, 303, 307, 308])
// Credentials never travel to another origin.
const sensitiveHeaders = new Set(["authorization", "cookie", "proxy-authorization"])

/**
 * Follows redirects by hand, because a fetch that follows them itself lets an approved public page send the request
 * to loopback, link-local or private addresses (a cloud metadata endpoint, a local admin port) with no chance to
 * look. The transport is asked not to follow (`redirect: "manual"`); a client that is not fetch-based never follows
 * either, so a test double behaves the same.
 *
 * - At most `maxHops` redirects, then `TooManyRedirects`.
 * - A redirect to an origin not seen yet goes through `approve` first (the permission check the first URL got).
 *   Without `approve` it is allowed, for callers whose source URL the user chose and who only need the address guard.
 * - A redirect from a public host to a loopback, private or link-local address is `Blocked`, and a redirect to a
 *   link-local address (metadata endpoints) is `Blocked` from anywhere. Fetching a local address directly, or from
 *   another local address, stays the caller's permission decision. Names are resolved, so a public-looking hostname
 *   that points at a local address is caught. The check cannot bind the address the connection later uses, so a DNS
 *   answer that changes between the check and the connect is not covered.
 *
 * The response is returned as is: the caller still filters its status.
 */
export const follow = <E = never, R = never>(
  http: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  options: {
    readonly maxHops?: number | undefined
    readonly approve?: ((url: URL) => Effect.Effect<void, E, R>) | undefined
  } = {},
) =>
  Effect.gen(function* () {
    const limit = options.maxHops ?? MAX_HOPS
    const approved = new Set([new URL(request.url).origin])
    let current = request
    for (let hop = 0; ; hop++) {
      const response = yield* http
        .execute(current)
        .pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }))
      const location = response.headers["location"]
      if (!statuses.has(response.status) || !location) return response

      const from = new URL(current.url)
      if (hop >= limit) return yield* new TooManyRedirects({ url: shown(from), limit })
      if (!URL.canParse(location, from)) {
        return yield* new Blocked({ from: shown(from), to: "an invalid location", reason: "the address does not parse" })
      }
      const to = new URL(location, from)
      if (to.protocol !== "http:" && to.protocol !== "https:") {
        return yield* new Blocked({ from: shown(from), to: shown(to), reason: "the target is not http or https" })
      }
      yield* guard(from, to)
      if (!approved.has(to.origin)) {
        if (options.approve) yield* options.approve(to)
        approved.add(to.origin)
      }
      current = HttpClientRequest.get(to.href, {
        headers:
          to.origin === from.origin
            ? current.headers
            : Object.fromEntries(Object.entries(current.headers).filter(([key]) => !sensitiveHeaders.has(key.toLowerCase()))),
      })
    }
  })

/**
 * Like `follow`, but every hop dials through a guarded native HTTP client whose lookup resolves and validates the
 * target at connect time (see `HttpGuardedClient`). The preflight guard remains as early refusal; the connector is
 * the enforcement, so a DNS answer that changes between the check and the connect cannot smuggle a refused address.
 * Requires a `Scope`: the guarded HTTP client lives until the caller consumes the body inside the scope. The initial request
 * keeps the caller's permission semantics (direct local fetch allowed); only redirect hops get the from-public rule.
 */
export const followGuarded = <E = never, R = never>(
  request: HttpClientRequest.HttpClientRequest,
  options: {
    readonly maxHops?: number | undefined
    readonly approve?: ((url: URL) => Effect.Effect<void, E, R>) | undefined
    readonly deps?: HttpGuardedClient.GuardedSessionDeps | undefined
    readonly session?: HttpGuardedClient.GuardedSession | undefined
  } = {},
) =>
  Effect.gen(function* () {
    const limit = options.maxHops ?? MAX_HOPS
    const approved = new Set([new URL(request.url).origin])
    // A caller-supplied session owns its lifecycle (the webfetch tool closes it after collecting the body); an
    // internally created session is finalized by this scope.
    const session = options.session ?? (yield* HttpGuardedClient.makeGuardedSession(options.deps))
    if (options.session === undefined) yield* Effect.addFinalizer(() => session.close)
    let current = request
    // The dial-time policy for a hop is the reach of the host that issued the redirect (the previous hop's
    // hostname); the first hop is a direct fetch and keeps the caller's permission semantics.
    let previousHostname: string | undefined
    for (let hop = 0; ; hop++) {
      session.setPolicy(hop === 0 || previousHostname === undefined ? "direct" : reach(previousHostname))
      const response = yield* session.client.execute(current)
      previousHostname = new URL(current.url).hostname
      const location = response.headers["location"]
      if (!statuses.has(response.status) || !location) return response

      const from = new URL(current.url)
      if (hop >= limit) return yield* new TooManyRedirects({ url: shown(from), limit })
      if (!URL.canParse(location, from)) {
        return yield* new Blocked({ from: shown(from), to: "an invalid location", reason: "the address does not parse" })
      }
      const to = new URL(location, from)
      if (to.protocol !== "http:" && to.protocol !== "https:") {
        return yield* new Blocked({ from: shown(from), to: shown(to), reason: "the target is not http or https" })
      }
      yield* guard(from, to)
      if (!approved.has(to.origin)) {
        if (options.approve) yield* options.approve(to)
        approved.add(to.origin)
      }
      current = HttpClientRequest.get(to.href, {
        headers:
          to.origin === from.origin
            ? current.headers
            : Object.fromEntries(Object.entries(current.headers).filter(([key]) => !sensitiveHeaders.has(key.toLowerCase()))),
      })
    }
  })

const shown = (url: URL) => `${url.protocol}//${url.host}${url.pathname}`

const guard = (from: URL, to: URL) =>
  Effect.gen(function* () {
    const target = yield* resolved(to.hostname)
    if (target === "link-local") {
      return yield* new Blocked({ from: shown(from), to: shown(to), reason: "the target is a link-local address" })
    }
    if (target !== "public" && reach(from.hostname) === "public") {
      return yield* new Blocked({
        from: shown(from),
        to: shown(to),
        reason: `a public host may not redirect to a ${target} address`,
      })
    }
  })

// The worst reach among the addresses a name resolves to; a name that does not resolve fails later, in the fetch.
const resolved = Effect.fnUntraced(function* (hostname: string) {
  const literal = reach(hostname)
  if (literal !== "public" || isIP(hostname.replace(/^\[|\]$/g, "")) !== 0) return literal
  const addresses = yield* Effect.tryPromise({ try: () => lookup(hostname, { all: true }), catch: () => undefined }).pipe(
    Effect.orElseSucceed(() => []),
  )
  const reaches = addresses.map((entry) => reach(entry.address))
  return (["link-local", "loopback", "private"] as const).find((value) => reaches.includes(value)) ?? "public"
})
