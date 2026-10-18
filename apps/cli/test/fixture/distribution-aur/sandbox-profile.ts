import { createHash } from "node:crypto"
import { Schema } from "effect"

// Apache-2.0 upstream default matching both hosted daemon receipts (28.0.4).
// This version already includes all three Landlock calls:
// pin it unchanged rather than inventing a reduced allowlist or duplicating rules.
export const aurProfileProvenance = {
  repository: "https://github.com/moby/moby",
  version: "v28.0.4",
  daemonVersion: "28.0.4",
  commit: "6430e49a55babd9b8f4d08e70ecb2b68900770fe",
  url: "https://raw.githubusercontent.com/moby/moby/6430e49a55babd9b8f4d08e70ecb2b68900770fe/profiles/seccomp/default.json",
  upstreamSha256: "9c1025c88ccaa517b648da571961838744ea2137f176bfe6a48b21294cae9c76",
  appliedSha256: "a1c88dd679944776676eede5dd9da92a058731b85b9a1409f304f6acb2ce94f4",
  license: "Apache-2.0",
  additions: [],
}

export async function aurSandboxProfile() {
  const response = await fetch(aurProfileProvenance.url, { signal: AbortSignal.timeout(30_000) }).catch((cause: unknown) => {
    throw new Error("AUR_PINNED_SECCOMP_PROFILE_UNAVAILABLE", { cause })
  })
  if (!response.ok) throw new Error(`AUR_PINNED_SECCOMP_PROFILE_UNAVAILABLE: HTTP ${response.status}`)
  const bytes = await response.text()
  if (createHash("sha256").update(bytes).digest("hex") !== aurProfileProvenance.upstreamSha256)
    throw new Error("AUR_UPSTREAM_SECCOMP_PROFILE_DIGEST_MISMATCH")
  // Decode without dropping unknown profile fields. Docker consumes every byte
  // of the canonical object whose digest the caller checks again after create.
  const profile = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(bytes)
  const canonical = JSON.stringify(profile)
  if (createHash("sha256").update(canonical).digest("hex") !== aurProfileProvenance.appliedSha256)
    throw new Error("AUR_APPLIED_SECCOMP_PROFILE_DIGEST_MISMATCH")
  return canonical
}
