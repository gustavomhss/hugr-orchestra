import type { Hooks, PluginInput } from "@orchestra/plugin"
import type { Model } from "@orchestra/sdk/v2"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { OauthCallbackPage } from "@orchestra/core/oauth/page"
import { createServer } from "http"
import { OwnOAuthApp } from "@orchestra/core/auth/oauth-app"
import { Auth, OAUTH_DUMMY_KEY } from "../auth"
import { Effect, Option, Schema } from "effect"

type Send = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const DO_AUTHORIZE_URL = "https://cloud.digitalocean.com/v1/oauth/authorize"
const DO_TOKEN_URL = "https://cloud.digitalocean.com/v1/oauth/token"
const DO_API_BASE = "https://api.digitalocean.com"
const DO_GENAI_API = `${DO_API_BASE}/v2/gen-ai`
const DO_INFERENCE_BASE = "https://inference.do-ai.run/v1"
const OAUTH_PORT = 1456
const OAUTH_REDIRECT_PATH = "/auth/callback"
const ROUTER_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const OAUTH_SCOPES = "genai:read inference:query"

const TokenResponse = Schema.Struct({
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.NonEmptyString,
  expires_in: Schema.optional(Schema.Int),
  scope: Schema.optional(Schema.String),
})

interface PendingOAuth {
  owner: symbol
  state: string
  resolve: (code: string) => void
  reject: (error: Error) => void
}

interface RouterEntry {
  name: string
  uuid?: string
  description?: string
}

let oauthServer: ReturnType<typeof createServer> | undefined
let pendingOAuth: PendingOAuth | undefined
let serverOwner: symbol | undefined

function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function redirectUri(): string {
  return `http://127.0.0.1:${OAUTH_PORT}${OAUTH_REDIRECT_PATH}`
}

function buildAuthorizeUrl(state: string, clientID: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientID,
    redirect_uri: redirectUri(),
    scope: OAUTH_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })
  return `${DO_AUTHORIZE_URL}?${params.toString()}`
}

async function startOAuthServer(owner: symbol): Promise<void> {
  if (oauthServer) throw new Error("DigitalOcean OAuth authorization already pending")
  serverOwner = owner
  oauthServer = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${OAUTH_PORT}`)

    if (req.method === "GET" && url.pathname === OAUTH_REDIRECT_PATH) {
      if (!pendingOAuth) {
        res.writeHead(409).end("No pending OAuth attempt")
        return
      }
      const code = url.searchParams.get("code")
      const error = url.searchParams.get("state") !== pendingOAuth.state
        ? "Invalid OAuth state"
        : url.searchParams.has("error") ? url.searchParams.get("error_description") || url.searchParams.get("error") || "OAuth error"
        : !code ? "Missing authorization code" : undefined
      if (error) {
        pendingOAuth.reject(new Error(error))
        pendingOAuth = undefined
        res.writeHead(400, { "Content-Type": "text/html" }).end(OauthCallbackPage.error(error, { provider: "DigitalOcean" }))
        return
      }
      pendingOAuth.resolve(code ?? "")
      pendingOAuth = undefined
      res.writeHead(200, { "Content-Type": "text/html" }).end(OauthCallbackPage.success({ provider: "DigitalOcean" }))
      return
    }

    res.writeHead(404)
    res.end("Not found")
  })

  await new Promise<void>((resolve, reject) => {
    oauthServer!.listen(OAUTH_PORT, "127.0.0.1", () => {
      resolve()
    })
    oauthServer!.once("error", (error) => { if (serverOwner === owner) { oauthServer = undefined; serverOwner = undefined }; reject(error) })
  })
}

function stopOAuthServer(owner: symbol) {
  if (!oauthServer || serverOwner !== owner) return
  oauthServer.close()
  oauthServer = undefined
  serverOwner = undefined
}

function waitForOAuthCallback(state: string, owner: symbol): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        if (pendingOAuth?.owner === owner) {
          pendingOAuth = undefined
          reject(new Error("OAuth callback timeout - authorization took too long"))
          stopOAuthServer(owner)
        }
      },
      5 * 60 * 1000,
    )
    pendingOAuth = {
      owner,
      state,
      resolve: (tokens) => {
        clearTimeout(timeout)
        resolve(tokens)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

async function requestTokens(body: Record<string, string>, send: Send) {
  const response = await send(DO_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body), signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`DigitalOcean OAuth token request failed: ${response.status}`)
  const tokens = Option.getOrThrowWith(Schema.decodeUnknownOption(TokenResponse)(await response.json()), () => new Error("Invalid DigitalOcean OAuth token response"))
  if (tokens.expires_in !== undefined && (!Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0)) throw new Error("Invalid DigitalOcean OAuth expiration")
  return tokens
}

async function listRouters(
  bearer: string,
  send: Send,
): Promise<{ ok: true; routers: RouterEntry[] } | { ok: false; status: number }> {
  const res = await send(`${DO_GENAI_API}/models/routers`, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
      "User-Agent": `orchestra/${InstallationVersion}`,
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
  if (!res) return { ok: false, status: 0 }
  if (!res.ok) return { ok: false, status: res.status }
  const body = (await res.json().catch(() => undefined)) as { model_routers?: RouterEntry[] } | undefined
  return { ok: true, routers: body?.model_routers ?? [] }
}

function routerModel(router: RouterEntry, providerID: string): Model {
  const id = `router:${router.name}`
  return {
    id,
    providerID,
    name: router.name,
    family: "digitalocean-inference-routers",
    api: { id, url: DO_INFERENCE_BASE, npm: "@ai-sdk/openai-compatible" },
    status: "active",
    headers: {},
    options: {},
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 128_000, output: 8_192 },
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    release_date: "",
    variants: {},
  }
}

function parseRoutersJSON(raw: string | undefined): RouterEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((r) =>
      r && typeof r.name === "string" ? [{ name: r.name, uuid: r.uuid, description: r.description }] : [],
    )
  } catch {
    return []
  }
}

export async function DigitalOceanAuthPlugin(input: PluginInput): Promise<Hooks> {
  return createDigitalOceanAuthHooks(input, await Auth.runPromise((auth) => Effect.succeed(auth)), fetch)
}

export function createDigitalOceanAuthHooks(input: PluginInput, store: Auth.Interface, send: Send): Hooks {
  let owner: symbol | undefined
  let disposed = false
  return {
    async dispose() {
      disposed = true
      if (!owner) return
      if (pendingOAuth?.owner === owner) { pendingOAuth.reject(new Error("DigitalOcean OAuth cancelled")); pendingOAuth = undefined }
      stopOAuthServer(owner)
      owner = undefined
    },
    provider: {
      id: "digitalocean",
      async models(provider, ctx) {
        const baseModels = provider.models
        if (ctx.auth?.type !== "api" && ctx.auth?.type !== "oauth") return baseModels

        const metadata = ctx.auth.type === "api" ? ctx.auth.metadata ?? {} : Schema.decodeUnknownSync(Auth.Oauth)(ctx.auth).metadata ?? {}
        const oauthAccess = ctx.auth.type === "oauth" ? ctx.auth.access : metadata["oauth_access"]
        const oauthExpires = ctx.auth.type === "oauth" ? ctx.auth.expires : parseInt(String(metadata["oauth_expires"] || "0"), 10)
        const fetchedAt = parseInt(String(metadata["routers_fetched_at"] || "0"), 10)
        const cached = parseRoutersJSON(typeof metadata["routers"] === "string" ? metadata["routers"] : undefined)

        let routers = cached
        const stale = Date.now() - fetchedAt > ROUTER_REFRESH_INTERVAL_MS
        const bearerValid = typeof oauthAccess === "string" && oauthAccess && oauthExpires > Date.now()

        if (bearerValid && stale) {
          const result = await listRouters(oauthAccess, send)
          if (result.ok) {
            routers = result.routers
            if (ctx.auth.type === "api") await input.client.auth
              .set({
                path: { id: "digitalocean" },
                body: { type: "api", key: ctx.auth.key, metadata: {
                  ...ctx.auth.metadata,
                  routers: JSON.stringify(routers.map((r) => ({ name: r.name, uuid: r.uuid, description: r.description }))),
                  routers_fetched_at: String(Date.now()),
                } },
              })
              .catch(() => {})
          } else if (result.status === 401 || result.status === 403) {
          } else if (result.status !== 0) {
          }
        }

        const merged: Record<string, Model> = { ...baseModels }
        for (const router of routers) {
          const id = `router:${router.name}`
          if (merged[id]) continue
          merged[id] = routerModel(router, "digitalocean")
        }
        return merged
      },
    },
    auth: {
      provider: "digitalocean",
      async loader(getAuth) {
        if ((await getAuth()).type !== "oauth") return {}
        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(request: RequestInfo | URL, init?: RequestInit) {
            const value = await Effect.runPromise(Auth.withRefreshLease("digitalocean", Effect.gen(function* () {
              const auth = yield* store.get("digitalocean")
              if (!auth || auth.type !== "oauth" || auth.expires - Date.now() > 60_000) return auth
              if (process.env.ORCHESTRA_AUTH_CONTENT) throw new Error("Inherited DigitalOcean OAuth credentials cannot be refreshed")
              const clientID = auth.metadata?.clientID
              if (typeof clientID !== "string" || !clientID.trim()) throw new Error("DigitalOcean OAuth credential has no bound clientID; reconnect")
              const tokens = yield* Effect.tryPromise({ try: () => requestTokens({ grant_type: "refresh_token", refresh_token: auth.refresh, client_id: clientID }, send), catch: (cause) => cause })
              const next = new Auth.Oauth({
                ...auth,
                access: tokens.access_token,
                refresh: tokens.refresh_token,
                expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                metadata: { ...auth.metadata, clientID, scopes: tokens.scope ?? auth.metadata?.scopes },
              })
              return (yield* store.replaceIf("digitalocean", auth, next)) ? next : yield* store.get("digitalocean")
            })))
            if (!value || value.type === "wellknown") throw new Error("DigitalOcean credential removed or changed")
            if (value.type === "oauth" && value.expires <= Date.now()) throw new Error("DigitalOcean OAuth credential changed; reconnect")
            const headers = new Headers(request instanceof Request ? request.headers : undefined)
            new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
            headers.set("authorization", `Bearer ${value.type === "oauth" ? value.access : value.key}`)
            return send(request, { ...init, headers })
          },
        }
      },
      methods: [
        {
          type: "oauth",
          label: "Login with DigitalOcean",
          async authorize() {
            const clientID = OwnOAuthApp.requireClientID("digitalocean")
            const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
            const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url")
            if (disposed) throw new Error("DigitalOcean OAuth plugin disposed")
            const attemptOwner = Symbol("digitalocean-oauth")
            await startOAuthServer(attemptOwner)
            owner = attemptOwner
            if (disposed) { stopOAuthServer(attemptOwner); throw new Error("DigitalOcean OAuth cancelled") }
            const state = generateState()
            const callbackPromise = waitForOAuthCallback(state, attemptOwner)
            void callbackPromise.catch(() => undefined)
            const url = buildAuthorizeUrl(state, clientID, challenge)
            return {
              url,
              instructions:
                "Authorize Orchestra in your browser. Router and inference access depend on the scopes DigitalOcean grants.",
              method: "auto" as const,
              async callback() {
                try {
                  const tokens = await requestTokens({ grant_type: "authorization_code", code: await callbackPromise, client_id: clientID, redirect_uri: redirectUri(), code_verifier: verifier }, send)
                  if (disposed) return { type: "failed" as const }
                  const routerResult = await listRouters(tokens.access_token, send)
                  const routers = routerResult.ok ? routerResult.routers : []
                  if (!routerResult.ok) {
                  }
                  return {
                    type: "success" as const,
                    provider: "digitalocean",
                    access: tokens.access_token,
                    refresh: tokens.refresh_token,
                    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                    metadata: {
                      clientID,
                      scopes: tokens.scope ?? OAUTH_SCOPES,
                      routers: JSON.stringify(
                        routers.map((r) => ({ name: r.name, uuid: r.uuid, description: r.description })),
                      ),
                      routers_fetched_at: String(Date.now()),
                    },
                  }
                } catch (err) {
                  return { type: "failed" as const }
                } finally {
                  stopOAuthServer(attemptOwner)
                  if (owner === attemptOwner) owner = undefined
                }
              },
            }
          },
        },
        {
          type: "api",
          label: "Paste Model Access Key",
        },
      ],
    },
  }
}
