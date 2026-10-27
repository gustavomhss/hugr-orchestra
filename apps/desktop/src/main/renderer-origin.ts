// The renderer's own origin and what is allowed to act as it. No electron import: windows.ts and ipc.ts pass in
// app.isPackaged, so this runs under bun test.

export const rendererProtocol = "oc"
export const rendererHost = "renderer"

/**
 * The dev server URL, only for an unpackaged app. A packaged build ignores ELECTRON_RENDERER_URL: otherwise an
 * environment variable could point the privileged window, and every IPC handler behind it, at any page.
 */
export function rendererDevUrl(packaged: boolean, value: string | undefined) {
  if (packaged || !value || !URL.canParse(value)) return undefined
  return value
}

/** Whether a URL is the renderer's own origin: oc://renderer, or the dev server when one is allowed. */
export function isRendererOrigin(value: string | undefined, devUrl: string | undefined) {
  if (!value || !URL.canParse(value)) return false
  const url = new URL(value)
  if (url.protocol === `${rendererProtocol}:` && url.host === rendererHost) return true
  if (!devUrl) return false
  return url.origin === new URL(devUrl).origin
}

/**
 * The enforced part of the policy is a subset that cannot break a page: no plugins and no <base> rewriting. The full
 * policy is report-only until it has been watched against the packaged app, because the renderer reaches remote
 * servers over http(s)/ws(s) at any host and uses blob workers, wasm and inline styles, none of which can be checked
 * without running it.
 */
export const rendererCsp = "object-src 'none'; base-uri 'self'"
export const rendererCspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http: https:",
  "media-src 'self' data: blob: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: http: https: ws: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' http: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")
