export * as Siwc from "./siwc"

import { createHash, randomBytes } from "node:crypto"
import { Credential } from "@orchestra/schema/credential"
import { Option, Schema } from "effect"

export const issuer = "https://auth.openai.com"
export const resource = "https://api.openai.com/v1"
export const scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
const consumed = new WeakSet<Attempt>()
const Registration = Schema.Struct({
  clientId: Schema.NonEmptyString,
  hostId: Schema.NonEmptyString,
  issuer: Schema.Literal(issuer),
  subject: Schema.NonEmptyString,
  idToken: Schema.NonEmptyString,
  scopes: Schema.Array(Schema.NonEmptyString),
})
export type Registration = typeof Registration.Type
const ValidatedIdentity = Schema.Struct({
  issuer: Schema.Literal(issuer), clientId: Schema.NonEmptyString, subject: Schema.NonEmptyString,
  audiences: Schema.Array(Schema.NonEmptyString), nonce: Schema.NonEmptyString,
  authTime: Schema.optional(Schema.Finite), authorizedParty: Schema.optional(Schema.NonEmptyString),
})
const Tokens = Schema.Struct({
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.NonEmptyString,
  id_token: Schema.NonEmptyString,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Int.check(Schema.isGreaterThan(0)),
  scope: Schema.String,
})
export type Attempt = ReturnType<typeof begin>

export class InvalidGrantError extends Error {
  override name = "InvalidGrantError"
  constructor(readonly context: { clientId: string; hostId: string; registration?: Registration }) {
    super("ChatGPT authorization code expired; retry with the issued registration")
  }
}

/** The caller must bind the listener and persist this host ID before calling. */
export function begin(input: { hostId: string; redirect: string; registration?: Registration; clientId?: string }) {
  const redirect = new URL(input.redirect)
  if (redirect.protocol !== "http:" || redirect.hostname !== "127.0.0.1" || !redirect.port ||
    redirect.pathname !== "/auth/callback" || redirect.search || redirect.hash || redirect.username || redirect.password)
    throw new Error("Invalid ChatGPT loopback redirect")
  if (!input.hostId.trim()) throw new Error("Missing ChatGPT host ID")
  const saved = input.registration ? registration(input.registration) : undefined
  if (saved && saved.hostId !== input.hostId) throw new Error("ChatGPT registration belongs to another host")
  const clientId = input.clientId ? issuedClientID(input.clientId) : saved?.clientId
  if (saved && clientId !== saved.clientId) throw new Error("ChatGPT registration changed")
  const verifier = randomBytes(32).toString("base64url")
  const state = randomBytes(32).toString("base64url")
  const nonce = randomBytes(32).toString("base64url")
  const url = new URL(`${issuer}/api/accounts/authorize`)
  url.search = new URLSearchParams({
    client_id: clientId ?? "dynamic_agent_client",
    ext_agent_host_id: input.hostId,
    response_type: "code",
    redirect_uri: input.redirect,
    scope: scopes,
    resource,
    originator: "opencode",
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    ...(saved ? { id_token_hint: saved.idToken } : clientId ? {} : { agent_name_hint: "Orchestra" }),
  }).toString()
  // Authorization URLs may contain an ID-token hint; never log them.
  return Object.freeze({ url: url.href, redirect: input.redirect, hostId: input.hostId, saved, clientId,
    verifier, state, nonce, expires: Date.now() + 10 * 60 * 1000 })
}

/** Consume once, validate state, handle errors, then accept the issued client. */
export function callback(attempt: Attempt, url: URL) {
  if (consumed.has(attempt)) throw new Error("ChatGPT callback already consumed")
  validateBinding(attempt, url)
  consumed.add(attempt)
  if (url.searchParams.has("error")) throw new Error("ChatGPT authorization denied")
  if (url.searchParams.getAll("client_id").length > 1) throw new Error("Ambiguous ChatGPT client ID")
  const supplied = url.searchParams.get("client_id")
  const clientId = issuedClientID(supplied ?? attempt.clientId ?? "")
  if (attempt.clientId && clientId !== attempt.clientId) throw new Error("ChatGPT registration changed")
  const code = url.searchParams.get("code")
  if (!code || url.searchParams.getAll("code").length !== 1) throw new Error("Missing or ambiguous authorization code")
  return { code, clientId }
}

/** Unrelated HTTP requests must not consume or fail a pending sign-in. */
export function validateBinding(attempt: Attempt, url: URL) {
  const redirect = new URL(attempt.redirect)
  if (Date.now() >= attempt.expires || url.origin !== redirect.origin || url.pathname !== redirect.pathname ||
    url.searchParams.getAll("state").length !== 1 || url.searchParams.get("state") !== attempt.state)
    throw new Error("Invalid OAuth state or expired ChatGPT callback")
}

/** Returns a complete credential only after cryptographic identity validation. */
export async function exchange(
  attempt: Attempt,
  url: URL,
  methodID: Credential.OAuth["methodID"],
  transport: (url: string, init: RequestInit) => Promise<Response> = fetch,
  jwksURL = new URL(`${issuer}/.well-known/jwks.json`),
) {
  const grant = callback(attempt, url)
  const response = await transport(`${issuer}/api/accounts/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: grant.clientId,
      code: grant.code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect, resource }),
  })
  if (response.status !== 200) {
    const error = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ error: Schema.String })))(await response.text())
    if (Option.isSome(error) && error.value.error === "invalid_grant")
      throw new InvalidGrantError({ clientId: grant.clientId, hostId: attempt.hostId, registration: attempt.saved })
    throw new Error(`ChatGPT token exchange failed: ${response.status}`)
  }
  const tokens = Schema.decodeUnknownOption(Schema.fromJsonString(Tokens))(await response.text())
  if (Option.isNone(tokens)) throw new Error("Invalid ChatGPT token response")
  const { createRemoteJWKSet, jwtVerify } = await import("jose")
  const identity = await jwtVerify(tokens.value.id_token, createRemoteJWKSet(jwksURL), {
    issuer, audience: grant.clientId, algorithms: ["RS256", "ES256"], requiredClaims: ["sub", "exp", "iat", "nonce"],
  })
  if (identity.payload.nonce !== attempt.nonce || !identity.payload.sub?.trim())
    throw new Error("Invalid ChatGPT identity or nonce")
  if (Array.isArray(identity.payload.aud) && identity.payload.aud.length > 1 && identity.payload.azp !== grant.clientId)
    throw new Error("Invalid ChatGPT authorized party")
  // An issued client is workspace-bound. Subject + issued client, never email,
  // identifies a returning registration; OpenAI access-token metadata is opaque.
  if (attempt.saved && identity.payload.sub !== attempt.saved.subject) throw new Error("ChatGPT account changed")
  // Persist continuity facts only here, after signature and OIDC validation.
  // Refresh must not need the old signing key after JWKS key retirement.
  const validatedIdentity = Schema.decodeUnknownOption(ValidatedIdentity)({ issuer, clientId: grant.clientId,
    subject: identity.payload.sub, audiences: [identity.payload.aud].flat(), nonce: identity.payload.nonce,
    ...(identity.payload.auth_time === undefined ? {} : { authTime: identity.payload.auth_time }),
    ...(identity.payload.azp === undefined ? {} : { authorizedParty: identity.payload.azp }) })
  if (Option.isNone(validatedIdentity)) throw new Error("Invalid ChatGPT continuity claims")
  const granted = tokens.value.scope.split(/\s+/).filter(Boolean)
  return Credential.OAuth.make({
    type: "oauth", methodID, access: tokens.value.access_token, refresh: tokens.value.refresh_token,
    expires: Date.now() + tokens.value.expires_in * 1000,
    metadata: { clientId: grant.clientId, hostId: attempt.hostId, issuer, subject: identity.payload.sub,
       idToken: tokens.value.id_token, scopes: granted, validatedIdentity: validatedIdentity.value },
  })
}

export function registration(metadata: unknown): Registration {
  const value = Schema.decodeUnknownOption(Registration)(metadata)
  if (Option.isNone(value)) throw new Error("Missing validated ChatGPT registration; sign in again")
  issuedClientID(value.value.clientId)
  return value.value
}

/** Protected-store facts produced by exchange, not claims decoded from a hint. */
export function continuity(metadata: unknown) {
  const saved = registration(metadata)
  const value = Schema.decodeUnknownOption(Schema.Struct({ validatedIdentity: ValidatedIdentity }))(metadata)
  if (Option.isNone(value)) throw new Error("Missing validated ChatGPT continuity claims; sign in again")
  const identity = value.value.validatedIdentity
  if (identity.issuer !== saved.issuer || identity.clientId !== saved.clientId || identity.subject !== saved.subject ||
    !identity.audiences.includes(saved.clientId)) throw new Error("ChatGPT continuity registration changed")
  return identity
}

/** Caller must reject inherited credentials and serialize/store refresh atomically. */
export function refreshBody(value: Pick<Credential.OAuth, "refresh" | "metadata">) {
  return new URLSearchParams({ grant_type: "refresh_token", client_id: registration(value.metadata).clientId,
    refresh_token: value.refresh, resource })
}

export function requirePlanUsage(value: Pick<Credential.OAuth, "metadata">) {
  if (!registration(value.metadata).scopes.includes("chatgpt.tokens.use.direct"))
    throw new Error("ChatGPT plan use is not authorized; sign in again")
}

function issuedClientID(value: string) {
  if (!value.trim() || value !== value.trim() || value === "dynamic_agent_client" ||
    value === "app_EMoamEEZ73f0CkXaXp7hrann") throw new Error("Missing issued ChatGPT client ID")
  return value
}
