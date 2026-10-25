export * as SupabaseVerifier from "./supabase"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

// https://api.supabase.com/api/v1-json `V1ProfileResponse`: `gotrue_id` is the GoTrue user UUID (lowercase).
const Profile = Schema.Struct({
  gotrue_id: Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/)),
})

export const descriptor: CapabilityVerifierContract.Descriptor = Object.freeze({
  provider: "supabase",
  // Platform MCP URL: capability-assets/src/providers.ts (A14); host pinned in capability/mcp/index.ts `hosts`.
  endpoint: "https://mcp.supabase.com/mcp",
  integrationID: Integration.ID.make("capability.supabase"),
  verification: "verified",
  origin: "https://api.supabase.com",
  authorization: (key: string) => `Bearer ${key}`,
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    const profile = Schema.decodeUnknownOption(Profile)(yield* call({ method: "GET", path: "/v1/profile" }))
    if (Option.isNone(profile)) return yield* new Capability.Failure({ code: "connection_unavailable",
      message: "Capability connection verification is unavailable" })
    return profile.value.gotrue_id
  }),
})
