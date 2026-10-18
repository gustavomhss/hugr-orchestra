export * as ActionsResponse from "./response"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCli } from "./cli"

const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Json)))

export const http = Effect.fn("ActionsTransport.httpResponse")(function* (provider: Actions.Provider, status: number, headers: Record<string, string>, body: Buffer) {
  if (status >= 300 && status < 400)
    return yield* ActionsCli.error(provider, "host_mismatch", "Authenticated GitLab redirects require explicit credential-free transfer")
  const text = yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(body),
    catch: () => ActionsCli.error(provider, "transport_failed", "GitLab metadata is not valid UTF-8"),
  })
  const data = json(text)
  if (status < 200 || status > 299) return yield* failure(provider, 1, Buffer.alloc(0), status, headers, Option.isSome(data))
  if ([201, 202, 204].includes(status) && !text.trim()) return { status, headers, data: null }
  if (Option.isNone(data)) return yield* ActionsCli.error(provider, "transport_failed", "GitLab response is not valid JSON metadata")
  return { status, headers, data: data.value }
})

export const parse = Effect.fn("ActionsTransport.response")(function* (
  provider: Actions.Provider,
  result: { stdout: Buffer; stderr: Buffer; exitCode: number },
): Effect.fn.Return<ActionsContract.Response, ActionsError> {
  const text = result.stdout.toString("utf8")
  const boundary = /\r?\n\r?\n/.exec(text)
  const status = /^HTTP\/\d+(?:\.\d+)? (\d{3})(?: [^\r\n]*)?\r?\n/.exec(text)
  if (!boundary || !status) {
    if (result.exitCode !== 0) return yield* failure(provider, result.exitCode, result.stderr)
    return yield* ActionsCli.error(provider, "transport_failed", "CLI response is missing HTTP status or headers")
  }
  const lines = text.slice(status[0].length, boundary.index).split(/\r?\n/).filter(Boolean)
  if (lines.some((line) => !/^[!#$%&'*+.^_`|~\w-]+:[^\r\n]*$/.test(line)))
    return yield* ActionsCli.error(provider, "transport_failed", "CLI response has invalid HTTP headers")
  const headers = Object.fromEntries(lines.reduce((headers, line) => {
    const index = line.indexOf(":")
    const key = line.slice(0, index).toLowerCase()
    const value = line.slice(index + 1).trim()
    headers.set(key, headers.has(key) ? `${headers.get(key)}, ${value}` : value)
    return headers
  }, new Map<string, string>()))
  const code = Number(status[1])
  const body = text.slice(boundary.index + boundary[0].length)
  const data = json(body)
  if (code < 200 || code > 299 || result.exitCode !== 0)
    return yield* failure(provider, result.exitCode, result.stderr, code, headers, Option.isSome(data))
  if ([201, 202, 204].includes(code) && !body.trim()) return { status: code, headers, data: null }
  if (Option.isNone(data)) return yield* ActionsCli.error(provider, "transport_failed", "CLI response is not valid JSON metadata")
  return { status: code, headers, data: data.value }
})

export function failure(provider: Actions.Provider, exitCode: number, stderr: Buffer, status?: number, headers: Record<string, string> = {}, complete = false) {
  const code = status ?? Number(/\bHTTP[ :]+(\d{3})\b/i.exec(stderr.toString("utf8"))?.[1])
  const retry = headers["retry-after"]
  const seconds = retry && /^\d+$/.test(retry) ? Number(retry)
    : retry ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
    : headers["x-ratelimit-remaining"] === "0" && /^\d+$/.test(headers["x-ratelimit-reset"] ?? "")
      ? Math.max(0, Number(headers["x-ratelimit-reset"]) - Math.floor(Date.now() / 1000)) : undefined
  const kind = code === 429 || (code === 403 && (retry !== undefined || headers["x-ratelimit-remaining"] === "0"))
    ? "rate_limited" : code === 401 ? "not_authenticated" : code === 403 ? "permission_denied" : code === 404 ? "not_found"
      : (provider.kind === "github" && exitCode === 4) || /auth login|not logged in|not authenticated|login first|invalid token/i.test(stderr.toString("utf8"))
        ? "not_authenticated" : "transport_failed"
  // Provider diagnostics can echo submitted secrets. Only classifications leave this boundary.
  return new ActionsError({
    kind, provider: provider.kind, message: `Provider request failed${code ? ` (HTTP ${code})` : ""}`,
    retryAfter: seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined,
    // Require complete bounded JSON and a normal CLI HTTP-error exit. Partial
    // output, stderr HTTP hints and exit codes alone cannot prove rejection.
    disposition: complete && (exitCode === 0 || exitCode === 1) && status !== undefined && [400, 401, 403, 404, 409, 422, 429].includes(status)
      ? "definitely_rejected" : "unknown",
  })
}
