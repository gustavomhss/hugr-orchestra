import type { Hooks, PluginInput } from "@orchestra/plugin"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { Option, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import os from "node:os"
import { OAUTH_DUMMY_KEY } from "../../auth"

// Legacy endpoint/catalog provenance: installed 1.18.34 public bundle,
// SHA-256 f630173e016c1407c379d0fab33361a0cf689f12a0f7568bcc31d2053864fb51.
// Compatibility only: no issued registration, plan-scope, consent or entitlement claim.
const ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
const BASE_URL = "https://chatgpt.com/backend-api/codex"
const decodeContent = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const OAuth = Schema.Struct({
  type: Schema.Literal("oauth"),
  access: Schema.String,
  refresh: Schema.String,
  expires: Schema.Number,
  accountId: Schema.optional(Schema.String),
})
const decodeOAuth = Schema.decodeUnknownOption(OAuth)

// Run outside Plugin's recoverable initialization boundary: malformed ENV must not leave an unguarded provider.
export function validateLegacyCodexReadonlyAuth() {
  requireInherited(15 * 60_000)
}

/** The optional send seam is for transport tests, never provider config or endpoint selection. */
export async function LegacyCodexReadonlyPlugin(
  _input: PluginInput,
  send: (request: Request) => Promise<Response> = fetch,
): Promise<Hooks> {
  return {
    provider: {
      id: "openai",
      async models(provider, context) {
        const inherited = requireInherited(15 * 60_000)
        if (!isDeepStrictEqual(requireOAuth(context.auth, 15 * 60_000), inherited))
          throw new Error("LEGACY_CODEX_INHERITED_AUTH_MISMATCH")
        return Object.fromEntries(Object.entries(provider.models).filter(([, model]) =>
          model.options.reasoningMode !== "pro" && allowedModel(model.api.id),
        ))
      },
    },
    auth: {
      provider: "openai",
      methods: [],
      async loader(getAuth) {
        const inherited = requireInherited(15 * 60_000)
        const snapshot = requireOAuth(await getAuth(), 15 * 60_000)
        if (!isDeepStrictEqual(snapshot, inherited)) throw new Error("LEGACY_CODEX_INHERITED_AUTH_MISMATCH")
        return {
          apiKey: OAUTH_DUMMY_KEY,
          baseURL: BASE_URL,
          async fetch(input: string | URL | Request, init?: RequestInit) {
            const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
            // Exact URLs also reject bare queries/fragments, userinfo and alternate origins before token egress.
            if (request.method !== "POST" || !["https://api.openai.com/v1/responses", ENDPOINT].includes(request.url))
              throw new Error("LEGACY_CODEX_UNSUPPORTED_RESPONSE_ROUTE")
            const inherited = requireInherited(5 * 60_000)
            const current = requireOAuth(await getAuth(), 5 * 60_000)
            if (!isDeepStrictEqual(current, snapshot) || !isDeepStrictEqual(inherited, snapshot))
              throw new Error("LEGACY_CODEX_AUTH_IDENTITY_CHANGED")
            const headers = new Headers(request.headers)
            // HTTP session/affinity headers are Codex protocol context, not the private title marker.
            ;[
              "authorization", "chatgpt-account-id", "x-orchestra-title", "x-opencode-session", "x-opencode-request",
              "x-opencode-project", "x-opencode-client",
            ].forEach((name) => headers.delete(name))
            headers.set("Authorization", `Bearer ${snapshot.access}`)
            if (snapshot.accountId !== undefined) headers.set("ChatGPT-Account-Id", snapshot.accountId)
            headers.set("originator", "opencode")
            headers.set("User-Agent", `opencode/${InstallationVersion} (${os.platform()} ${os.release()}; ${os.arch()})`)
            // Request-to-Request construction preserves body bytes and cancellation without parsing inference JSON.
            return send(new Request(new Request(ENDPOINT, request), { headers, redirect: "error" }))
          },
        }
      },
    },
    "chat.headers": async (input, output) => {
      if (input.model.providerID !== "openai") return
      output.headers.originator = "opencode"
      output.headers["User-Agent"] = `opencode/${InstallationVersion} (${os.platform()} ${os.release()}; ${os.arch()})`
      output.headers["session-id"] = input.sessionID
    },
    "chat.params": async (input, output) => {
      if (input.model.providerID !== "openai") return
      output.maxOutputTokens = undefined
    },
  }
}

function requireInherited(minimum: number) {
  const content = process.env.ORCHESTRA_AUTH_CONTENT
  if (!content?.trim()) throw new Error("LEGACY_CODEX_AUTH_CONTENT_REQUIRED")
  const parsed = decodeContent(content)
  if (Option.isNone(parsed)) throw new Error("LEGACY_CODEX_AUTH_CONTENT_INVALID_JSON")
  const value = parsed.value
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, "openai") || !("openai" in value))
    throw new Error("LEGACY_CODEX_SELECTED_OPENAI_AUTH_REQUIRED")
  return requireOAuth(value.openai, minimum)
}

function requireOAuth(value: unknown, minimum: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LEGACY_CODEX_OAUTH_REQUIRED")
  // Presence is forbidden, even null, undefined, partial or invalid issued metadata. No registration fallback.
  if ("metadata" in value) throw new Error("LEGACY_CODEX_METADATA_MUST_BE_ABSENT")
  const parsed = decodeOAuth(value)
  if (Option.isNone(parsed)) throw new Error("LEGACY_CODEX_OAUTH_INVALID")
  const auth = parsed.value
  if ([auth.access, auth.refresh].some((token) => !token.trim() || token !== token.trim() || /[\x00-\x1f\x7f]/.test(token)))
    throw new Error("LEGACY_CODEX_OAUTH_TOKENS_INVALID")
  if (!Number.isSafeInteger(auth.expires) || auth.expires <= Date.now() + minimum)
    throw new Error("LEGACY_CODEX_OAUTH_EXPIRY_TOO_CLOSE")
  if (auth.accountId !== undefined && (!auth.accountId.trim() || auth.accountId !== auth.accountId.trim() ||
    /[\x00-\x1f\x7f]/.test(auth.accountId))) throw new Error("LEGACY_CODEX_ACCOUNT_ID_INVALID")
  return Object.freeze({ type: auth.type, access: auth.access, refresh: auth.refresh, expires: auth.expires,
    ...(auth.accountId === undefined ? {} : { accountId: auth.accountId }) })
}

function allowedModel(id: string) {
  if (/^gpt-5\.5-pro(?:-|$)|^gpt-5\.6(?:-|$)/.test(id)) return false
  if (["gpt-5.5", "gpt-5.3-codex-spark", "gpt-5.4", "gpt-5.4-mini", "gpt-6-sol", "gpt-6-luna"].includes(id)) return true
  const match = /^gpt-(\d+)(?:\.(\d+))?(?:-|$)/.exec(id)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2] ?? 0)
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) && (major > 5 || (major === 5 && minor > 4))
}
