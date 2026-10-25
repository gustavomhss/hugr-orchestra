import { expect } from "bun:test"
import { LinearVerifier } from "@orchestra/core/capability/connection/verifiers/linear"
import type { CapabilityVerifierContract } from "@orchestra/core/capability/connection/verifiers/contract"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Exit, Schema } from "effect"
import { it } from "./lib/effect"

const key = "lin_api_fixtureOnlySecret0123456789"
const org = "8a1c3f2e-4b5d-4e6f-9a7b-0c1d2e3f4a5b"
const user = "1f2e3d4c-5b6a-4978-8a9b-cadbecfd0e1f"

function fake(response: unknown) {
  const seen: Parameters<CapabilityVerifierContract.Call>[0][] = []
  const call: CapabilityVerifierContract.Call = (input) => {
    seen.push(input)
    return response instanceof Capability.Failure ? Effect.fail(response) : Effect.succeed(response)
  }
  return { call, seen }
}

const code = (exit: Exit.Exit<string, Capability.Failure>) => {
  if (Exit.isSuccess(exit)) throw new Error("LINEAR_ACCEPTED_INVALID_IDENTITY")
  const error = exit.cause.reasons.flatMap((reason) => reason._tag === "Fail" ? [reason.error] : [])[0]
  expect(JSON.stringify(error)).not.toContain(key)
  return error?.code
}

it.effect("linear descriptor binds the platform MCP endpoint, raw key and fixed GraphQL viewer query", () => Effect.gen(function* () {
  const d = LinearVerifier.descriptor
  expect(d).toMatchObject({ provider: "linear", endpoint: "https://mcp.linear.app/mcp", integrationID: "capability.linear",
    verification: "verified", origin: "https://api.linear.app" })
  expect(d.authorization(key)).toBe(key)
  expect(Object.isFrozen(d)).toBe(true)
  const f = fake({ data: { viewer: { id: user, name: key, email: key, organization: { id: org, urlKey: key } } } })
  const subject = yield* d.identify(f.call)
  expect(subject).toBe(JSON.stringify([org, user]))
  expect(Schema.decodeUnknownSync(Schema.Tuple([Schema.String, Schema.String]))(JSON.parse(subject))).toEqual([org, user])
  expect(subject).not.toContain(key)
  expect(f.seen).toEqual([{ method: "POST", path: "/graphql", body: { query: "{ viewer { id organization { id } } }" } }])
}))

it.effect("linear GraphQL auth errors require authentication and other errors are unavailable", () => Effect.gen(function* () {
  const auth = { errors: [{ message: "Authentication required, not authenticated",
    extensions: { type: "authentication error", code: "AUTHENTICATION_ERROR", userPresentableMessage: key } }] }
  expect(code(yield* LinearVerifier.descriptor.identify(fake(auth).call).pipe(Effect.exit))).toBe("authentication_required")
  const typeOnly = { errors: [{ message: "x", extensions: { type: "authentication error" } }] }
  expect(code(yield* LinearVerifier.descriptor.identify(fake(typeOnly).call).pipe(Effect.exit))).toBe("authentication_required")
  const other = { errors: [{ message: key, extensions: { code: "RATELIMITED" } }], data: { viewer: { id: user, organization: { id: org } } } }
  expect(code(yield* LinearVerifier.descriptor.identify(fake(other).call).pipe(Effect.exit))).toBe("connection_unavailable")
}))

it.effect("linear malformed identity fails closed and transport failures propagate", () => Effect.gen(function* () {
  const malformed = [
    {}, null, "ok", { data: null }, { data: { viewer: { id: user } } },
    { data: { viewer: { id: "not-a-uuid", organization: { id: org } } } },
    { data: { viewer: { id: user, organization: { id: `${org}\n` } } } },
    { data: { viewer: { id: user, organization: { id: 42 } } } },
    { errors: [] },
  ]
  for (const body of malformed)
    expect(code(yield* LinearVerifier.descriptor.identify(fake(body).call).pipe(Effect.exit))).toBe("connection_unavailable")
  for (const failure of ["authentication_required", "connection_unavailable"] as const)
    expect(code(yield* LinearVerifier.descriptor.identify(fake(new Capability.Failure({ code: failure,
      message: "Capability connection verification is unavailable" })).call).pipe(Effect.exit))).toBe(failure)
}))
