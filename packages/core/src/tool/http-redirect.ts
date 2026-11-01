export * as HttpRedirect from "./http-redirect"

import { lookup } from "dns/promises"
import { isIP } from "net"
import { Effect, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"

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

export type Reach = "public" | "loopback" | "private" | "link-local"

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

/** Where a host name or address literal points, as far as its text shows. A name is only `localhost` or `*.localhost`. */
export function reach(hostname: string): Reach {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  if (host === "localhost" || host.endsWith(".localhost")) return "loopback"
  if (isIP(host) === 4) {
    const [a = 0, b = 0] = host.split(".").map(Number)
    return reachV4(a, b)
  }
  if (isIP(host) === 6) return reachV6(host)
  return "public"
}

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

function reachV4(a: number, b: number): Reach {
  if (a === 127) return "loopback"
  if (a === 169 && b === 254) return "link-local"
  if (a === 0 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private"
  // Shared address space for carrier-grade NAT.
  if (a === 100 && b >= 64 && b <= 127) return "private"
  return "public"
}

function reachV6(host: string): Reach {
  const groups = expandV6(host)
  if (!groups) return "private"
  const [first = 0] = groups
  const leadingZero = groups.slice(0, 5).every((group) => group === 0)
  if (leadingZero && groups[5] === 0 && groups[6] === 0) return groups[7] === 1 ? "loopback" : "private"
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry an IPv4 address.
  const embedded =
    (leadingZero && (groups[5] === 0xffff || groups[5] === 0)) ||
    (first === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0))
  if (embedded) {
    const high = groups[6] ?? 0
    return reachV4(high >> 8, high & 0xff)
  }
  if ((first & 0xffc0) === 0xfe80) return "link-local"
  if ((first & 0xfe00) === 0xfc00) return "private"
  return "public"
}

function expandV6(host: string) {
  const zone = host.indexOf("%")
  const text = zone === -1 ? host : host.slice(0, zone)
  const [head = "", tail, extra] = text.split("::")
  if (extra !== undefined) return undefined
  const parse = (part: string) => (part === "" ? [] : part.split(":").flatMap(hextets))
  const left = parse(head)
  const right = tail === undefined ? [] : parse(tail)
  const fill = 8 - left.length - right.length
  if (tail === undefined ? left.length !== 8 : fill < 0) return undefined
  return [...left, ...Array.from({ length: tail === undefined ? 0 : fill }, () => 0), ...right]
}

// A trailing dotted quad stands for two hextets.
function hextets(part: string) {
  if (part.includes(".")) {
    const quad = part.split(".").map(Number)
    return [(quad[0]! << 8) | quad[1]!, (quad[2]! << 8) | quad[3]!]
  }
  return [Number.parseInt(part, 16)]
}
