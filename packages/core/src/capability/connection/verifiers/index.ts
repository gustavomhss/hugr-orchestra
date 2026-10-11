export * as CapabilityVerifiers from "./index"

import type { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { createHash } from "node:crypto"
import type { CapabilityVerifierContract } from "./contract"
import { CapabilityDiscordVerifier } from "./discord"
import { CapabilitySlackVerifier } from "./slack"

// TEMPORARY until V1/V2 descriptors land: becomes `satisfies Record<CapabilitySetup.Provider, Descriptor>`.
export const descriptors: Readonly<Partial<Record<CapabilitySetup.Provider, CapabilityVerifierContract.Descriptor>>> =
  Object.freeze({ slack: CapabilitySlackVerifier.descriptor, discord: CapabilityDiscordVerifier.descriptor })
// Verified providers with a frozen stored subject shape beyond the shared rules.
const subjects: Readonly<Partial<Record<CapabilitySetup.Provider, (subject: string) => boolean>>> =
  Object.freeze({ slack: CapabilitySlackVerifier.subject, discord: CapabilityDiscordVerifier.subject })

export function descriptor(provider: CapabilitySetup.Provider) {
  return descriptors[provider]
}

/** Credential-only subject: names the key without revealing it, so distinct keys stay distinct connections. */
export function fingerprint(key: string) {
  return `key:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`
}

/** Shared by the verifier and setup: a stored subject is bounded, canonical, keyless, and fits its provider. */
export function accepts(provider: CapabilitySetup.Provider, subject: string, key: string) {
  const selected = descriptors[provider]
  if (!selected || !subject || subject.length > 4096 || subject !== subject.trim() || /[\u0000-\u001f\u007f]/.test(subject) ||
    subject.includes(key)) return false
  if (selected.verification === "credential-only") return subject === fingerprint(key)
  return subjects[provider]?.(subject) ?? true
}
