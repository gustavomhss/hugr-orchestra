import { createHash } from "node:crypto"
import { Schema } from "effect"

// Apache-2.0 upstream default. v0.2.4 already includes all three Landlock calls:
// pin it unchanged rather than inventing a reduced allowlist or duplicating rules.
export const aurProfileProvenance = {
  repository: "https://github.com/moby/profiles",
  version: "seccomp/v0.2.4",
  commit: "245180c51918481c0525424b3ee025d2b435d46c",
  url: "https://raw.githubusercontent.com/moby/profiles/245180c51918481c0525424b3ee025d2b435d46c/seccomp/default.json",
  upstreamSha256: "785b2429264afba4d594320337cb17f144f3c7d51585f9805eef72e28f4f9334",
  appliedSha256: "4dc1298afa7676147c1320afa42d72691fc55379ae762b392b56853574a7a38a",
  license: "Apache-2.0",
  additions: [] as string[],
}

export async function aurSandboxProfile() {
  const response = await fetch(aurProfileProvenance.url, { signal: AbortSignal.timeout(30_000) })
  if(!response.ok) throw new Error(`AUR_PINNED_SECCOMP_PROFILE_UNAVAILABLE: HTTP ${response.status}`)
  const bytes = await response.text()
  if(createHash("sha256").update(bytes).digest("hex") !== aurProfileProvenance.upstreamSha256)
    throw new Error("AUR_UPSTREAM_SECCOMP_PROFILE_DIGEST_MISMATCH")
  // Decode without dropping unknown profile fields. Docker consumes every byte
  // of the canonical object whose digest the caller checks again after create.
  const profile = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(bytes)
  const canonical = JSON.stringify(profile)
  if(createHash("sha256").update(canonical).digest("hex") !== aurProfileProvenance.appliedSha256)
    throw new Error("AUR_APPLIED_SECCOMP_PROFILE_DIGEST_MISMATCH")
  return canonical
}
