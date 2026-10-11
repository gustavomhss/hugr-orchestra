export * as CapabilityDiscordVerifier from "./discord"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import { CapabilityDiscord } from "../../providers/discord"
import type { CapabilityVerifierContract } from "./contract"

const Snowflake = /^[0-9]{1,20}(?![\s\S])/
// Only bot tokens: a user or OAuth bearer must never be stored as a Discord bot connection.
const Identity = Schema.Struct({ id: Schema.String.check(Schema.isPattern(Snowflake)), bot: Schema.Literal(true) })

export const descriptor = Object.freeze({
  provider: "discord",
  endpoint: CapabilityDiscord.endpoint,
  integrationID: Integration.ID.make("capability.discord"),
  verification: "verified",
  origin: "https://discord.com",
  authorization: (key) => `Bot ${key}`,
  identify: (call) => call({ method: "GET", path: "/api/v10/users/@me" }).pipe(Effect.flatMap((value) => {
    const identity = Schema.decodeUnknownOption(Identity)(value)
    return Option.isSome(identity) ? Effect.succeed(identity.value.id) : Effect.fail(new Capability.Failure({
      code: "connection_unavailable", message: "Capability connection verification is unavailable" }))
  })),
} satisfies CapabilityVerifierContract.Descriptor)

export function subject(value: string) {
  return Snowflake.test(value)
}
