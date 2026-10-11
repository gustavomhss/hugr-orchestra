export * as LinearVerifier from "./linear"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

const UUID = Schema.String.check(Schema.isPattern(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![\s\S])/))
const Viewer = Schema.Struct({ data: Schema.Struct({ viewer: Schema.Struct({ id: UUID, organization: Schema.Struct({ id: UUID }) }) }) })
const Errors = Schema.Struct({ errors: Schema.Array(Schema.Struct({ extensions: Schema.optionalKey(Schema.Struct({
  code: Schema.optionalKey(Schema.String), type: Schema.optionalKey(Schema.String),
})) })).check(Schema.isMinLength(1)) })
const failure = (code: Capability.ErrorCode) => new Capability.Failure({ code,
  message: "Capability connection verification is unavailable" })

/**
 * Linear personal API key. The stored endpoint is the hosted MCP URL the platform leaf resolves
 * (`mcp/index.ts` hosts.linear, assets A21). GraphQL takes the raw key, without `Bearer`.
 * Subject: `[organizationID, userID]` as JSON.
 */
export const descriptor: CapabilityVerifierContract.Descriptor = Object.freeze({
  provider: "linear",
  endpoint: "https://mcp.linear.app/mcp",
  integrationID: Integration.ID.make("capability.linear"),
  verification: "verified",
  origin: "https://api.linear.app",
  authorization: (key: string) => key,
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    const value = yield* call({ method: "POST", path: "/graphql", body: { query: "{ viewer { id organization { id } } }" } })
    // GraphQL reports rejected keys in the body; any other error is an unavailable identity.
    const errors = Schema.decodeUnknownOption(Errors)(value)
    if (Option.isSome(errors)) return yield* failure(errors.value.errors.some((error) =>
      error.extensions?.code === "AUTHENTICATION_ERROR" || error.extensions?.type === "authentication error")
      ? "authentication_required" : "connection_unavailable")
    const viewer = Schema.decodeUnknownOption(Viewer)(value)
    if (Option.isNone(viewer)) return yield* failure("connection_unavailable")
    return JSON.stringify([viewer.value.data.viewer.organization.id, viewer.value.data.viewer.id])
  }),
})
