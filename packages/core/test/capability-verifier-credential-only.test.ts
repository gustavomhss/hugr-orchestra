import { expect } from "bun:test"
import { GlobalpingVerifier } from "@orchestra/core/capability/connection/verifiers/globalping"
import { OpenAIVerifier } from "@orchestra/core/capability/connection/verifiers/openai"
import { RunwayVerifier } from "@orchestra/core/capability/connection/verifiers/runway"
import type { CapabilityVerifierContract } from "@orchestra/core/capability/connection/verifiers/contract"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Exit } from "effect"
import { it } from "./lib/effect"

const key = "sk-proj-fixtureOnlySecret0123456789"

function fake(response: unknown) {
  const seen: Parameters<CapabilityVerifierContract.Call>[0][] = []
  const call: CapabilityVerifierContract.Call = (input) => {
    seen.push(input)
    return response instanceof Capability.Failure ? Effect.fail(response) : Effect.succeed(response)
  }
  return { call, seen }
}

const code = (exit: Exit.Exit<string, Capability.Failure>) => {
  if (Exit.isSuccess(exit)) throw new Error("CREDENTIAL_ONLY_ACCEPTED_INVALID_RESPONSE")
  const error = exit.cause.reasons.flatMap((reason) => reason._tag === "Fail" ? [reason.error] : [])[0]
  expect(JSON.stringify(error)).not.toContain(key)
  return error?.code
}

const cases = [
  { verifier: OpenAIVerifier.descriptor, endpoint: "https://api.openai.com/v1", origin: "https://api.openai.com",
    path: "/v1/models", headers: undefined,
    valid: { object: "list", data: [{ id: "gpt-image-1", object: "model", owned_by: key }] },
    malformed: [{}, null, { data: "x" }, { data: null }, { object: "list" }] },
  { verifier: RunwayVerifier.descriptor, endpoint: "https://api.dev.runwayml.com", origin: "https://api.dev.runwayml.com",
    path: "/v1/organization", headers: { "X-Runway-Version": "2024-11-06" },
    valid: { creditBalance: 1200, tier: { maxMonthlyCreditSpend: 100000, models: {} }, usage: { models: {} } },
    malformed: [{}, null, { creditBalance: "1200" }, { tier: {} }] },
  { verifier: GlobalpingVerifier.descriptor, endpoint: "https://mcp.globalping.dev/mcp", origin: "https://api.globalping.io",
    path: "/v1/limits", headers: undefined,
    valid: { rateLimit: { measurements: { create: { type: "user", limit: 500, remaining: 500, reset: 0 } } }, credits: { remaining: 1000 } },
    malformed: [{}, null, { rateLimit: {} }, { rateLimit: { measurements: { create: { type: "ip", limit: 250 } } } }, { credits: { remaining: 1 } }] },
] as const

it.effect("credential-only descriptors bind consumer endpoints, Bearer keys and fixed validity routes", () => Effect.gen(function* () {
  for (const item of cases) {
    const d = item.verifier
    expect(d).toMatchObject({ endpoint: item.endpoint, integrationID: `capability.${d.provider}`,
      verification: "credential-only", origin: item.origin })
    expect(d.headers).toEqual(item.headers)
    expect(d.authorization(key)).toBe(`Bearer ${key}`)
    expect(Object.isFrozen(d)).toBe(true)
    const f = fake(item.valid)
    // Dispatcher appends `:` + sha256(key)[0..16]; the descriptor only names the subject kind.
    expect(yield* d.identify(f.call)).toBe("key")
    expect(f.seen).toEqual([{ method: "GET", path: item.path }])
  }
}))

it.effect("credential-only descriptors fail closed on malformed bodies and propagate transport failures", () => Effect.gen(function* () {
  for (const item of cases) {
    for (const body of item.malformed)
      expect(code(yield* item.verifier.identify(fake(body).call).pipe(Effect.exit))).toBe("connection_unavailable")
    for (const failure of ["authentication_required", "connection_unavailable"] as const)
      expect(code(yield* item.verifier.identify(fake(new Capability.Failure({ code: failure,
        message: "Capability connection verification is unavailable" })).call).pipe(Effect.exit))).toBe(failure)
  }
}))
