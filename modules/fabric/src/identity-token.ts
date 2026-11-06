export * as FabricIdentityTokens from "./identity-token"

import { Effect, Schema } from "effect"
import type { FabricIdentityTokensContract } from "./identity-token-contract"

export class Failure extends Schema.TaggedErrorClass<Failure>()("FabricIdentityToken.Failure", {
  code: Schema.Literals(["invalid-input", "denied", "unavailable"]),
  message: Schema.String,
}) {}

// Acceptance scaffold: no token is verified, and no input is accepted as proof yet.
export const make: FabricIdentityTokensContract.Factory = (_options) =>
  Effect.succeed(
    Object.freeze({
      verify: () =>
        Effect.fail(new Failure({ code: "unavailable", message: "Fabric identity token verification is unavailable" })),
      owns: (_input: unknown): _input is FabricIdentityTokensContract.Proof => false,
    }),
  )
