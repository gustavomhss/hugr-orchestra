import { describe, expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Layer } from "effect"
import { CapabilityHostFixture } from "./httpapi-capability-operator-fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const inspect = "/api/capability/operator"
const list = "/api/capability/connections"
const missing = `${list}/${Capability.ConnectionID.create()}`

describe("actual HttpApi host capability operator", () => {
  it.live(
    "default host requires Basic before Location for known and missing resources",
    () =>
      Effect.gen(function* () {
        const host = yield* CapabilityHostFixture.make({ password: "secret" })
        for (const route of [inspect, list, missing]) {
          expect((yield* host.request(route)).status).toBe(401)
          expect((yield* host.request(route, { auth: CapabilityHostFixture.basic("wrong") })).status).toBe(401)
        }
        // A poisoned Location is a positive control for middleware ordering, not a fake Location service.
        for (const route of [inspect, list, missing]) {
          expect((yield* host.request(route, { directory: "%00" })).status).toBe(401)
        }
        expect((yield* host.request(inspect, { directory: "%00", auth: CapabilityHostFixture.basic() })).status).toBe(
          500,
        )
        const first = yield* host.request(inspect, {
          auth: CapabilityHostFixture.basic(),
          headers: { "x-request-id": "caller-controlled" },
        })
        expect(first.status).toBe(200)
        const binding = yield* CapabilityHostFixture.binding(first)
        expect(binding).toMatchObject({
          origin: "configured-auth",
          principal: expect.any(String),
          scopeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          requestID: expect.any(String),
        })
        expect(binding.requestID).not.toBe("caller-controlled")
        const second = yield* host.request(inspect, { auth: CapabilityHostFixture.basic() })
        expect(second.status).toBe(200)
        expect((yield* CapabilityHostFixture.binding(second)).requestID).not.toBe(binding.requestID)
        const page = yield* host.request(list, { auth: CapabilityHostFixture.basic() })
        expect(page.status).toBe(200)
        expect(yield* CapabilityHostFixture.page(page)).toEqual({ items: [], coverage: "live" })
        expect((yield* host.request(missing, { auth: CapabilityHostFixture.basic() })).status).toBe(403)
      }),
    30_000,
  )

  it.live(
    "configured Basic remains independent of a valid injected bearer",
    () =>
      Effect.gen(function* () {
        const host = yield* CapabilityHostFixture.make({ password: "secret", injected: true })
        const issued = yield* host.operator.issue({ origin: "sdk" })
        for (const route of [inspect, list]) {
          expect((yield* host.request(route, { auth: `Bearer ${issued.bearer}` })).status).toBe(401)
        }
        expect(host.targets).toEqual([])
        const response = yield* host.request(inspect, { auth: CapabilityHostFixture.basic() })
        expect(response.status).toBe(200)
        expect(yield* CapabilityHostFixture.binding(response)).toMatchObject({
          principal: "host-fixture",
          origin: "configured-auth",
        })
        expect(host.targets).toHaveLength(1)
      }),
    30_000,
  )

  it.live(
    "disabled Basic requires host-issued bearer, shares real placement, and revokes on Scope close",
    () =>
      Effect.gen(function* () {
        const host = yield* CapabilityHostFixture.make({ injected: true })
        const issued = yield* host.operator.issue({ origin: "desktop" })
        for (const route of [inspect, list, missing]) {
          expect((yield* host.request(route)).status).toBe(401)
          expect((yield* host.request(route, { auth: CapabilityHostFixture.basic() })).status).toBe(401)
          expect(
            (yield* host.request(route, {
              query: { authorization: `Bearer ${issued.bearer}`, token: issued.bearer, ticket: issued.bearer },
              headers: {
                cookie: `authorization=Bearer ${issued.bearer}; token=${issued.bearer}`,
              },
            })).status,
          ).toBe(401)
        }
        expect(host.targets).toEqual([])
        for (const route of [inspect, list, missing]) {
          expect((yield* host.request(route, { directory: "%00" })).status).toBe(401)
        }
        const first = yield* host.request(inspect, { auth: `Bearer ${issued.bearer}` })
        expect(first.status).toBe(200)
        const binding = yield* CapabilityHostFixture.binding(first)
        expect(binding).toMatchObject({ principal: "host-fixture", origin: "desktop" })
        const placement = host.targets[0].placement
        expect(placement.location.directory).toEqual(host.directory)
        expect(placement.projectID).toEqual(host.projectID)
        const narrow = yield* host.operator.issue({
          origin: "sdk",
          scope: {
            placements: [placement],
            actions: ["operator.inspect", "connection.list"],
          },
        })
        const second = yield* host.request(inspect, {
          auth: `Bearer ${narrow.bearer}`,
          headers: { "x-request-id": binding.requestID },
        })
        expect(second.status).toBe(200)
        const next = yield* CapabilityHostFixture.binding(second)
        expect(next.requestID).not.toBe(binding.requestID)
        expect(next.origin).toBe("sdk")
        const page = yield* host.request(list, { auth: `Bearer ${narrow.bearer}` })
        expect(page.status).toBe(200)
        expect(yield* CapabilityHostFixture.page(page)).toEqual({ items: [], coverage: "live" })
        expect(host.targets.map((target) => target.action)).toEqual([
          "operator.inspect",
          "operator.inspect",
          "connection.list",
        ])
        expect(
          host.targets.every(
            (target) =>
              target.placement.projectID === placement.projectID &&
              target.placement.location.directory === host.directory,
          ),
        ).toBe(true)
        for (const route of [inspect, list]) {
          expect(
            (yield* host.request(route, { auth: `Bearer ${narrow.bearer}`, directory: host.foreign })).status,
          ).toBe(403)
        }
        const other = yield* CapabilityHostFixture.make({ injected: true })
        const foreign = yield* other.operator.issue({ origin: "sdk" })
        expect((yield* host.request(inspect, { auth: `Bearer ${foreign.bearer}` })).status).toBe(401)
        yield* host.closeAuthority
        for (const route of [inspect, list, missing]) {
          expect((yield* host.request(route, { auth: `Bearer ${issued.bearer}` })).status).toBe(401)
          expect((yield* host.request(route, { auth: `Bearer ${narrow.bearer}` })).status).toBe(401)
        }
      }),
    30_000,
  )
})
