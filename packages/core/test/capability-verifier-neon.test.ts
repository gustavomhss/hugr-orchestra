import { describe, expect, test } from "bun:test"
import { NeonVerifier } from "@orchestra/core/capability/connection/verifiers/neon"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Exit } from "effect"

const key = "napi_fixtureonlysecret0123456789abcdef"
const user = "629982cc-de05-43db-ae16-28f2399c4910"
const org = "org-morning-bread-81040908"

function run(answer: Effect.Effect<unknown, Capability.Failure>) {
  const seen: unknown[] = []
  return Effect.runPromiseExit(NeonVerifier.descriptor.identify((input) => {
    seen.push(input)
    return answer
  })).then((exit) => ({ exit, seen }))
}

function code(exit: Exit.Exit<string, Capability.Failure>) {
  if (Exit.isSuccess(exit)) throw new Error("IDENTITY_ACCEPTED_INVALID_RESPONSE")
  const failure = exit.cause.reasons.find((reason) => reason._tag === "Fail")
  return failure?._tag === "Fail" ? failure.error.code : undefined
}

describe("neon verifier", () => {
  test("pins the platform endpoint, identity origin and bearer header", () => {
    expect(NeonVerifier.descriptor.provider).toBe("neon")
    expect(NeonVerifier.descriptor.endpoint).toBe("https://mcp.neon.tech/mcp")
    expect(String(NeonVerifier.descriptor.integrationID)).toBe("capability.neon")
    expect(NeonVerifier.descriptor.verification).toBe("verified")
    expect(NeonVerifier.descriptor.origin).toBe("https://console.neon.tech")
    expect(NeonVerifier.descriptor.authorization(key)).toBe(`Bearer ${key}`)
  })

  // Doc-shaped bodies: https://neon.com/api_spec/release/v2.json `AuthDetailsResponse`.
  test("user and org keys yield their account ID from one read-only call", async () => {
    for (const [account_id, auth_method] of [[user, "api_key_user"], [org, "api_key_org"]]) {
      const result = await run(Effect.succeed({ account_id, auth_method, auth_data: key }))
      expect(result.seen).toEqual([{ method: "GET", path: "/api/v2/auth" }])
      expect(result.exit).toEqual(Exit.succeed(account_id))
      if (Exit.isSuccess(result.exit)) expect(result.exit.value.includes(key)).toBe(false)
    }
  })

  test("malformed identity or a non-key auth method is unavailable", async () => {
    const bodies = [
      { auth_method: "api_key_user" }, { account_id: user }, { account_id: "", auth_method: "api_key_user" },
      { account_id: user.toUpperCase(), auth_method: "api_key_user" }, { account_id: `${org}\n`, auth_method: "api_key_org" },
      { account_id: "-org", auth_method: "api_key_org" }, { account_id: "a".repeat(61), auth_method: "api_key_org" },
      { account_id: "org_x", auth_method: "api_key_org" }, { account_id: 7, auth_method: "api_key_user" },
      { account_id: user, auth_method: "oauth" }, { account_id: user, auth_method: "session_cookie" }, null, user,
    ]
    for (const value of bodies) expect(code((await run(Effect.succeed(value))).exit)).toBe("connection_unavailable")
  })

  test("transport rejections propagate unchanged", async () => {
    for (const failure of ["authentication_required", "connection_unavailable"] as const)
      expect(code((await run(Effect.fail(new Capability.Failure({ code: failure, message: "fixture" })))).exit)).toBe(failure)
  })
})
