import http from "node:http"
import https from "node:https"
import { Buffer } from "node:buffer"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Option, Schema } from "effect"

export class Failure extends Schema.TaggedErrorClass<Failure>()("CapabilityChannel.TransportFailure", {
  reason: Schema.Literals(["timeout", "transport", "response_limit", "invalid_response", "redirect", "http", "provider"]),
  status: Schema.optionalKey(Schema.Number),
  missing: Schema.optionalKey(Schema.Boolean),
}) {}
export type Request = {
  effect?: boolean
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT"
  path: string
  query?: Readonly<Record<string, string | number | boolean | undefined>>
  body?: Schema.Json
}
export type RPC = (input: Request) => Effect.Effect<Schema.Json, Failure | Capability.Failure>
export type Options = { fixtureOrigin?: string; timeoutMs?: number; maxResponseBytes?: number }

/** Only trusted construction may redirect fixed vendor routes to loopback HTTP fixtures. */
export function validateOptions(options: Options) {
  if (options.fixtureOrigin) {
    if (!URL.canParse(options.fixtureOrigin)) return false
    const url = new URL(options.fixtureOrigin)
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") return false
  }
  return [options.timeoutMs ?? 10000, options.maxResponseBytes ?? 256 * 1024].every((n) => Number.isSafeInteger(n) && n > 0) &&
    (options.timeoutMs ?? 10000) <= 60000 && (options.maxResponseBytes ?? 256 * 1024) <= 1024 * 1024
}

export function request(endpoint: string, authorization: string, input: Request, options: Options) {
  return Effect.tryPromise({
    try: (signal) => new Promise<string>((resolve, reject) => {
      const url = new URL(endpoint + input.path)
      Object.entries(input.query ?? {}).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, String(value))
      })
      if (options.fixtureOrigin) {
        const fixture = new URL(options.fixtureOrigin)
        url.protocol = fixture.protocol
        url.host = fixture.host
      }
      const body = input.body === undefined ? undefined : JSON.stringify(input.body)
      const req = (url.protocol === "https:" ? https : http).request(url, {
        method: input.method, signal, agent: false,
        headers: { authorization, accept: "application/json", "accept-encoding": "identity",
          ...(body === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(body) }) },
      })
      const timer = setTimeout(() => req.destroy(new Failure({ reason: "timeout" })), options.timeoutMs ?? 10000)
      req.once("close", () => clearTimeout(timer))
      req.once("error", (error) => reject(error instanceof Failure ? error : new Failure({ reason: "transport" })))
      req.once("response", (response) => {
        const status = response.statusCode ?? 0
        // Node HTTP never follows redirects; reject rather than consuming another origin.
        if (status >= 300 && status < 400) {
          response.destroy()
          reject(new Failure({ reason: "redirect", status }))
          return
        }
        const chunks: Buffer[] = []
        const budget = { bytes: 0 }
        response.on("data", (chunk: Buffer) => {
          budget.bytes += chunk.byteLength
          if (budget.bytes > (options.maxResponseBytes ?? 256 * 1024)) {
            req.destroy(new Failure({ reason: "response_limit" }))
            reject(new Failure({ reason: "response_limit", status }))
            return
          }
          chunks.push(chunk)
        })
        response.once("error", () => reject(new Failure({ reason: "transport", status })))
        response.once("end", () => {
          if (status < 200 || status >= 300) {
            reject(new Failure({ reason: "http", status }))
            return
          }
          resolve(status === 204 ? "null" : Buffer.concat(chunks).toString("utf8"))
        })
      })
      req.end(body)
    }),
    catch: (error) => error instanceof Failure ? error : new Failure({ reason: "transport" }),
  }).pipe(Effect.flatMap((body) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(body)
    if (Option.isNone(parsed)) return Effect.fail(new Failure({ reason: "invalid_response" }))
    const json = Schema.decodeUnknownOption(Schema.Json)(parsed.value)
    return Option.isSome(json) ? Effect.succeed(json.value) : Effect.fail(new Failure({ reason: "invalid_response" }))
  }))
}

export function decode<A>(schema: Schema.Decoder<A, never>, value: unknown): Effect.Effect<A, Failure> {
  const parsed = Schema.decodeUnknownOption(schema)(value)
  return Option.isSome(parsed) ? Effect.succeed(parsed.value) : Effect.fail(new Failure({ reason: "invalid_response" }))
}

/** Evidence projects typed text only: private file URLs and arbitrary provider fields have no slot. */
export function safeText(text: string, secret: string) {
  return text.split(secret).join("[redacted]").replace(/https?:\/\/[^\s<>]+/g, "[url]")
}
