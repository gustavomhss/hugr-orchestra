import { Buffer } from "node:buffer"
import { Effect, Option, Schema } from "effect"
import { failure } from "./schema"

export type Budgets = { responseBytes: number; downloadBytes: number; timeoutMillis: number; pixels: number }
export const defaults: Budgets = { responseBytes: 48 * 1024 * 1024, downloadBytes: 16 * 1024 * 1024,
  timeoutMillis: 180000, pixels: 8294400 }

/** Covers headers AND body. No redirects, retries, raw HTTP errors or URLs escape this boundary. */
export function request(url: string, init: RequestInit, limit: number, timeoutMillis: number) {
  return Effect.tryPromise({
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
          await reader.cancel().catch(() => undefined)
          reader.releaseLock()
        }
        return new Uint8Array(Buffer.concat(chunks, total.bytes))
      } finally {
        controller.abort()
        clearTimeout(timer)
      }
    },
    catch: () => failure("acquisition_failed"),
  })
}

export function json<A>(bytes: Uint8Array, schema: Schema.Codec<A>) {
  const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(new TextDecoder().decode(bytes))
  if (Option.isNone(parsed)) return Effect.fail(failure("outcome_unknown"))
  return Schema.decodeUnknownEffect(schema)(parsed.value).pipe(Effect.mapError(() => failure("outcome_unknown")))
}

export function base64(value: string, limit: number) {
  return Effect.try({ try: () => {
    if (!value || value.length > Math.ceil(limit / 3) * 4 || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw failure("acquisition_failed")
    const data = new Uint8Array(Buffer.from(value, "base64"))
    if (data.byteLength > limit || Buffer.from(data).toString("base64") !== value) throw failure("quota_exceeded")
    return data
  }, catch: () => failure("acquisition_failed") })
}

/** Preflight dimensions bound decoder allocation; Photon validates actual compressed image and RGBA size. */
export function image(data: Uint8Array, mime: string, budgets: Budgets) {
  return Effect.gen(function* () {
    const dimensions = yield* Effect.try({ try: () => imageDimensions(data, mime, budgets),
      catch: () => failure("acquisition_failed") })
    const { PhotonImage } = yield* Effect.promise(() => import("@silvia-odwyer/photon-node"))
    return yield* Effect.acquireUseRelease(
      Effect.try({ try: () => PhotonImage.new_from_byteslice(data), catch: () => failure("acquisition_failed") }),
      (decoded) => Effect.try({ try: () => {
        if (decoded.get_width() !== dimensions.width || decoded.get_height() !== dimensions.height ||
          decoded.get_raw_pixels().byteLength !== dimensions.width * dimensions.height * 4) throw failure("acquisition_failed")
        return dimensions
      }, catch: () => failure("acquisition_failed") }),
      (decoded) => Effect.sync(() => decoded.free()),
    )
  })
}

function imageDimensions(data: Uint8Array, mime: string, budgets: Budgets) {
  if (!data.length || data.length > budgets.downloadBytes) throw failure("quota_exceeded")
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const bound = (width: number, height: number) => {
    if (!width || !height || width > 4096 || height > 4096 || width * height > budgets.pixels) throw failure("quota_exceeded")
    return { width, height }
  }
  if (mime === "image/png" && data.length >= 33 &&
    Buffer.from(data.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    view.getUint32(8) === 13 && Buffer.from(data.subarray(12, 16)).toString() === "IHDR")
    return bound(view.getUint32(16), view.getUint32(20))
  if (mime !== "image/jpeg" || data.length < 4 || data[0] !== 255 || data[1] !== 216 ||
    data[data.length - 2] !== 255 || data[data.length - 1] !== 217) throw failure("acquisition_failed")
  let offset = 2
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 255) throw failure("acquisition_failed")
    while (data[offset] === 255) offset++
    const marker = data[offset++]
    if (marker === 218 || marker === 217) break
    const length = view.getUint16(offset)
    if (length < 2 || offset + length > data.length) throw failure("acquisition_failed")
    if ([192, 193, 194].includes(marker) && length >= 8) return bound(view.getUint16(offset + 5), view.getUint16(offset + 3))
    offset += length
  }
  throw failure("acquisition_failed")
}
