import { describe, expect, test } from "bun:test"
import { SupabaseVerifier } from "@orchestra/core/capability/connection/verifiers/supabase"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Exit } from "effect"

const key = "sbp_fixtureonlysecret0123456789abcdef0123"
const id = "8f1c6a2e-3b4d-4e5f-9a0b-1c2d3e4f5a6b"
// Doc-shaped body: https://api.supabase.com/api/v1-json `V1ProfileResponse`.
const profile = { gotrue_id: id, primary_email: "fixture@example.test", username: "fixture" }

function run(answer: Effect.Effect<unknown, Capability.Failure>) {
  const seen: unknown[] = []
  return Effect.runPromiseExit(SupabaseVerifier.descriptor.identify((input) => {
    seen.push(input)
    return answer
  })).then((exit) => ({ exit, seen }))
}

function code(exit: Exit.Exit<string, Capability.Failure>) {
  if (Exit.isSuccess(exit)) throw new Error("IDENTITY_ACCEPTED_INVALID_RESPONSE")
  const failure = exit.cause.reasons.find((reason) => reason._tag === "Fail")
  return failure?._tag === "Fail" ? failure.error.code : undefined
}

describe("supabase verifier", () => {
  test("pins the platform endpoint, identity origin and bearer header", () => {
    expect(SupabaseVerifier.descriptor.provider).toBe("supabase")
    expect(SupabaseVerifier.descriptor.endpoint).toBe("https://mcp.supabase.com/mcp")
    expect(String(SupabaseVerifier.descriptor.integrationID)).toBe("capability.supabase")
    expect(SupabaseVerifier.descriptor.verification).toBe("verified")
    expect(SupabaseVerifier.descriptor.origin).toBe("https://api.supabase.com")
    expect(SupabaseVerifier.descriptor.authorization(key)).toBe(`Bearer ${key}`)
  })

  test("a profile yields the GoTrue user UUID from one read-only call", async () => {
    const result = await run(Effect.succeed({ ...profile, username: key }))
    expect(result.seen).toEqual([{ method: "GET", path: "/v1/profile" }])
    expect(result.exit).toEqual(Exit.succeed(id))
    if (Exit.isSuccess(result.exit)) expect(result.exit.value.includes(key)).toBe(false)
  })

  test("malformed or missing identity is unavailable", async () => {
    const bodies = [
      { ...profile, gotrue_id: undefined }, { primary_email: profile.primary_email }, { ...profile, gotrue_id: "" },
      { ...profile, gotrue_id: id.toUpperCase() }, { ...profile, gotrue_id: id.replaceAll("-", "") },
      { ...profile, gotrue_id: `${id}\n` }, { ...profile, gotrue_id: `${id}0` }, { ...profile, gotrue_id: key },
      { ...profile, gotrue_id: 7 }, null, id, [profile],
    ]
    for (const value of bodies) expect(code((await run(Effect.succeed(value))).exit)).toBe("connection_unavailable")
  })

  test("transport rejections propagate unchanged", async () => {
    for (const failure of ["authentication_required", "connection_unavailable"] as const)
      expect(code((await run(Effect.fail(new Capability.Failure({ code: failure, message: "fixture" })))).exit)).toBe(failure)
  })
})
