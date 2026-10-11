export * as CapabilityVerifiers from "./index"

import type { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { createHash } from "node:crypto"
import { CloudflareVerifier } from "./cloudflare"
import type { CapabilityVerifierContract } from "./contract"
import { CapabilityDiscordVerifier } from "./discord"
import { GlobalpingVerifier } from "./globalping"
import { LinearVerifier } from "./linear"
import { NeonVerifier } from "./neon"
import { OpenAIVerifier } from "./openai"
import { RunwayVerifier } from "./runway"
import { CapabilitySlackVerifier } from "./slack"
import { StripeVerifier } from "./stripe"
import { SupabaseVerifier } from "./supabase"

// Known limit: Cloudflare account-owned tokens (`cfat_…`) cannot pass `/user/tokens/verify` and report
// `authentication_required`; only user API tokens verify until an account-scoped route is designed.
// Linear answers bad keys with HTTP 400 or 401 plus a GraphQL error body; bodies are never parsed on error, so 400
// rejections surface as `connection_unavailable` and only 401/403 as `authentication_required`.
// `satisfies` makes a provider added to CapabilitySetup.Provider without a descriptor a type error.
export const descriptors = Object.freeze({
  slack: CapabilitySlackVerifier.descriptor, discord: CapabilityDiscordVerifier.descriptor,
  cloudflare: CloudflareVerifier.descriptor, supabase: SupabaseVerifier.descriptor, neon: NeonVerifier.descriptor,
  linear: LinearVerifier.descriptor, stripe: StripeVerifier.descriptor, openai: OpenAIVerifier.descriptor,
  runway: RunwayVerifier.descriptor, globalping: GlobalpingVerifier.descriptor,
} satisfies Record<CapabilitySetup.Provider, CapabilityVerifierContract.Descriptor>)
// Slack/Discord keep their pre-registry stored subject shapes. Other verified providers get only the generic rules;
// their identify() already enforces the vendor format.
const subjects: Readonly<Partial<Record<CapabilitySetup.Provider, (subject: string) => boolean>>> =
  Object.freeze({ slack: CapabilitySlackVerifier.subject, discord: CapabilityDiscordVerifier.subject })

export function descriptor(provider: CapabilitySetup.Provider): CapabilityVerifierContract.Descriptor {
  return descriptors[provider]
}

/** Credential-only subject: names the key without revealing it, so distinct keys stay distinct connections. */
export function fingerprint(key: string) {
  return `key:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`
}

/** Shared by the verifier and setup: a stored subject is bounded, canonical, keyless, and fits its provider. */
export function accepts(selected: CapabilityVerifierContract.Descriptor, subject: string, key: string) {
  if (!subject || subject.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(subject) || subject.includes(key)) return false
  if (selected.verification === "credential-only") return subject === fingerprint(key)
  return subjects[selected.provider]?.(subject) ?? true
}
