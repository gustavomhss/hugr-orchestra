import { Context, Effect, Layer } from "effect"
import { HttpMiddleware, HttpRouter, HttpServerResponse } from "effect/unstable/http"

export type CorsOptions = { readonly cors?: ReadonlyArray<string> }

export const CorsConfig = Context.Reference<CorsOptions | undefined>("@orchestra/ServerCorsConfig", {
  defaultValue: () => undefined,
})

export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (input.startsWith("http://localhost:")) return true
  if (input.startsWith("http://127.0.0.1:")) return true
  if (input.startsWith("oc://renderer")) return true
  if (input === "tauri://localhost" || input === "http://tauri.localhost" || input === "https://tauri.localhost")
    return true
  return opts?.cors?.includes(input) ?? false
}

export function isAllowedRequestOrigin(input: string | undefined, host: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (host && sameHost(input, host)) return true
  return isAllowedCorsOrigin(input, opts)
}

function sameHost(origin: string, host: string) {
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Global CORS for the HTTP server: the origins above (the desktop renderer, local web, Tauri) plus `opts.cors`. */
export const corsLayer = (opts?: CorsOptions) =>
  Layer.mergeAll(
    corsVaryFix,
    HttpRouter.middleware(
      HttpMiddleware.cors({ allowedOrigins: (origin) => isAllowedCorsOrigin(origin, opts), maxAge: 86_400 }),
      { global: true },
    ),
  )

// effect-smol's HttpMiddleware.cors builds OPTIONS preflight responses by
// spreading allowOrigin() and allowHeaders() into the same record. Both set
// the `vary` key, so allowHeaders' `Vary: Access-Control-Request-Headers`
// overwrites allowOrigin's `Vary: Origin`. With dynamic origin echoing, the
// missing `Vary: Origin` lets shared caches reuse a preflight cached for one
// origin against a different origin.
//
// TODO: upstream a fix that merges Vary values in headersFromRequestOptions
// (packages/effect/src/unstable/http/HttpMiddleware.ts ~line 332).
export const corsVaryFix = HttpRouter.middleware(
  (effect) =>
    Effect.gen(function* () {
      const response = yield* effect
      const allowOrigin = response.headers["access-control-allow-origin"]
      if (!allowOrigin || allowOrigin === "*") return response

      const vary = response.headers["vary"]
      if (!vary) return HttpServerResponse.setHeader(response, "vary", "Origin")

      const tokens = vary.split(",").map((s) => s.trim().toLowerCase())
      if (tokens.includes("origin") || tokens.includes("*")) return response

      return HttpServerResponse.setHeader(response, "vary", `${vary}, Origin`)
    }),
  { global: true },
)
