import { expect } from "bun:test"
import { StripeVerifier } from "@orchestra/core/capability/connection/verifiers/stripe"
import type { CapabilityVerifierContract } from "@orchestra/core/capability/connection/verifiers/contract"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Exit } from "effect"
import { it } from "./lib/effect"

const key = "rk_test_fixtureOnlySecret0123456789"

function fake(response: unknown) {
  const seen: Parameters<CapabilityVerifierContract.Call>[0][] = []
  const call: CapabilityVerifierContract.Call = (input) => {
    seen.push(input)
    return response instanceof Capability.Failure ? Effect.fail(response) : Effect.succeed(response)
  }
  return { call, seen }
}

const code = (exit: Exit.Exit<string, Capability.Failure>) => {
  if (Exit.isSuccess(exit)) throw new Error("STRIPE_ACCEPTED_INVALID_IDENTITY")
  const error = exit.cause.reasons.flatMap((reason) => reason._tag === "Fail" ? [reason.error] : [])[0]
  expect(JSON.stringify(error)).not.toContain(key)
  return error?.code
}

it.effect("stripe descriptor binds the platform MCP endpoint, Bearer key and own-account route", () => Effect.gen(function* () {
  const d = StripeVerifier.descriptor
  expect(d).toMatchObject({ provider: "stripe", endpoint: "https://mcp.stripe.com", integrationID: "capability.stripe",
    verification: "verified", origin: "https://api.stripe.com" })
  expect(d.authorization(key)).toBe(`Bearer ${key}`)
  expect(Object.isFrozen(d)).toBe(true)
  const f = fake({ id: "acct_1Nv0FGQ9RKHgCVdK", object: "account", email: key, business_profile: { name: key }, settings: { secret: key } })
  const subject = yield* d.identify(f.call)
  expect(subject).toBe("acct_1Nv0FGQ9RKHgCVdK")
  expect(subject).toMatch(/^acct_[A-Za-z0-9]{1,64}$/)
  expect(f.seen).toEqual([{ method: "GET", path: "/v1/account" }])
}))

it.effect("stripe malformed accounts fail closed and transport failures propagate", () => Effect.gen(function* () {
  const malformed = [{}, null, [], { id: "cus_123" }, { id: "acct_" }, { id: `acct_${"a".repeat(65)}` }, { id: "acct_12\n" },
    { id: "acct_1-2" }, { id: 42 }, { error: { type: "invalid_request_error", message: key } }]
  for (const body of malformed)
    expect(code(yield* StripeVerifier.descriptor.identify(fake(body).call).pipe(Effect.exit))).toBe("connection_unavailable")
  for (const failure of ["authentication_required", "connection_unavailable"] as const)
    expect(code(yield* StripeVerifier.descriptor.identify(fake(new Capability.Failure({ code: failure,
      message: "Capability connection verification is unavailable" })).call).pipe(Effect.exit))).toBe(failure)
}))

it.effect("stripe key pattern accepts only restricted keys before any network call", () => Effect.gen(function* () {
  const pattern = StripeVerifier.descriptor.keyPattern
  if (!pattern) throw new Error("STRIPE_KEY_PATTERN_MISSING")
  for (const accepted of [key, "rk_live_51Nv0FGQ9RKHgCVdK"]) expect(pattern.test(accepted)).toBe(true)
  for (const refused of ["sk_live_51Nv0FGQ9RKHgCVdK", "sk_test_51Nv0FGQ9RKHgCVdK", "pk_live_51Nv0FGQ9RKHgCVdK",
    "rk_prod_51Nv0FGQ9RKHgCVdK", "rk_live_short", `${key}\n`, ` ${key}`, "rk_live_51Nv0FGQ9-RKHgCVdK", ""])
    expect(pattern.test(refused)).toBe(false)
}))
