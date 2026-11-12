import { createConnection } from "net"
import { createServer } from "http"
import { OauthCallbackPage } from "../oauth/page"
import { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH, parseRedirectUri } from "./oauth-provider"

const OAUTH_CALLBACK_HOST = "127.0.0.1"

// Current callback server configuration (may differ from defaults if custom redirectUri is used)
let currentPort = OAUTH_CALLBACK_PORT
let currentPath = OAUTH_CALLBACK_PATH

interface PendingAuth {
  resolve: (code: string) => void
  reject: (error: Error) => void
  name?: string
  cancel: () => void
}

let server: ReturnType<typeof createServer> | undefined
let starting: Promise<void> | undefined
const pendingAuths = new Map<string, PendingAuth>()
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function settle(state: string, pending: PendingAuth, outcome: { code: string } | { error: Error }) {
  if (pendingAuths.get(state) !== pending) return
  pendingAuths.delete(state)
  pending.cancel()
  if ("code" in outcome) pending.resolve(outcome.code)
  if ("error" in outcome) pending.reject(outcome.error)
}

function stopIfIdle() {
  if (pendingAuths.size > 0 || !server) return

  server.close()
  server = undefined
}

function handleRequest(req: import("http").IncomingMessage, res: import("http").ServerResponse) {
  const url = new URL(req.url || "/", `http://localhost:${currentPort}`)

  if (url.pathname !== currentPath) {
    res.writeHead(404)
    res.end("Not found")
    return
  }

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  // Enforce state parameter presence
  if (!state) {
    const errorMsg = "Missing required state parameter - potential CSRF attack"
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error(errorMsg, { provider: "MCP" }))
    return
  }

  if (error) {
    const errorMsg = errorDescription || error
    if (pendingAuths.has(state)) {
      const pending = pendingAuths.get(state)!
      settle(state, pending, { error: new Error(errorMsg) })
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error(errorMsg, { provider: "MCP" }))
    stopIfIdle()
    return
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error("No authorization code provided", { provider: "MCP" }))
    return
  }

  // Validate state parameter
  if (!pendingAuths.has(state)) {
    const errorMsg = "Invalid or expired state parameter - potential CSRF attack"
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
    res.end(OauthCallbackPage.error(errorMsg, { provider: "MCP" }))
    return
  }

  const pending = pendingAuths.get(state)!

  settle(state, pending, { code })

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  res.end(OauthCallbackPage.success({ provider: "MCP" }))
  stopIfIdle()
}

export async function ensureRunning(redirectUri?: string): Promise<void> {
  // Parse the redirect URI to get port and path (uses defaults if not provided)
  const { port, path } = parseRedirectUri(redirectUri)

  // If server is running on a different port/path, stop it first
  if (server && (currentPort !== port || currentPath !== path)) {
    await stop()
  }

  if (server) return

  // Concurrent callers share one start: a second probe-then-listen would hit EADDRINUSE and,
  // before this, overwrite `server` with the dead handle.
  starting ??= start(port, path).finally(() => {
    starting = undefined
  })
  return starting
}

async function start(port: number, path: string) {
  // Fail now: nothing here would receive the browser's redirect, and the sign-in would wait for the 5 minute timeout.
  if (await isPortInUse(port)) throw portInUse(port)

  currentPort = port
  currentPath = path

  const candidate = createServer(handleRequest)
  await new Promise<void>((resolve, reject) => {
    candidate.on("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "EADDRINUSE" ? portInUse(port) : error),
    )
    candidate.listen(port, OAUTH_CALLBACK_HOST, () => resolve())
  })
  server = candidate
}

function portInUse(port: number) {
  return new Error(
    `OAuth callback port ${port} is already in use. Close the program using it, or set another port with oauth.callback_port in the server's MCP config.`,
  )
}

export function waitForCallback(
  oauthState: string,
  mcpName?: string,
  options?: { scheduleTimeout?: (onTimeout: () => void, delayMs: number) => () => void },
): Promise<string> {
  if (pendingAuths.has(oauthState)) return Promise.reject(new Error("OAuth state already registered"))
  return new Promise((resolve, reject) => {
    const pending: PendingAuth = { resolve, reject, name: mcpName, cancel: () => {} }
    pendingAuths.set(oauthState, pending)
    const schedule =
      options?.scheduleTimeout ??
      ((onTimeout: () => void, delayMs: number) => {
        const timer = setTimeout(onTimeout, delayMs)
        return () => clearTimeout(timer)
      })
    const cancel = schedule(() => {
      settle(oauthState, pending, { error: new Error("OAuth callback timeout - authorization took too long") })
      stopIfIdle()
    }, CALLBACK_TIMEOUT_MS)
    pending.cancel = cancel
    if (pendingAuths.get(oauthState) !== pending) cancel()
  })
}

export function cancelPending(mcpName: string, expectedState: string): void {
  const pending = pendingAuths.get(expectedState)
  if (!pending || pending.name !== mcpName) return
  settle(expectedState, pending, { error: new Error("Authorization cancelled") })
  stopIfIdle()
}

export async function isPortInUse(port: number = OAUTH_CALLBACK_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(port, "127.0.0.1")
    socket.on("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.on("error", () => {
      resolve(false)
    })
  })
}

export async function stop(): Promise<void> {
  const current = server
  server = undefined
  for (const [state, pending] of pendingAuths) {
    settle(state, pending, { error: new Error("OAuth callback server stopped") })
  }
  if (current) await new Promise<void>((resolve) => current.close(() => resolve()))
}

export function isRunning(): boolean {
  return server !== undefined
}

export * as McpOAuthCallback from "./oauth-callback"
