import type { AuthHook, Hooks, PluginInput } from "@orchestra/plugin"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { Global } from "@orchestra/core/global"
import { Siwc } from "@orchestra/core/auth/siwc"
import { SiwcInference } from "@orchestra/core/auth/siwc-inference"
import { SiwcListener } from "@orchestra/core/auth/siwc-listener"
import { OwnOAuthApp } from "@orchestra/core/auth/oauth-app"
import { OauthCallbackPage } from "@orchestra/core/oauth/page"
import { Effect, Exit, Option, Schema, Scope } from "effect"
import { join } from "node:path"
import os from "node:os"
import { Auth, OAUTH_DUMMY_KEY } from "../../auth"
import { OpenAIWebSocketPool } from "./ws-pool"
import { LegacySiwc } from "./siwc"

// Compatibility exports are claim inspection only, never identity validation.
export interface IdTokenClaims {
  chatgpt_account_id?: string
  chatgpt_compute_residency?: string
  organizations?: ReadonlyArray<{ id: string }>
  email?: string
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string
    chatgpt_compute_residency?: string
  }
}

const Claims = Schema.Struct({
  chatgpt_account_id: Schema.optional(Schema.String),
  chatgpt_compute_residency: Schema.optional(Schema.String),
  organizations: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String }))),
  email: Schema.optional(Schema.String),
  "https://api.openai.com/auth": Schema.optional(Schema.Struct({
    chatgpt_account_id: Schema.optional(Schema.String),
    chatgpt_compute_residency: Schema.optional(Schema.String),
  })),
})

export function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Claims))(
    Buffer.from(parts[1], "base64url").toString(),
  ))
}

export function extractAccountIdFromClaims(claims: IdTokenClaims) {
  return claims.chatgpt_account_id || claims["https://api.openai.com/auth"]?.chatgpt_account_id || claims.organizations?.[0]?.id
}

export function extractAccountId(tokens: { id_token: string; access_token: string; refresh_token: string }) {
  const identity = parseJwtClaims(tokens.id_token)
  const access = parseJwtClaims(tokens.access_token)
  return (identity && extractAccountIdFromClaims(identity)) || (access && extractAccountIdFromClaims(access))
}

export function extractResidency(token: string) {
  const claims = parseJwtClaims(token)
  const residency = claims?.["https://api.openai.com/auth"]?.chatgpt_compute_residency ?? claims?.chatgpt_compute_residency
  return !residency || residency === "no_constraint" ? undefined : residency
}

export const renderOAuthError = (error: string) => OauthCallbackPage.error(error, { provider: "ChatGPT" })

interface CodexAuthPluginOptions {
  experimentalWebSockets?: boolean
  /** Advanced method requires both an owned ENV client ID and confirmed provider grant. */
  partnerGrantConfirmed?: boolean
  readOnlyInheritGuard?: () => Promise<boolean>
  hostFile?: string
  port?: number
  transport?: (url: string, init: RequestInit) => Promise<Response>
  jwksURL?: URL
  send?: (request: Request) => Promise<Response>
  /** Deprecated endpoint overrides cannot redirect plan credentials. */
  issuer?: string
  codexApiEndpoint?: string
}

export async function CodexAuthPlugin(_input: PluginInput, options: CodexAuthPluginOptions = {}): Promise<Hooks> {
  const scopes = new Map<Scope.Closeable, AbortController>()
  const sockets: Array<ReturnType<typeof OpenAIWebSocketPool.createWebSocketFetch>> = []
  const lifecycle = { disposed: false }
  const send = options.send ?? fetch
  const inherited = async () => !!process.env.ORCHESTRA_AUTH_CONTENT || !!(await options.readOnlyInheritGuard?.())
  const close = async (scope: Scope.Closeable) => {
    scopes.get(scope)?.abort()
    scopes.delete(scope)
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
  const browser = (label: string, owned = false) => ({
    label,
    type: "oauth" as const,
    prompts: [{ type: "select" as const, key: "account", message: "ChatGPT account", options: [
      { label: "Add a ChatGPT account or workspace", value: "new" },
      { label: "Continue with the saved ChatGPT account", value: "saved" },
    ] }],
    async authorize(inputs?: Record<string, string>) {
      if (lifecycle.disposed) throw new Error("ChatGPT plugin disposed")
      const saved = inputs?.account === "saved"
        ? await Auth.runPromise((store) => store.get("openai")) : undefined
      if (inputs?.account === "saved" && saved?.type !== "oauth") throw new Error("Select a saved ChatGPT account")
      const registration = saved?.type === "oauth" ? Siwc.registration(saved.metadata) : undefined
      const clientId = owned && !registration ? OwnOAuthApp.requireClientID("openai") : undefined
      const scope = await Effect.runPromise(Scope.make())
      const abort = new AbortController()
      scopes.set(scope, abort)
      const pending = await Effect.runPromise(SiwcListener.authorize({
        hostFile: options.hostFile ?? join(Global.Path.state, "siwc", "host-id"),
        methodID: LegacySiwc.methodID, registration, clientId, port: options.port, transport: options.transport, jwksURL: options.jwksURL,
      }).pipe(Scope.provide(scope))).catch(async (cause: unknown) => { await close(scope); throw cause })
      if (lifecycle.disposed) { await close(scope); throw new Error("ChatGPT plugin disposed") }
      // Start waiting now, so disposal/timeout also releases an abandoned listener.
      const result = Effect.runPromise(pending.callback.pipe(Effect.timeout("10 minutes"), Scope.provide(scope)), { signal: abort.signal })
        .finally(() => close(scope))
      void result.catch(() => undefined)
      return {
        url: pending.url, instructions: pending.instructions, method: "auto" as const,
        async callback() {
          const value = await result
          if (lifecycle.disposed) return { type: "failed" as const }
          return { type: "success" as const, access: value.access, refresh: value.refresh, expires: value.expires,
            metadata: { ...value.metadata, resource: Siwc.resource } }
        },
      }
    },
  } satisfies AuthHook["methods"][number])

  return {
    async dispose() {
      lifecycle.disposed = true
      await Promise.all([...scopes.keys()].map(close))
      sockets.forEach((socket) => socket.close())
      sockets.length = 0
    },
    async event(input) {
      if (input.event.type !== "session.deleted") return
      const sessionID = input.event.properties.info.id
      sockets.forEach((socket) => socket.remove(sessionID))
    },
    provider: {
      id: "openai",
      async models(provider, ctx) {
        if (ctx.auth?.type !== "oauth") return provider.models
        const value = Schema.decodeUnknownSync(Auth.Oauth)(ctx.auth)
        Siwc.requirePlanUsage(value)
        const readonly = await inherited()
        const resolved = await LegacySiwc.resolve({
          getAuth: readonly ? async () => value : () => Auth.runPromise((store) => store.get("openai")),
          selected: Siwc.registration(value.metadata), inherited, transport: options.transport, jwksURL: options.jwksURL,
        })
        const available = await SiwcInference.models(resolved, send)
        return Object.fromEntries(Object.entries(provider.models).flatMap(([id, model]) => {
          const listed = available.find((item) => item.slug === model.api.id)
          return listed ? [[id, { ...model, name: listed.display_name, api: { ...model.api, url: Siwc.resource } }]] : []
        }))
      },
    },
    auth: {
      provider: "openai",
      async loader(getAuth) {
        const initial = await getAuth()
        if (initial.type !== "oauth") {
          if (!options.experimentalWebSockets) return {}
          const socket = OpenAIWebSocketPool.createWebSocketFetch({ httpFetch: fetch })
          sockets.push(socket)
          return { fetch: socket }
        }
        const selected = Siwc.registration(Schema.decodeUnknownSync(Auth.Oauth)(initial).metadata)
        Siwc.requirePlanUsage({ metadata: selected })
        return { apiKey: OAUTH_DUMMY_KEY, baseURL: Siwc.resource,
          fetch: SiwcInference.transport(selected, () => LegacySiwc.resolve({
            getAuth, selected, inherited, transport: options.transport, jwksURL: options.jwksURL,
          }), async (request) => {
            request.headers.delete(OpenAIWebSocketPool.TITLE_HEADER)
            return send(request)
          }) }
      },
      methods: [
        browser("Continue with ChatGPT (Orchestra)"),
        browser("Continue with ChatGPT (manual browser)"),
        ...(options.partnerGrantConfirmed && process.env.ORCHESTRA_OPENAI_CLIENT_ID?.trim()
          ? [browser("ChatGPT (approved partner client, advanced)", true)] : []),
        { label: "Manually enter API Key", type: "api" },
      ],
    },
    "chat.headers": async (input, output) => {
      if (input.model.providerID !== "openai") return
      output.headers.originator = "opencode"
      output.headers["User-Agent"] = `opencode/${InstallationVersion} (${os.platform()} ${os.release()}; ${os.arch()})`
      output.headers["session-id"] = input.sessionID
      if (sockets.length && input.agent === "title") output.headers[OpenAIWebSocketPool.TITLE_HEADER] = "true"
    },
    "chat.params": async (input, output) => {
      if (input.model.providerID !== "openai") return
      output.maxOutputTokens = undefined
    },
  }
}
