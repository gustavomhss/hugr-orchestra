import { Buffer } from "node:buffer"
import { Capability } from "@orchestra/schema/capability"
import { Effect } from "effect"
import type { Schema } from "effect"
import { encode, failure, message, parse } from "./protocol"

export type Budget = { bytes: number; limit: number; messages: number }
export type Connection = {
  endpoint: string
  authorization: string
  version?: string
  sessionID?: string
  expiresAt?: number
  lifetime: AbortController
  closed: boolean
  dead: boolean
}
export type Limits = { requestBytes: number; maxMessages: number }

/** One POST, no redirects/retries. The caller owns the total deadline across all POSTs/pages. */
export function request(connection: Connection, body: Schema.Json, id: number | undefined, budget: Budget, limits: Limits) {
  return Effect.tryPromise({
    try: async (signal) => {
      if (connection.closed || connection.dead) throw failure("connection_unavailable", "closed session")
      if (connection.expiresAt !== undefined && connection.expiresAt <= Date.now())
        throw failure("authentication_required", "credential expiry")
      const budgetStart = budget.bytes
      const encoded = encode(body, limits.requestBytes)
      const controller = new AbortController()
      try {
        const response = await fetch(connection.endpoint, { method: "POST", headers: headers(connection),
          body: encoded, redirect: "manual", signal: AbortSignal.any([signal, controller.signal, connection.lifetime.signal]) })
        checkStatus(response, connection)
        if (id !== undefined && !connection.version) {
          const sessionID = response.headers.get("mcp-session-id")
          if (sessionID !== null) {
            if (!/^[\x21-\x7e]{1,256}(?![\s\S])/.test(sessionID)) throw failure("acquisition_failed", "session header")
            connection.sessionID = sessionID
          }
        }
        checkSession(response, connection)
        if (id === undefined) {
          await read(response, budget)
          if (response.status !== 202 || budget.bytes !== budgetStart) throw failure("acquisition_failed", "notification acknowledgement")
          return null
        }
        const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
        if (type === "application/json") {
          const decoded = message(parse(await read(response, budget)), id)
          if (decoded.kind !== "response") throw failure("acquisition_failed", "response required")
          return decoded.result
        }
        if (type !== "text/event-stream") throw failure("acquisition_failed", "content type")
        return await stream(response, id, budget, limits, async (body) => {
          if (connection.expiresAt !== undefined && connection.expiresAt <= Date.now())
            throw failure("authentication_required", "credential expiry")
          const reply = await fetch(connection.endpoint, { method: "POST", headers: headers(connection),
            body: encode(body, limits.requestBytes), redirect: "manual", signal: AbortSignal.any([signal, controller.signal, connection.lifetime.signal]) })
          checkStatus(reply, connection)
          checkSession(reply, connection)
          const before = budget.bytes
          await read(reply, budget)
          if (reply.status !== 202 || before !== budget.bytes) throw failure("acquisition_failed", "response acknowledgement")
        })
      } finally { controller.abort() }
    },
    catch: (error): unknown => error,
  }).pipe(Effect.catch((error) => Effect.suspend(() => Effect.fail(transportFailure(error)))))
}

export function close(connection: Connection, limits: Limits, timeoutMs: number) {
  return Effect.suspend(() => {
    connection.closed = true
    connection.lifetime.abort()
    if (!connection.sessionID || connection.expiresAt !== undefined && connection.expiresAt <= Date.now()) return Effect.void
    return Effect.tryPromise({
      try: async (signal) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 1000))
        try {
          const response = await fetch(connection.endpoint, { method: "DELETE", headers: headers(connection),
            redirect: "manual", signal: AbortSignal.any([signal, controller.signal]) })
          await read(response, { bytes: 0, limit: limits.requestBytes, messages: 0 })
        } finally { controller.abort(); clearTimeout(timer) }
      }, catch: (error): unknown => error,
    }).pipe(Effect.catch((error) => Effect.sync(() => { transportFailure(error) })))
  })
}

function headers(connection: Connection) {
  return { authorization: connection.authorization, accept: "application/json, text/event-stream", "content-type": "application/json",
    ...(connection.version === undefined ? {} : { "mcp-protocol-version": connection.version }),
    ...(connection.sessionID === undefined ? {} : { "mcp-session-id": connection.sessionID }) }
}

function checkStatus(response: Response, connection: Connection) {
  if (response.ok) return
  if (response.status === 404) connection.dead = true
  throw failure(response.status === 401 ? "authentication_required" : response.status === 403 ? "target_denied"
    : response.status === 404 ? "connection_unavailable" : "acquisition_failed", "HTTP status")
}

function checkSession(response: Response, connection: Connection) {
  const assigned = response.headers.get("mcp-session-id")
  if (assigned !== null && assigned !== connection.sessionID)
    throw failure("acquisition_failed", "session changed")
}

function count(budget: Budget, bytes: number) {
  if (bytes > budget.limit - budget.bytes) throw failure("quota_exceeded", "response bytes")
  budget.bytes += bytes
}

function declared(response: Response, budget: Budget) {
  const length = response.headers.get("content-length")
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > budget.limit - budget.bytes))
    throw failure("quota_exceeded", "response bytes")
}

async function read(response: Response, budget: Budget) {
  declared(response, budget)
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  const total = { bytes: 0 }
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      count(budget, next.value.byteLength)
      chunks.push(next.value)
      total.bytes += next.value.byteLength
    }
    return utf8(() => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total.bytes)))
  } finally {
    try { await reader.cancel().catch((error: unknown) => { transportFailure(error) }) }
    finally { reader.releaseLock() }
  }
}

/** Incremental SSE line parser: CR, LF, CRLF, split UTF-8, BOM, comments and multiline data. */
async function stream(response: Response, id: number, budget: Budget, limits: Limits,
  respond: (body: Schema.Json) => Promise<void>) {
  declared(response, budget)
  if (!response.body) throw failure("acquisition_failed", "disconnected")
  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const state: { line: string; data: string[]; cr: boolean; result?: Schema.Json; complete: boolean } = {
    line: "", data: [], cr: false, complete: false,
  }
  const line = async () => {
    const text = state.line
    state.line = ""
    if (text === "") {
      const data = state.data.join("\n")
      state.data = []
      if (!data) return // Empty priming events are legal; no reconnect is attempted.
      if (++budget.messages > limits.maxMessages) throw failure("quota_exceeded", "messages")
      const decoded = message(parse(data), id)
      if (decoded.kind === "notification") return
      if (decoded.kind === "request") {
        await respond({ jsonrpc: "2.0", id: decoded.id, ...(decoded.method === "ping" ? { result: {} }
          : { error: { code: -32601, message: "Method not found" } }) })
        return
      }
      if (state.complete) throw failure("acquisition_failed", "duplicate response")
      state.result = decoded.result
      state.complete = true
      return
    }
    if (text.startsWith(":")) return
    const colon = text.indexOf(":")
    const field = colon === -1 ? text : text.slice(0, colon)
    const value = colon === -1 ? "" : text.slice(colon + 1).replace(/^ /, "")
    if (field === "data") state.data.push(value)
  }
  const feed = async (text: string) => {
    for (const character of text) {
      if (state.cr && character === "\n") { state.cr = false; continue }
      state.cr = character === "\r"
      if (character === "\r" || character === "\n") { await line(); continue }
      state.line += character
    }
  }
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        await feed(utf8(() => decoder.decode()))
        if (state.complete) return state.result ?? null
        throw failure("acquisition_failed", "disconnected")
      }
      count(budget, next.value.byteLength) // Before decoding, accumulating lines or parsing JSON.
      await feed(utf8(() => decoder.decode(next.value, { stream: true })))
      if (state.complete) return state.result ?? null
    }
  } finally {
    try { await reader.cancel().catch((error: unknown) => { transportFailure(error) }) }
    finally { reader.releaseLock() }
  }
}

function utf8(read: () => string) {
  try { return read() }
  catch (error) {
    if (error instanceof TypeError && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA")
      throw failure("acquisition_failed", "UTF-8")
    throw error
  }
}

function transportFailure(error: unknown): Capability.Failure {
  if (error instanceof Capability.Failure) return error
  if (error instanceof DOMException && ["AbortError", "TimeoutError", "NetworkError"].includes(error.name)) return failure()
  const codes = ["ConnectionRefused", "ConnectionClosed", "ConnectionReset", "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT",
    "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"]
  if (error instanceof Error && "code" in error && typeof error.code === "string" && codes.includes(error.code)) return failure()
  if (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message) && error.cause instanceof Error)
    return transportFailure(error.cause)
  throw error
}
