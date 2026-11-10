export * as FabricIdentityProfile from "./identity-profile"

import { timingSafeEqual } from "node:crypto"
import { Option, Schema } from "effect"

export type Profile = Readonly<{
  deployment: "desktop" | "server"
  clientID: string
  origin: string
  redirectUri: string
}>
export type Result<A> = Readonly<{ ok: true; value: A }> | Readonly<{ ok: false; code: "invalid-input" | "denied" }>
export type Callback = Readonly<{ outcome: "code"; code: string }> | Readonly<{ outcome: "denied" }>

const clientID = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/i),
)
const Host = Schema.Union([
  Schema.Struct({ deployment: Schema.Literal("desktop"), clientID, redirectUri: Schema.String }),
  Schema.Struct({ deployment: Schema.Literal("server"), clientID, origin: Schema.String, redirectUri: Schema.String }),
])
const Input = Schema.Struct({ url: Schema.String, expectedState: Schema.String })
const admitted = new WeakSet<Profile>()
const callbackPath = "/api/fabric/oauth/callback"
const statePattern = /^[A-Za-z0-9_-]{32,256}(?![\s\S])/
const controls = /[\u0000-\u001f\u007f]/
// Closed provider response fields. Hints are accepted only to discard them, never to retarget exchange or choose identity.
const parameters = new Set([
  "state",
  "code",
  "session_state",
  "iss",
  "error",
  "error_description",
  "error_uri",
  "nonce",
  "client_info",
  "cloud_instance_name",
  "cloud_instance_host_name",
  "cloud_graph_host_name",
  "msgraph_host",
])

/** Configuration is supplied by the trusted host, never a workspace or a callback request. This is not an Authority. */
export function admit(input: unknown): Result<Profile> {
  const decoded = Schema.decodeUnknownOption(Host)(input, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) return { ok: false, code: "invalid-input" }
  const value = decoded.value
  const redirect = canonicalURL(value.redirectUri, 4096)
  if (!redirect || redirect.username || redirect.password || redirect.href !== redirect.origin + callbackPath)
    return { ok: false, code: "invalid-input" }
  if (
    value.deployment === "desktop" &&
    (redirect.protocol !== "http:" || redirect.hostname !== "localhost" || !redirect.port || Number(redirect.port) < 1)
  )
    return { ok: false, code: "invalid-input" }
  const origin = value.deployment === "server" ? canonicalURL(value.origin, 4096) : redirect
  if (
    !origin ||
    (value.deployment === "server" &&
      (origin.protocol !== "https:" ||
        origin.username ||
        origin.password ||
        origin.href !== origin.origin + "/" ||
        redirect.protocol !== "https:" ||
        redirect.origin !== origin.origin))
  )
    return { ok: false, code: "invalid-input" }
  const profile = Object.freeze({
    deployment: value.deployment,
    clientID: value.clientID.toLowerCase(),
    origin: origin.origin,
    redirectUri: redirect.href,
  })
  admitted.add(profile)
  return { ok: true, value: profile }
}

/** Host-local profile provenance only, never operator authority or Microsoft identity. */
export function isAdmitted(profile: Profile) {
  return admitted.has(profile)
}

/** Syntax/state admission only; the future exchange host owns consumption, identity verification and projection. */
export function callback(profile: Profile, input: Readonly<{ url: string; expectedState: string }>): Result<Callback> {
  if (!admitted.has(profile)) return { ok: false, code: "denied" }
  const decoded = Schema.decodeUnknownOption(Input)(input, { onExcessProperty: "error" })
  if (Option.isNone(decoded) || !statePattern.test(decoded.value.expectedState))
    return { ok: false, code: "invalid-input" }
  const value = decoded.value
  if (
    Buffer.byteLength(value.url) > 16 * 1024 ||
    controls.test(value.url) ||
    value.url.trim() !== value.url ||
    !URL.canParse(value.url)
  )
    return { ok: false, code: "invalid-input" }
  const url = new URL(value.url)
  if (
    url.origin !== profile.origin ||
    url.pathname !== callbackPath ||
    url.username ||
    url.password ||
    value.url.includes("#") ||
    !value.url.startsWith(profile.redirectUri + "?")
  )
    return { ok: false, code: "denied" }
  const keys = [...url.searchParams.keys()]
  if (keys.length === 0 || new Set(keys).size !== keys.length || keys.some((key) => !parameters.has(key)))
    return { ok: false, code: "invalid-input" }
  const state = url.searchParams.get("state")
  if (
    !state ||
    !statePattern.test(state) ||
    state.length !== value.expectedState.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(value.expectedState))
  )
    return { ok: false, code: "denied" }
  const code = url.searchParams.get("code")
  if (url.searchParams.has("error")) {
    if (!url.searchParams.get("error") || url.searchParams.has("code")) return { ok: false, code: "invalid-input" }
    return { ok: true, value: { outcome: "denied" } }
  }
  if (!code || Buffer.byteLength(code) > 8192 || controls.test(code)) return { ok: false, code: "invalid-input" }
  return { ok: true, value: { outcome: "code", code } }
}

function canonicalURL(input: string, maximum: number) {
  if (Buffer.byteLength(input) > maximum || controls.test(input) || !URL.canParse(input)) return
  const url = new URL(input)
  // Host settings are canonical URIs; do not quietly normalize a different registered redirect or a bare ?/#.
  if (url.href !== input && url.href !== input + "/") return
  return url
}
