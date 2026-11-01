export * as WebUi from "./web-ui"

import { createHash } from "node:crypto"
import path from "node:path"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

/** The page may load only its own scripts, plus the one inline theme-preload script the shell ships. */
export function csp(hash = "") {
  return `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${hash ? ` 'sha256-${hash}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; media-src 'self' data:; connect-src * data: blob:`
}

export function cspForHtml(body: string) {
  const match = body.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i)
  return csp(match ? createHash("sha256").update(match[2]).digest("base64") : "")
}

/** Where the built web app lives: an explicit directory, else a `web` folder next to the executable. */
export async function resolveRoot(candidates: ReadonlyArray<string | undefined>) {
  for (const candidate of candidates) {
    if (candidate && (await Bun.file(path.join(candidate, "index.html")).exists())) return candidate
  }
  return undefined
}

/**
 * Serves the built app-shell web UI from `root` for every GET the API does not claim. A path with no file falls back to
 * `index.html` so client-side routes load, as the earlier runtime's embedded UI did. The files are public: the API keeps its own auth.
 */
export function layer(root: string) {
  const base = path.resolve(root)
  return HttpRouter.add(
    "GET",
    "/*",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      // decodeURIComponent throws on a malformed escape such as a lone `%`; that is the client's mistake, a 400, not a 500.
      const decoded = yield* Effect.try({
        try: () => decodeURIComponent(new URL(request.url, "http://localhost").pathname),
        catch: () => "malformed" as const,
      }).pipe(Effect.option)
      if (Option.isNone(decoded)) return HttpServerResponse.empty({ status: 400 })
      const pathname = decoded.value
      const requested = path.resolve(base, "." + pathname)
      // A path that climbs out of the root is answered like a missing file, never read.
      const inside = requested === base || requested.startsWith(base + path.sep)
      return yield* Effect.promise(async () => {
        const file = inside && (await exists(requested)) ? requested : path.join(base, "index.html")
        const body = new Uint8Array(await Bun.file(file).arrayBuffer())
        const headers = new Headers({ "content-type": Bun.file(file).type })
        if (file.endsWith(".html")) headers.set("content-security-policy", cspForHtml(new TextDecoder().decode(body)))
        return HttpServerResponse.raw(body, { headers })
      })
    }),
  )
}

async function exists(file: string) {
  const stat = await Bun.file(file).stat().catch(() => undefined)
  return stat?.isFile() ?? false
}
