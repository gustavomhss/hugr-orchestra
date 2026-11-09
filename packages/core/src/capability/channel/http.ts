import http from "node:http"
import https from "node:https"
import { Buffer } from "node:buffer"
import { Effect, Option, Schema } from "effect"
import type { CapabilityConnections } from "../connection/index"

export class Failure extends Schema.TaggedErrorClass<Failure>()("CapabilityChannel.TransportFailure", {
  reason: Schema.Literals([
    "timeout",
    "transport",
    "response_limit",
    "invalid_response",
    "redirect",
    "http",
    "provider",
  ]),
  status: Schema.optionalKey(Schema.Number),
  missing: Schema.optionalKey(Schema.Boolean),
  ambiguous: Schema.optionalKey(Schema.Boolean),
  retryAfterMs: Schema.optionalKey(Schema.Number),
  rateLimited: Schema.optionalKey(Schema.Boolean),
}) {}
export type Request = {
  effect?: boolean
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT"
  path: string
  query?: Readonly<Record<string, string | number | boolean | undefined>>
  body?: Schema.Json
  form?: Readonly<Record<string, string>>
  /**
   * Only fixed verifier-descriptor headers reach this (never input-derived). They are spread first, so they cannot
   * replace `authorization`, `accept-encoding`, or the body's `content-type`/`content-length`. A fixed lowercase
   * `accept` may select a provider's JSON API version (for example PagerDuty v2).
   */
  headers?: Readonly<Record<string, string>>
}
export type RPC = (input: Request) => Effect.Effect<Schema.Json, Failure | CapabilityConnections.Error>
export type Options = { fixtureOrigin?: string; timeoutMs?: number; maxResponseBytes?: number }

/** Only trusted construction may redirect fixed vendor routes to loopback HTTP fixtures. */
export function validateOptions(options: Options) {
  if (options.fixtureOrigin) {
    if (!URL.canParse(options.fixtureOrigin)) return false
    const url = new URL(options.fixtureOrigin)
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return false
  }
  return (
    [options.timeoutMs ?? 10000, options.maxResponseBytes ?? 256 * 1024].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) &&
    (options.timeoutMs ?? 10000) <= 60000 &&
    (options.maxResponseBytes ?? 256 * 1024) <= 1024 * 1024
  )
}

export function requestWithMetadata(endpoint: string, authorization: string, input: Request, options: Options) {
  if (input.body !== undefined && input.form !== undefined)
    return Effect.fail(new Failure({ reason: "invalid_response" }))
  return Effect.tryPromise({
    try: (signal) =>
      new Promise<{ text: string; link?: string }>((resolve, reject) => {
        const url = new URL(endpoint + input.path)
        Object.entries(input.query ?? {}).forEach(([key, value]) => {
          if (value !== undefined) url.searchParams.set(key, String(value))
        })
        if (options.fixtureOrigin) {
          const fixture = new URL(options.fixtureOrigin)
          url.protocol = fixture.protocol
          url.host = fixture.host
        }
        const body =
          input.form === undefined
            ? input.body === undefined
              ? undefined
              : JSON.stringify(input.body)
            : new URLSearchParams(input.form).toString()
        const req = (url.protocol === "https:" ? https : http).request(url, {
          method: input.method,
          signal,
          agent: false,
          headers: {
            ...input.headers,
            ...(authorization ? { authorization } : {}),
            accept: input.headers?.accept ?? "application/json",
            "accept-encoding": "identity",
            ...(body === undefined
              ? {}
              : {
                  "content-type": input.form === undefined ? "application/json" : "application/x-www-form-urlencoded",
                  "content-length": Buffer.byteLength(body),
                }),
          },
        })
        const timer = setTimeout(() => {
          reject(new Failure({ reason: "timeout" }))
          req.destroy()
        }, options.timeoutMs ?? 10000)
        const fail = (error: Failure) => {
          clearTimeout(timer)
          reject(error)
        }
        req.once("error", (error) => fail(error instanceof Failure ? error : new Failure({ reason: "transport" })))
        req.once("response", (response) => {
          const status = response.statusCode ?? 0
          // Node HTTP never follows redirects; reject rather than consuming another origin.
          if (status >= 300 && status < 400) {
            fail(new Failure({ reason: "redirect", status }))
            response.destroy()
            return
          }
          const chunks: Buffer[] = []
          const budget = { bytes: 0 }
          response.on("data", (chunk: Buffer) => {
            budget.bytes += chunk.byteLength
            if (budget.bytes > (options.maxResponseBytes ?? 256 * 1024)) {
              fail(new Failure({ reason: "response_limit", status }))
              req.destroy()
              return
            }
            chunks.push(chunk)
          })
          response.once("error", () => fail(new Failure({ reason: "transport", status })))
          response.once("end", () => {
            if (status < 200 || status >= 300) {
              const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(
                Buffer.concat(chunks).toString("utf8"),
              )
              const code = Option.isSome(parsed)
                ? Schema.decodeUnknownOption(Schema.Struct({ code: Schema.Number }))(parsed.value)
                : Option.none()
              const rateLimited =
                status === 429 ||
                (status === 403 &&
                  (response.headers["retry-after"] !== undefined || response.headers["x-ratelimit-remaining"] === "0"))
              const reset = Number(response.headers["x-ratelimit-reset"])
              const retry =
                response.headers["retry-after"] ??
                (Number.isSafeInteger(reset) && reset * 1000 > Date.now()
                  ? String(Math.ceil((reset * 1000 - Date.now()) / 1000))
                  : undefined)
              fail(
                new Failure({
                  reason: "http",
                  status,
                  ...(rateLimited ? { rateLimited: true, retryAfterMs: retryAfter(retry) } : {}),
                  missing: status === 404 && Option.isSome(code) && code.value.code === 10008,
                }),
              )
              return
            }
            clearTimeout(timer)
            resolve({
              text: status === 204 ? "null" : Buffer.concat(chunks).toString("utf8"),
              ...(typeof response.headers.link === "string" ? { link: response.headers.link } : {}),
            })
          })
        })
        req.end(body)
      }),
    catch: (error) => (error instanceof Failure ? error : new Failure({ reason: "transport" })),
  }).pipe(
    Effect.flatMap((response) => {
      const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(response.text)
      if (Option.isNone(parsed)) return Effect.fail(new Failure({ reason: "invalid_response" }))
      const json = Schema.decodeUnknownOption(Schema.Json)(parsed.value)
      return Option.isSome(json)
        ? Effect.succeed({ body: json.value, link: response.link })
        : Effect.fail(new Failure({ reason: "invalid_response" }))
    }),
  )
}

export function request(endpoint: string, authorization: string, input: Request, options: Options) {
  return requestWithMetadata(endpoint, authorization, input, options).pipe(Effect.map((response) => response.body))
}

export function retryAfter(header: string | string[] | undefined) {
  const value = typeof header === "string" ? header : ""
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now()
  return Number.isSafeInteger(delay) && delay > 0 && Number.isSafeInteger(Date.now() + delay) ? delay : 60_000
}

export function decode<A>(schema: Schema.Decoder<A, never>, value: unknown): Effect.Effect<A, Failure> {
  const parsed = Schema.decodeUnknownOption(schema)(value)
  return Option.isSome(parsed) ? Effect.succeed(parsed.value) : Effect.fail(new Failure({ reason: "invalid_response" }))
}

/** Evidence projects typed text only: private file URLs and arbitrary provider fields have no slot. */
export function safeText(text: string, secret: string) {
  return text
    .split(secret)
    .join("[redacted]")
    .replace(/https?:\/\/[^\s<>]+/gi, "[url]")
}
