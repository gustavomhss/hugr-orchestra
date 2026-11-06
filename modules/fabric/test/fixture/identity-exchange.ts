import { expect } from "bun:test"
import { Effect, Exit } from "effect"
import { FabricIdentityExchange } from "../../src/identity-exchange"
import { FabricIdentityExchangeMaterial } from "../../src/identity-exchange-material"
import type { FabricIdentityExchangeContract } from "../../src/identity-exchange-contract"
import { callbackSetup, response } from "./identity-callback"
import { discoveryFixture, metadata } from "./identity-discovery"
import { objectID, tenant, tokenFixture } from "./identity-token"

export function contextualSetup(root: import("@orchestra/schema/schema").AbsolutePath) {
  return Effect.gen(function* () {
    const s = yield* callbackSetup(root)
    const signing = yield* Effect.promise(tokenFixture)
    const reader = yield* FabricIdentityExchangeMaterial.make(s.options)
    const ready = yield* s.run(s.callbacks.register(s.selection))
    s.callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))
    const claimed = yield* s.run(s.callbacks.claim({ ...s.selection, attempt: ready.attempt }))
    if (claimed.outcome !== "claimed") throw new Error("Expected a real callback claim")
    const input = { context: s.info.context, attempt: claimed.attempt, ticket: claimed.ticket }
    const state = { material: yield* s.run(reader.read({ context: input.context, attempt: input.attempt })), observe: (_path: string, _method: string) => {} }
    const f = yield* discoveryFixture(
      { keys: [{ ...signing.key, issuer: metadata.issuer }] },
      {
        observe: (path, method) => state.observe(path, method),
        token: async () => ({
          token_type: "Bearer",
          scope: state.material.scopes.join(" "),
          expires_in: 3600,
          ext_expires_in: 3600,
          access_token: "SYNTHETIC_CXH_ACCESS",
          refresh_token: "SYNTHETIC_CXH_REFRESH",
          id_token: await signing.sign({
            nonce: state.material.nonce,
            iat: Math.floor(Date.now() / 1000),
            nbf: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
          client_info: Buffer.from(JSON.stringify({ uid: objectID, utid: tenant })).toString("base64url"),
        }),
      },
    )
    const options = { ...s.options, callbacks: s.callbacks, network: f.network, timeoutMs: 10000 }
    const host = yield* FabricIdentityExchange.make(options)
    const next = () =>
      Effect.gen(function* () {
        const attempt = yield* s.run(s.attempts.begin(s.input))
        const ready = yield* s.run(s.callbacks.register({ ...s.selection, attempt }))
        s.callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))
        const claimed = yield* s.run(s.callbacks.claim({ ...s.selection, attempt: ready.attempt }))
        if (claimed.outcome !== "claimed") throw new Error("Expected another real callback claim")
        const input = { context: s.info.context, attempt: claimed.attempt, ticket: claimed.ticket }
        state.material = yield* s.run(reader.read({ context: input.context, attempt: input.attempt }))
        return input
      })
    return { ...s, f, state, selected: input, options, host, next }
  })
}

export function contextualRefusal<A, R>(
  operation: Effect.Effect<A, FabricIdentityExchangeContract.Error, R>,
  code: FabricIdentityExchangeContract.Error["code"],
) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(operation)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit) || exit.cause.reasons[0]?._tag !== "Fail")
      throw new Error("Expected typed contextual refusal")
    expect(exit.cause.reasons[0].error.code).toBe(code)
    return exit.cause.reasons[0].error
  })
}
