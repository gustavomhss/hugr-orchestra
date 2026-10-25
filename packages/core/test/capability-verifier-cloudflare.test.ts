import { describe, expect, test } from "bun:test"
import { CloudflareVerifier } from "@orchestra/core/capability/connection/verifiers/cloudflare"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Exit } from "effect"

const key = "cf-fixture-only-secret-0123456789abcdef"
const id = "ed17574386854bf78a67040be0a770b0"
// Doc-shaped body: https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/verify/
const body = (result: Record<string, unknown>) => ({ success: true, errors: [], messages: [
  { code: 10000, message: "This API Token is valid and active", type: null }], result })

function run(answer: Effect.Effect<unknown, Capability.Failure>) {
  const seen: unknown[] = []
  return Effect.runPromiseExit(CloudflareVerifier.descriptor.identify((input) => {
    seen.push(input)
    return answer
  })).then((exit) => ({ exit, seen }))
}

function code(exit: Exit.Exit<string, Capability.Failure>) {
  if (Exit.isSuccess(exit)) throw new Error("IDENTITY_ACCEPTED_INVALID_RESPONSE")
  const failure = exit.cause.reasons.find((reason) => reason._tag === "Fail")
  return failure?._tag === "Fail" ? failure.error.code : undefined
}

describe("cloudflare verifier", () => {
  test("pins the platform endpoint, identity origin and bearer header", () => {
    expect(CloudflareVerifier.descriptor.provider).toBe("cloudflare")
    expect(CloudflareVerifier.descriptor.endpoint).toBe("https://mcp.cloudflare.com/mcp?codemode=false")
    expect(String(CloudflareVerifier.descriptor.integrationID)).toBe("capability.cloudflare")
    expect(CloudflareVerifier.descriptor.verification).toBe("verified")
    expect(CloudflareVerifier.descriptor.origin).toBe("https://api.cloudflare.com")
    expect(CloudflareVerifier.descriptor.authorization(key)).toBe(`Bearer ${key}`)
  })

  test("an active token yields the token subject from one read-only call", async () => {
    const result = await run(Effect.succeed(body({ id, status: "active", not_before: "2018-07-01T05:20:00Z",
      expires_on: "2030-01-01T00:00:00Z", leaked: key })))
    expect(result.seen).toEqual([{ method: "GET", path: "/client/v4/user/tokens/verify" }])
    expect(result.exit).toEqual(Exit.succeed(`token:${id}`))
    if (Exit.isSuccess(result.exit)) expect(result.exit.value.includes(key)).toBe(false)
  })

  test("disabled and expired tokens are rejected keys", async () => {
    for (const status of ["disabled", "expired"])
      expect(code((await run(Effect.succeed(body({ id, status })))).exit)).toBe("authentication_required")
  })

  test("malformed or missing identity is unavailable", async () => {
    const bodies = [
      body({ status: "active" }), body({ id: "", status: "active" }), body({ id: id.toUpperCase(), status: "active" }),
      body({ id: `${id}0`, status: "active" }), body({ id: `${id}\n`, status: "active" }), body({ id: 42, status: "active" }),
      body({ id, status: "unknown" }), body({ id }), { ...body({ id, status: "active" }), success: false },
      { success: true }, null, "token", [],
    ]
    for (const value of bodies) expect(code((await run(Effect.succeed(value))).exit)).toBe("connection_unavailable")
  })

  test("transport rejections propagate unchanged", async () => {
    for (const failure of ["authentication_required", "connection_unavailable"] as const)
      expect(code((await run(Effect.fail(new Capability.Failure({ code: failure, message: "fixture" })))).exit)).toBe(failure)
  })
})
