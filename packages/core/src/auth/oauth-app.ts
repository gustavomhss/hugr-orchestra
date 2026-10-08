export * as OwnOAuthApp from "./oauth-app"

const keys = {
  openai: "ORCHESTRA_OPENAI_CLIENT_ID",
  copilot: "ORCHESTRA_COPILOT_CLIENT_ID",
  xai: "ORCHESTRA_XAI_CLIENT_ID",
  digitalocean: "ORCHESTRA_DIGITALOCEAN_CLIENT_ID",
} as const

const thirdPartyIDs = new Set([
  "app_EMoamEEZ73f0CkXaXp7hrann",
  "Ov23li8tweQw6odWQebz",
  "b1a00492-073a-47ea-816f-4c329264a828",
  "b1a6c5158156caac821fd1b30253ca8acb52454a48fa744420e41889cb589f82",
])

export class MissingRegistrationError extends Error {
  override name = "MissingRegistrationError"
}

export class ThirdPartyRegistrationError extends Error {
  override name = "ThirdPartyRegistrationError"
}

// Reject known borrowed IDs; ownership and the consent name require provider-side evidence.
export function requireClientID(provider: "openai" | "copilot" | "xai" | "digitalocean"): string {
  const key = keys[provider]
  const value = process.env[key]?.trim()
  if (value === undefined && provider === "digitalocean")
    return "8927d6fd39836377289fc753b996b8bb7a9f71870f0a2b01ddf1f45d7d9bc3cb"
  if (!value) throw new MissingRegistrationError(`${provider}: ${key}`)
  if (thirdPartyIDs.has(value)) throw new ThirdPartyRegistrationError(`${provider}: ${key}`)
  return value
}
