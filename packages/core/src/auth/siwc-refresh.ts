export * as SiwcRefresh from "./siwc-refresh"

import { realpath } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Effect, Option, Schema } from "effect"
import { Credential } from "../credential"
import { Flock } from "../util/flock"
import { Siwc } from "./siwc"

const Tokens = Schema.Struct({
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.optional(Schema.NonEmptyString),
  expires_in: Schema.Int.check(Schema.isGreaterThan(0)),
  token_type: Schema.Literal("Bearer"),
  scope: Schema.optional(Schema.String),
  id_token: Schema.optional(Schema.NonEmptyString),
})

/** Only invoke inside resolve's credential lease, including native promise completion. */
export async function exchange(
  value: Credential.OAuth,
  transport: (url: string, init: RequestInit) => Promise<Response> = fetch,
  jwksURL = new URL(`${Siwc.issuer}/.well-known/jwks.json`),
) {
  const saved = Siwc.registration(value.metadata)
  // Missing pre-upgrade continuity data must fail before a server can rotate.
  const original = Siwc.continuity(value.metadata)
  const response = await transport(`${Siwc.issuer}/api/accounts/oauth/token`, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: Siwc.refreshBody(value),
    signal: AbortSignal.timeout(30000) })
  if (response.status !== 200) throw new Error(`ChatGPT refresh failed: ${response.status}; sign in again`)
  const tokens = Schema.decodeUnknownOption(Schema.fromJsonString(Tokens))(await response.text())
  if (Option.isNone(tokens)) throw new Error("Invalid ChatGPT refresh response")
  if (tokens.value.id_token) {
    const { createRemoteJWKSet, jwtVerify } = await import("jose")
    const keys = createRemoteJWKSet(jwksURL)
    const identity = await jwtVerify(tokens.value.id_token, keys, { issuer: saved.issuer, audience: saved.clientId,
      subject: saved.subject, algorithms: ["RS256", "ES256"], requiredClaims: ["sub", "exp", "iat"] })
    // OIDC Core 12.2: no fresh nonce on refresh. If present, it must be the
    // original nonce; audience and auth_time also retain their original meaning.
    if ((identity.payload.nonce !== undefined && identity.payload.nonce !== original.nonce) ||
      (identity.payload.auth_time !== undefined && identity.payload.auth_time !== original.authTime) ||
      identity.payload.azp !== original.authorizedParty ||
      JSON.stringify([identity.payload.aud].flat().sort()) !== JSON.stringify([...original.audiences].sort()))
      throw new Error("ChatGPT refresh identity changed")
  }
  return Credential.OAuth.make({ ...value, access: tokens.value.access_token, refresh: tokens.value.refresh_token ?? value.refresh,
    expires: Date.now() + tokens.value.expires_in * 1000,
    metadata: { ...value.metadata, ...saved, idToken: tokens.value.id_token ?? saved.idToken,
      scopes: tokens.value.scope === undefined ? saved.scopes : tokens.value.scope.split(/\s+/).filter(Boolean) } })
}

/** Process-global and cross-process; never key locks by token material or Location. */
export function resolve(input: {
  credentials: Credential.Interface
  credentialID: Credential.ID
  storePath: string
  refresh: (value: Credential.OAuth) => Effect.Effect<Credential.OAuth, unknown>
  lockDir?: string
}) {
  return Effect.tryPromise({ try: async () => {
    const path = input.storePath === ":memory:" ? input.storePath : await realpath(input.storePath)
    return Flock.withLock(`siwc-refresh:${path}:${input.credentialID}`, async () => {
      const current = await Effect.runPromise(input.credentials.get(input.credentialID))
      const source = await Effect.runPromise(input.credentials.inheritedFrom(input.credentialID))
      if (source) throw new Credential.InheritedError({ credentialID: input.credentialID, source, reason: "refresh" })
      if (!current || current.value.type !== "oauth") return current?.value
      if (current.value.expires > Date.now() + 5 * 60 * 1000) return current.value
      Siwc.registration(current.value.metadata)
      const next = await Effect.runPromise(input.refresh(current.value))
      if (await Effect.runPromise(input.credentials.replaceValueIf(current.id, current.value, next))) return next
      return (await Effect.runPromise(input.credentials.get(current.id)))?.value
    }, { dir: input.lockDir ?? (path === ":memory:" ? undefined : join(dirname(path), ".credential-locks")) })
  }, catch: (cause) => cause }).pipe(
    // An interrupted Effect must not release a lease while its native HTTP
    // promise can still rotate a token. Await request, validation, CAS and release.
    Effect.uninterruptible,
  )
}
