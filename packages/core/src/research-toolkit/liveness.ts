export * as Liveness from "./liveness"

import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { Effect } from "effect"

// J5.9-J5.11: URL liveness and the domain allow-list. Network reads of the same class as webfetch, run by the host.

export type Status = "LIVE" | "DEAD" | "LIKELY_HALLUCINATED" | "UNKNOWN"
export type Result = { readonly url: string; readonly status: Status; readonly httpStatus?: number; readonly reason: string }

export const USER_AGENT = "Orchestra-Jimmy-LinkCheck/1.0"
export const Limits = Object.freeze({ timeoutMs: 8_000, redirects: 5, parallel: 8, freshMs: 24 * 60 * 60 * 1000 })

export type Options = {
  /** URLs this dispatch saw: retained web-search results and captured `url` sources. Used only to name hallucinations. */
  readonly seen?: readonly string[]
  /** `url` sources already captured successfully; a capture younger than 24 h counts as LIVE with no request. */
  readonly captured?: ReadonlyArray<{ readonly url: string; readonly capturedAt: number }>
  readonly now?: number
  /** Loopback and private addresses are refused (UNKNOWN) so a cited URL cannot probe the host's network. Tests only. */
  readonly privateNetwork?: boolean
}

/** Label-suffix match: `docs.github.com` matches `github.com`, `evilgithub.com` does not. */
export function allowed(url: string, domains: readonly string[] | "unrestricted") {
  if (domains === "unrestricted") return true
  const host = hostname(url)
  if (!host) return false
  return domains.some((entry) => {
    const domain = entry.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "")
    return domain !== "" && (host === domain || host.endsWith(`.${domain}`))
  })
}

export function hostname(url: string) {
  if (!URL.canParse(url)) return undefined
  return new URL(url).hostname.toLowerCase().replace(/\.$/, "")
}

/** Identity used to compare cited URLs with captured ones: no fragment, no trailing slash. */
export function normal(url: string) {
  if (!URL.canParse(url)) return url
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`
}

export const check = (urls: readonly string[], options: Options = {}) => Effect.promise(async () => {
  const now = options.now ?? Date.now()
  const seen = new Set((options.seen ?? []).map(normal))
  const fresh = new Set((options.captured ?? []).filter((item) => now - item.capturedAt < Limits.freshMs).map((item) => normal(item.url)))
  const unique = [...new Set(urls)]
  const results = new Map<string, Result>()
  const queue = unique.filter((url) => {
    if (!fresh.has(normal(url))) return true
    results.set(url, { url, status: "LIVE", reason: "captured in this dispatch less than 24 h ago" })
    return false
  })
  // A bounded pool: at most `parallel` requests in flight.
  const workers = Array.from({ length: Math.min(Limits.parallel, queue.length) }, async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      const outcome = await probe(url, options.privateNetwork === true)
      const status = outcome.status === "DEAD" && !seen.has(normal(url)) ? "LIKELY_HALLUCINATED" : outcome.status
      results.set(url, { ...outcome, status })
    }
  })
  await Promise.all(workers)
  return unique.map((url) => results.get(url)!)
})

type Outcome = Omit<Result, "url">

async function probe(start: string, privateNetwork: boolean): Promise<Outcome> {
  let current = start
  for (let hop = 0; hop <= Limits.redirects; hop++) {
    if (!URL.canParse(current)) return { status: "DEAD", reason: "malformed URL" }
    const target = new URL(current)
    if (target.protocol !== "http:" && target.protocol !== "https:") return { status: "UNKNOWN", reason: `scheme ${target.protocol} not checked` }
    const refused = await refusal(target.hostname, privateNetwork)
    if (refused) return refused
    const response = await request(current, "HEAD").then((head) => head.status >= 400 ? request(current, "GET") : head)
    if ("error" in response) return response.error
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) return { status: "DEAD", httpStatus: response.status, reason: "redirect without a location" }
      current = new URL(location, current).href
      continue
    }
    if (response.status >= 200 && response.status < 300) return { status: "LIVE", httpStatus: response.status, reason: "reachable" }
    // A rate limit says nothing about whether the page exists.
    if (response.status === 429) return { status: "UNKNOWN", httpStatus: 429, reason: "rate limited" }
    return { status: "DEAD", httpStatus: response.status, reason: `HTTP ${response.status}` }
  }
  return { status: "DEAD", reason: `more than ${Limits.redirects} redirects` }
}

/** HEAD first; the caller retries with a one-byte ranged GET for servers that reject HEAD. */
async function request(url: string, method: "HEAD" | "GET") {
  const headers: Record<string, string> = { "user-agent": USER_AGENT, ...(method === "GET" ? { range: "bytes=0-0" } : {}) }
  try {
    const response = await fetch(url, { method, headers, redirect: "manual", signal: AbortSignal.timeout(Limits.timeoutMs) })
    await response.body?.cancel()
    return response
  } catch (error) {
    const name = error instanceof Error ? error.name : ""
    if (name === "TimeoutError" || name === "AbortError") return { status: 0, headers: new Headers(), error: { status: "UNKNOWN", reason: "timeout" } as Outcome }
    return { status: 0, headers: new Headers(), error: { status: "DEAD", reason: `connection failed: ${error instanceof Error ? error.message : String(error)}` } as Outcome }
  }
}

async function refusal(host: string, privateNetwork: boolean): Promise<Outcome | undefined> {
  const name = host.replace(/^\[|\]$/g, "").toLowerCase()
  if (!privateNetwork && /(^|\.)(localhost|local|internal|localdomain)$/.test(name)) return { status: "UNKNOWN", reason: "local host refused by policy" }
  const addresses = isIP(name) ? [name] : await lookup(name, { all: true }).then((list) => list.map((item) => item.address), (error: NodeJS.ErrnoException) => error)
  if (addresses instanceof Error) return { status: addresses.code === "EAI_AGAIN" ? "UNKNOWN" : "DEAD", reason: `DNS ${addresses.code ?? "failure"}` }
  if (!privateNetwork && addresses.some(isPrivate)) return { status: "UNKNOWN", reason: "private address refused by policy" }
}

function isPrivate(address: string) {
  const lower = address.toLowerCase()
  if (lower.startsWith("::ffff:")) return isPrivate(lower.slice(7))
  if (isIP(lower) === 6) return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)
  const [a, b] = lower.split(".").map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}
