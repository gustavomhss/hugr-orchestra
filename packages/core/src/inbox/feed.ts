import http from "node:http"
import https from "node:https"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { Effect } from "effect"
import { SaxesParser } from "saxes"
import { Failure, retryAfter, validateOptions, type Options } from "../capability/channel/http"

export type FeedEntry = { id: string; title: string; text: string; href?: string }
type FeedResponse = {
  status: "ok" | "not_modified" | "redirect"
  xml?: string
  etag?: string
  modified?: string
  location?: string
}

/** A strict SAX parser: no DTD, entity resolver, HTML rendering, hosted resources or executable content. */
export function parseFeed(xml: string, base: string): FeedEntry[] {
  if (Buffer.byteLength(xml) > 256 * 1024) throw new Failure({ reason: "response_limit" })
  const parser = new SaxesParser({ xmlns: true })
  const stack: string[] = []
  const items: FeedEntry[] = []
  const state: {
    kind?: "rss" | "atom"
    container?: boolean
    item?: { depth: number; id?: string; title?: string; text?: string; href?: string }
    capture?: { name: "id" | "title" | "text" | "href"; depth: number; value: string }
  } = {}
  parser.on("doctype", () => {
    throw new Failure({ reason: "invalid_response" })
  })
  parser.on("error", () => {
    throw new Failure({ reason: "invalid_response" })
  })
  parser.on("opentag", (tag) => {
    stack.push(tag.local)
    if (stack.length > 64) throw new Failure({ reason: "response_limit" })
    if (stack.length === 1) {
      if (tag.local === "rss" && !tag.uri) state.kind = "rss"
      if (tag.local === "feed" && tag.uri === "http://www.w3.org/2005/Atom") state.kind = "atom"
      if (!state.kind) throw new Failure({ reason: "invalid_response" })
      if (state.kind === "atom") state.container = true
    }
    if (state.kind === "rss" && stack.length === 2 && tag.local === "channel" && !tag.uri) {
      if (state.container) throw new Failure({ reason: "invalid_response" })
      state.container = true
    }
    if (
      (state.kind === "rss" && stack.length === 3 && stack[1] === "channel" && tag.local === "item" && !tag.uri) ||
      (state.kind === "atom" &&
        stack.length === 2 &&
        tag.local === "entry" &&
        tag.uri === "http://www.w3.org/2005/Atom")
    ) {
      if (state.item) throw new Failure({ reason: "invalid_response" })
      state.item = { depth: stack.length }
      return
    }
    if (!state.item || stack.length !== state.item.depth + 1) return
    if ((state.kind === "atom" && tag.uri !== "http://www.w3.org/2005/Atom") || (state.kind === "rss" && tag.uri))
      return
    if (state.kind === "atom" && tag.local === "link") {
      const rel = tag.attributes.rel?.value
      if ((!rel || rel === "alternate") && !state.item.href)
        state.item.href = feedLink(tag.attributes.href?.value, base)
      return
    }
    const name =
      (tag.local === "guid" && state.kind === "rss") || (tag.local === "id" && state.kind === "atom")
        ? "id"
        : tag.local === "title"
          ? "title"
          : ["description", "summary", "content"].includes(tag.local)
            ? "text"
            : tag.local === "link" && state.kind === "rss"
              ? "href"
              : undefined
    if (name) state.capture = { name, depth: stack.length, value: "" }
  })
  const text = (value: string) => {
    if (!state.capture) return
    state.capture.value += value
    if (state.capture.value.length > 16_384) throw new Failure({ reason: "response_limit" })
  }
  parser.on("text", text)
  parser.on("cdata", text)
  parser.on("closetag", () => {
    if (state.capture?.depth === stack.length && state.item) {
      const field = state.capture
      if (field.name === "href") state.item.href = feedLink(field.value.trim(), base)
      if (field.name !== "href" && state.item[field.name] === undefined) state.item[field.name] = field.value.trim()
      state.capture = undefined
    }
    if (state.item?.depth === stack.length) {
      const id = state.item.id || (state.kind === "rss" ? state.item.href : undefined)
      if (!id || (!state.item.title && !state.item.text)) throw new Failure({ reason: "invalid_response" })
      if (id.length > 2048) throw new Failure({ reason: "response_limit" })
      items.push({
        id,
        title: state.item.title ?? "",
        text: state.item.text ?? "",
        ...(state.item.href ? { href: state.item.href } : {}),
      })
      if (items.length > 2000) throw new Failure({ reason: "response_limit" })
      state.item = undefined
    }
    stack.pop()
  })
  parser.write(xml).close()
  if (!state.kind || !state.container || stack.length) throw new Failure({ reason: "invalid_response" })
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Failure({ reason: "invalid_response" })
  return items
}

function feedLink(input: string | undefined, base: string) {
  if (!input || !URL.canParse(input, base)) return
  const url = new URL(input, base)
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return
  return url.href
}

/** Only global unicast: reject private, loopback, documentation, multicast, mapped and transition ranges. */
export function isPublicAddress(address: string) {
  if (isIP(address) === 6) {
    const parts = address.toLowerCase().split(":")
    const first = Number.parseInt(parts[0]!, 16)
    const second = Number.parseInt(parts[1] || "0", 16)
    return (
      first >= 0x2000 &&
      first < 0x4000 &&
      first !== 0x2002 &&
      first !== 0x3fff &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
    )
  }
  if (isIP(address) !== 4) return false
  const octets = address.split(".").map(Number)
  const a = octets[0]!
  const b = octets[1]!
  const c = octets[2]!
  return (
    a > 0 &&
    a < 224 &&
    ![10, 127].includes(a) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)) || (b === 88 && c === 99))) &&
    !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) &&
    !(a === 203 && b === 0 && c === 113)
  )
}

function feedUrl(input: string) {
  if (!URL.canParse(input)) throw new Failure({ reason: "invalid_response" })
  const url = new URL(input)
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    /(^|\.)(localhost|local|internal|localdomain)$/i.test(host) ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw new Failure({ reason: "invalid_response" })
  return url
}

export function feedAddress(source: "rss" | "youtube", input: string) {
  if (source === "youtube" && !/^UC[A-Za-z0-9_-]{22}$/.test(input)) throw new Failure({ reason: "invalid_response" })
  return feedUrl(source === "youtube" ? `https://www.youtube.com/feeds/videos.xml?channel_id=${input}` : input).href
}

export const fetchFeed = Effect.fn("InboxFeed.fetch")(function* (
  input: string,
  validators: { etag?: string; modified?: string },
  options: Options = {},
) {
  if (
    !validateOptions(options) ||
    (options.maxResponseBytes ?? 256 * 1024) > 256 * 1024 ||
    [validators.etag, validators.modified].some((value) => value && (value.length > 4096 || /[\r\n]/.test(value)))
  )
    return yield* new Failure({ reason: "invalid_response" })
  const progress = { url: input, seen: new Set<string>() }
  for (const _ of Array.from({ length: 4 })) {
    const url = yield* Effect.try({
      try: () => feedUrl(progress.url),
      catch: () => new Failure({ reason: "invalid_response" }),
    })
    if (progress.seen.has(url.href)) return yield* new Failure({ reason: "redirect" })
    progress.seen.add(url.href)
    const addresses = options.fixtureOrigin
      ? []
      : yield* Effect.tryPromise({
          try: () => lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true }),
          catch: () => new Failure({ reason: "transport" }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: options.timeoutMs ?? 10_000,
            orElse: () => Effect.fail(new Failure({ reason: "timeout" })),
          }),
        )
    if (!options.fixtureOrigin && (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))))
      return yield* new Failure({ reason: "invalid_response" })
    const fixture = options.fixtureOrigin ? new URL(options.fixtureOrigin) : undefined
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        new Promise<FeedResponse>((resolve, reject) => {
          const req = (fixture ? http : https).request(
            {
              hostname: fixture?.hostname ?? addresses[0]!.address,
              port: fixture?.port || 443,
              path: url.pathname + url.search,
              servername: url.hostname,
              method: "GET",
              signal,
              agent: false,
              headers: {
                host: url.host,
                accept: "application/atom+xml, application/rss+xml, application/xml, text/xml",
                "accept-encoding": "identity",
                "user-agent": "Orchestra Inbox Feed Reader",
                ...(validators.etag && progress.seen.size === 1 ? { "if-none-match": validators.etag } : {}),
                ...(validators.modified && progress.seen.size === 1
                  ? { "if-modified-since": validators.modified }
                  : {}),
              },
            },
            (res) => {
              const status = res.statusCode ?? 0
              const etag = typeof res.headers.etag === "string" ? res.headers.etag : undefined
              const modified =
                typeof res.headers["last-modified"] === "string" ? res.headers["last-modified"] : undefined
              if (status === 304 || [301, 302, 303, 307, 308].includes(status)) {
                clearTimeout(timer)
                res.destroy()
                if (status === 304 && (progress.seen.size !== 1 || (!validators.etag && !validators.modified))) {
                  reject(new Failure({ reason: "invalid_response" }))
                  return
                }
                resolve({
                  status: status === 304 ? "not_modified" : "redirect",
                  etag,
                  modified,
                  location: res.headers.location,
                })
                return
              }
              if (status !== 200) {
                clearTimeout(timer)
                res.destroy()
                reject(
                  new Failure({
                    reason: "http",
                    status,
                    ...(status === 429
                      ? { rateLimited: true, retryAfterMs: retryAfter(res.headers["retry-after"]) }
                      : {}),
                  }),
                )
                return
              }
              const chunks: Buffer[] = []
              const body = { bytes: 0 }
              res.on("data", (chunk: Buffer) => {
                body.bytes += chunk.length
                if (body.bytes > (options.maxResponseBytes ?? 256 * 1024)) {
                  clearTimeout(timer)
                  reject(new Failure({ reason: "response_limit" }))
                  res.destroy()
                  return
                }
                chunks.push(chunk)
              })
              res.on("error", () => {
                clearTimeout(timer)
                reject(new Failure({ reason: "transport" }))
              })
              res.on("end", () => {
                clearTimeout(timer)
                Promise.resolve()
                  .then(() => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))
                  .then(
                    (xml) => resolve({ status: "ok", xml, etag, modified }),
                    () => reject(new Failure({ reason: "invalid_response" })),
                  )
              })
            },
          )
          const timer = setTimeout(() => {
            reject(new Failure({ reason: "timeout" }))
            req.destroy()
          }, options.timeoutMs ?? 10_000)
          req.on("error", () => {
            clearTimeout(timer)
            reject(new Failure({ reason: "transport" }))
          })
          req.end()
        }),
      catch: (error) => (error instanceof Failure ? error : new Failure({ reason: "transport" })),
    })
    if (response.status !== "redirect") return response
    if (!response.location || !URL.canParse(response.location, url)) return yield* new Failure({ reason: "redirect" })
    progress.url = new URL(response.location, url).href
  }
  return yield* new Failure({ reason: "redirect" })
})
