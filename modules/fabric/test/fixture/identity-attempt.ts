import { expect } from "bun:test"
import { Location } from "@orchestra/core/location"
import { Capability } from "@orchestra/schema/capability"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { Effect, Exit } from "effect"
import { FabricContexts } from "../../src/context"
import { FabricIdentityAttempts } from "../../src/identity-attempt"
import { FabricIdentityProfile } from "../../src/identity-profile"
import { owner, request } from "./context"

export const scopes: FabricIdentityAttempt.Scopes = ["https://api.fabric.microsoft.com/Workspace.Read.All"]
export function profile() {
  const result = FabricIdentityProfile.admit({
    deployment: "desktop",
    clientID: "11111111-2222-4333-8444-555555555555",
    redirectUri: "http://localhost:54321/api/fabric/oauth/callback",
  })
  if (!result.ok) throw new Error("Host profile positive control failed")
  return result.value
}

export function setup(
  root: import("@orchestra/schema/schema").AbsolutePath,
  options?: { maxAttempts?: number; now?: () => number },
) {
  return Effect.gen(function* () {
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root })
    const info = yield* request(operators, contexts.create({}))
    const host = profile()
    const attempts = yield* FabricIdentityAttempts.make({ operators, root, profile: host, ...options })
    const input = { context: info.context, scopes }
    function run<A, E, R>(effect: Effect.Effect<A, E, R>, key?: string) {
      return request(operators, effect, key).pipe(Effect.provideService(Location.Service, info.location))
    }
    return { operators, contexts, info, host, attempts, input, run }
  })
}

export function refusal<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  code: FabricIdentityAttempt.Failure["code"] | Capability.ErrorCode,
) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("Expected typed identity admission refusal")
    expect(exit.cause.reasons).toHaveLength(1)
    const reason = exit.cause.reasons[0]
    if (reason?._tag !== "Fail") throw new Error("A defect/interruption is not the expected refusal")
    expect(
      reason.error instanceof FabricIdentityAttempt.Failure ||
        reason.error instanceof FabricContext.Failure ||
        reason.error instanceof Capability.Failure,
    ).toBe(true)
    if (
      !(reason.error instanceof FabricIdentityAttempt.Failure) &&
      !(reason.error instanceof FabricContext.Failure) &&
      !(reason.error instanceof Capability.Failure)
    )
      throw new Error("Unexpected identity error")
    expect(reason.error.code).toBe(code)
    return reason.error
  })
}
