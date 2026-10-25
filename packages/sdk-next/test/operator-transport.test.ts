import { expect, test } from "bun:test"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { Effect } from "effect"
import { makeOperatorTransport } from "../src/operator-transport"

test("owning embedded transport renews concurrent expired defaults and preserves explicit overrides", async () => {
  const clock = { now: 1 }
  const headers: string[] = []
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const operator = yield* CapabilityOperator.make({ principal: "transport-host",
      scope: { placements: "instance", actions: ["*"] }, now: () => clock.now, ttlMillis: 10, maxCapabilities: 2 })
    const transport = yield* makeOperatorTransport(async (request) => {
      const value = request.headers.get("authorization") ?? ""
      headers.push(value)
      const authenticated = await Effect.runPromise(operator.authenticate(value.slice(7)).pipe(Effect.result))
      return new Response(authenticated._tag === "Success" ? "ok" : "denied", { status: authenticated._tag === "Success" ? 200 : 401 })
    }, operator)
    expect((yield* Effect.promise(() => transport.fetch("http://orchestra.local", { headers: transport.headers }))).status).toBe(200)
    clock.now += 11
    const renewed = yield* Effect.promise(() => Promise.all(Array.from({ length: 4 }, () =>
      transport.fetch("http://orchestra.local", { headers: transport.headers }))))
    expect(renewed.map((response) => response.status)).toEqual([200, 200, 200, 200])
    expect(new Set(headers.slice(1)).size).toBe(1)
    expect(headers[0]).not.toBe(headers[1])
    expect((yield* Effect.promise(() => transport.fetch("http://orchestra.local", {
      headers: { authorization: "Bearer explicit" },
    }))).status).toBe(401)
    expect(headers.at(-1)).toBe("Bearer explicit")
  })))
})

test("embedded bearer renewal cannot outlive the owning authority Scope", async () => {
  const calls = { count: 0 }
  const transport = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const operator = yield* CapabilityOperator.make({ principal: "closed-host", scope: { placements: "instance", actions: ["*"] } })
    return yield* makeOperatorTransport(async () => { calls.count++; return new Response("unexpected") }, operator)
  })))
  await expect(transport.fetch("http://orchestra.local", { headers: transport.headers })).rejects.toThrow()
  expect(calls.count).toBe(0)
})
