import { Buffer } from "node:buffer"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { matchesMime } from "../artifact/mime"
import { failure } from "./schema"

export type Budgets = { responseBytes: number; downloadBytes: number; timeoutMillis: number; pixels: number }
export const defaults: Budgets = { responseBytes: 48 * 1024 * 1024, downloadBytes: 16 * 1024 * 1024,
  timeoutMillis: 180000, pixels: 8294400 }
export const outboundBytes = 32 * 1024 * 1024

/** Covers headers AND body. No redirects, retries, raw HTTP errors or URLs escape this boundary. */
export function request(url: string, init: RequestInit, limit: number, timeoutMillis: number, requestLimit = outboundBytes) {
  return Effect.gen(function* () {
    yield* outbound(init.body, requestLimit)
    return yield* Effect.tryPromise({
      try: async (signal) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMillis)
        const combined = AbortSignal.any([signal, controller.signal])
        const chunks: Uint8Array[] = []
        const total = { bytes: 0 }
        // Cleanup must run on timeout, interruption and body budget rejection too.
        try {
          const response = await fetch(url, { ...init, redirect: "error", signal: combined })
          if (!response.ok || !response.body) throw failure("acquisition_failed")
          const declared = response.headers.get("content-length")
          if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw failure("quota_exceeded")
          const reader = response.body.getReader()
          try {
            while (true) {
              const next = await reader.read()
              if (next.done) break
              total.bytes += next.value.byteLength
              if (total.bytes > limit) throw failure("quota_exceeded")
              chunks.push(next.value)
            }
          } finally {
            await reader.cancel().catch((error: unknown) => { transportFailure(error) })
            reader.releaseLock()
          }
          return new Uint8Array(Buffer.concat(chunks, total.bytes))
        } finally {
          controller.abort()
          clearTimeout(timer)
        }
      },
      // beta.83 does not catch a throw in the asynchronous mapper; classify inside Effect's evaluator instead.
      catch: (error): unknown => error,
    }).pipe(Effect.catch((error) => Effect.suspend(() => Effect.fail(transportFailure(error)))))
  })
}

export function json<A>(bytes: Uint8Array, schema: Schema.Codec<A>) {
  return Effect.gen(function* () {
    const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes), catch: (error) => {
      if (error instanceof TypeError && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA") return decodeFailure("utf8")
      throw error
    } })
    // Effect v4's parseJson getter catches every foreign exception; this boundary must retain allocation defects.
    const parsed = yield* Effect.try({ try: (): unknown => JSON.parse(text), catch: (error) => {
      if (error instanceof SyntaxError) return decodeFailure("json")
      throw error
    } })
    return yield* Schema.decodeUnknownEffect(schema)(parsed).pipe(Effect.mapError(() => decodeFailure("json")))
  })
}

export function base64(value: string, limit: number) {
  return Effect.try({ try: () => {
    requireBudget(limit)
    if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw decodeFailure("base64")
    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0
    const last = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(value[value.length - padding - 1])
    if ((padding === 2 && (last & 15) !== 0) || (padding === 1 && (last & 3) !== 0)) throw decodeFailure("base64")
    const bytes = value.length / 4 * 3 - padding
    if (bytes > limit) throw failure("quota_exceeded")
    const data = new Uint8Array(Buffer.from(value, "base64"))
    if (data.byteLength !== bytes || Buffer.from(data).toString("base64") !== value) throw decodeFailure("base64")
    return data
  }, catch: expectedFailure })
}

/** Preflight dimensions bound decoder allocation; Photon validates actual compressed image and RGBA size. */
export function image(data: Uint8Array, mime: string, budgets: Budgets) {
  return Effect.gen(function* () {
    if (!["image/png", "image/jpeg"].includes(mime)) return yield* failure("unsupported_operation")
    const dimensions = yield* Effect.try({ try: () => imageDimensions(data, mime, budgets),
      catch: expectedFailure })
    const { PhotonImage } = yield* Effect.promise(() => import("@silvia-odwyer/photon-node"))
    return yield* Effect.acquireUseRelease(
      // Photon exposes untyped WASM panics, not recoverable decode errors. Ambiguous traps remain defects.
      Effect.sync(() => PhotonImage.new_from_byteslice(data)),
      (decoded) => Effect.try({ try: () => {
        if (decoded.get_width() !== dimensions.width || decoded.get_height() !== dimensions.height ||
          decoded.get_raw_pixels().byteLength !== dimensions.width * dimensions.height * 4) throw decodeFailure("image")
        return dimensions
      }, catch: expectedFailure }),
      (decoded) => Effect.sync(() => decoded.free()),
    )
  })
}

function imageDimensions(data: Uint8Array, mime: string, budgets: Budgets) {
  if (data.byteLength > budgets.downloadBytes) throw failure("quota_exceeded")
  if (!data.byteLength || !matchesMime(data, mime)) throw decodeFailure("image")
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const bound = (width: number, height: number) => {
    if (!width || !height) throw decodeFailure("image")
    if (width > 4096 || height > 4096 || width * height > budgets.pixels) throw failure("quota_exceeded")
    return { width, height }
  }
  if (mime === "image/png" && data.length >= 33 &&
    Buffer.from(data.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    view.getUint32(8) === 13 && Buffer.from(data.subarray(12, 16)).toString() === "IHDR")
    return bound(view.getUint32(16), view.getUint32(20))
  if (mime !== "image/jpeg" || data.length < 4 || data[0] !== 255 || data[1] !== 216 ||
    data[data.length - 2] !== 255 || data[data.length - 1] !== 217) throw decodeFailure("image")
  let offset = 2
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 255) throw decodeFailure("image")
    while (data[offset] === 255) offset++
    if (offset + 3 > data.length) throw decodeFailure("image")
    const marker = data[offset++]
    if (marker === 218 || marker === 217) break
    const length = view.getUint16(offset)
    if (length < 2 || offset + length > data.length) throw decodeFailure("image")
    if ([192, 193, 194].includes(marker) && length >= 8) return bound(view.getUint16(offset + 5), view.getUint16(offset + 3))
    offset += length
  }
  throw decodeFailure("image")
}

function decodeFailure(kind: "base64" | "image" | "utf8" | "json") {
  return new Capability.Failure({ code: kind === "utf8" || kind === "json" ? "outcome_unknown" : "acquisition_failed",
    message: `Media ${kind} decoding failed` })
}

function expectedFailure(error: unknown) {
  if (error instanceof Capability.Failure) return error
  throw error
}

function transportFailure(error: unknown): Capability.Failure {
  if (error instanceof Capability.Failure) return error
  if (error instanceof DOMException && ["AbortError", "TimeoutError", "NetworkError"].includes(error.name)) return failure("acquisition_failed")
  const codes = ["ConnectionRefused", "ConnectionClosed", "ConnectionReset", "UnexpectedRedirect", "ECONNREFUSED", "ECONNRESET", "EPIPE",
    "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"]
  if (error instanceof Error && "code" in error && typeof error.code === "string" && codes.includes(error.code)) return failure("acquisition_failed")
  if (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message) && error.cause instanceof Error)
    return transportFailure(error.cause)
  throw error
}

function requireBudget(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > outboundBytes) throw new RangeError("Invalid media byte budget")
}

/** Host-owned bodies only. Unknown/streaming bodies are unsupported rather than unbounded. */
export function outbound(body: RequestInit["body"], limit = outboundBytes) {
  return Effect.try({ try: () => {
    requireBudget(limit)
    const total = { bytes: 0 }
    const add = (bytes: number) => {
      total.bytes += bytes
      if (total.bytes > limit) throw failure("quota_exceeded")
    }
    if (body === undefined || body === null) return 0
    if (typeof body === "string") {
      add(utf8Bytes(body))
      return total.bytes
    }
    if (body instanceof Blob) { add(body.size); return total.bytes }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) { add(body.byteLength); return total.bytes }
    if (body instanceof FormData) {
      // Native encoders choose a boundary. Account conservatively for framing and UTF-8 names, not only file bytes.
      add(256)
      body.forEach((value, name) => add(512 + utf8Bytes(name) * 3 + (typeof value === "string" ? utf8Bytes(value)
        : value.size + utf8Bytes(value.name) * 3 + utf8Bytes(value.type))))
      return total.bytes
    }
    throw failure("unsupported_operation")
  }, catch: expectedFailure })
}

/** Exact JSON byte count precedes JSON.stringify; producers must use this before constructing request bodies. */
export function jsonBody(value: Schema.Json, limit = outboundBytes) {
  return Effect.try({ try: () => {
    requireBudget(limit)
    const total = { bytes: 0, nodes: 0 }
    const seen = new Set<object>()
    const add = (bytes: number) => {
      total.bytes += bytes
      if (total.bytes > limit) throw failure("quota_exceeded")
    }
    const visit = (value: Schema.Json, depth: number): void => {
      if (depth > 8 || ++total.nodes > 256) throw failure("quota_exceeded")
      if (typeof value === "string") { add(utf8Bytes(value, true)); return }
      if (value === null) { add(4); return }
      if (typeof value === "boolean") { add(value ? 4 : 5); return }
      if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new TypeError("Invalid media JSON number")
        add(String(value).length)
        return
      }
      if (typeof value !== "object") throw new TypeError("Invalid media JSON value")
      if ("toJSON" in value) throw new TypeError("Custom media JSON serialization")
      if (seen.has(value)) throw new TypeError("Cyclic media JSON value")
      seen.add(value)
      if (Array.isArray(value)) {
        if (value.length > 256 - total.nodes) throw failure("quota_exceeded")
        add(2 + Math.max(0, value.length - 1))
        for (let index = 0; index < value.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
          if (!descriptor || !("value" in descriptor)) throw new TypeError("Sparse or accessor media JSON array")
          visit(descriptor.value, depth + 1)
        }
        seen.delete(value)
        return
      }
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
        throw new TypeError("Invalid media JSON object")
      add(2)
      const count = { keys: 0 }
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (!descriptor || !("value" in descriptor)) throw new TypeError("Accessor media JSON property")
        add(utf8Bytes(key, true) + 1 + (count.keys++ ? 1 : 0))
        visit(descriptor.value, depth + 1)
      }
      seen.delete(value)
    }
    visit(value, 0)
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError("Invalid media JSON serialization")
    return encoded
  }, catch: expectedFailure })
}

/** Actual source bytes determine encoded length before any base64 buffer/string allocation. */
export function dataURL(data: Uint8Array, mime: string, limit = outboundBytes) {
  return Effect.try({ try: () => {
    requireBudget(limit)
    if (!["image/png", "image/jpeg", "video/mp4"].includes(mime)) throw failure("unsupported_operation")
    const prefix = `data:${mime};base64,`
    if (prefix.length + Math.ceil(data.byteLength / 3) * 4 > limit) throw failure("quota_exceeded")
    return prefix + Buffer.from(data).toString("base64")
  }, catch: expectedFailure })
}

function utf8Bytes(value: string, quoted = false) {
  const total = { bytes: quoted ? 2 : 0 }
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (quoted && (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13)) { total.bytes += 2; continue }
    if (quoted && code < 32) { total.bytes += 6; continue }
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      total.bytes += 4
      index++
      continue
    }
    total.bytes += code >= 0xd800 && code <= 0xdfff ? quoted ? 6 : 3 : code < 128 ? 1 : code < 2048 ? 2 : 3
  }
  return total.bytes
}
