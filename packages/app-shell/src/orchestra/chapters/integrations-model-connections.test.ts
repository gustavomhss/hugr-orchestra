import { expect, test } from "bun:test"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { INTEGRATION_PROVIDERS } from "./integrations-model"
import { binding, connection, fixture, json, reads } from "./integrations-model.fixture"

test("provider list offers every key provider and lists the OAuth-only ones as unavailable", async () => {
  expect(INTEGRATION_PROVIDERS.filter((row) => row.available).map((row) => row.id)).toEqual([...CapabilitySetup.Provider.literals])
  expect(INTEGRATION_PROVIDERS.filter((row) => !row.available).map((row) => row.id))
    .toEqual(["sentry", "vercel", "grafana", "railway", "netlify", "prisma-postgres"])
  const f = fixture(reads)
  await f.model.connect({ provider: "sentry", key: "private-secret" } as never)
  expect(f.model.state.failure).toBe("invalid")
  expect(f.requests).toEqual([])
})

test("connect exposes the reported verification on the account row", async () => {
  const f = fixture((request) => request.method === "GET" ? reads(request)
    : json(CapabilityManagement.Receipt.make({ requestID: "receipt-1", reused: false,
      data: CapabilitySetup.Result.make({ connection: connection().connection, verification: "credential-only" }) })))
  await f.model.load()
  expect(f.model.state.verifications).toEqual({})
  await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.model.state.receipt?.requestID).toBe("receipt-1")
  expect(f.model.state.verifications[connection().connection.id]).toBe("credential-only")
  f.model.dispose()
  expect(f.model.state.verifications).toEqual({})
})

test.each([
  [401, "UnauthorizedError", false, true],
  [401, "UnauthorizedError", true, false],
  [403, "ForbiddenError", false, false],
] as const)("read %i %s with basic=%p shows host authorization: %p", async (status, tag, basic, expected) => {
  const f = fixture(() => json({ _tag: tag }, status), false, undefined, undefined, undefined, basic)
  await f.model.load()
  expect(f.model.state.failure).toBe("authorization")
  expect(f.model.state.hostAuthorization).toBe(expected)
})

test("a successful read clears host authorization", async () => {
  const replies = [json({ _tag: "UnauthorizedError" }, 401)]
  const f = fixture((request) => replies.shift() ?? reads(request))
  await f.model.load()
  expect(f.model.state.hostAuthorization).toBe(true)
  await f.model.retryRead()
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.hostAuthorization).toBe(false)
})

test("resource editor reports local JSON errors and clears them on valid input", () => {
  const f = fixture(reads)
  expect(f.model.checkResource("{bad")).toBeUndefined()
  expect(f.model.state.resourceError).toBeString()
  expect(f.model.state.resourceError?.length).toBeGreaterThan(0)
  expect(f.model.checkResource('{"channel":"C1"}')).toEqual({ channel: "C1" })
  expect(f.model.state.resourceError).toBeUndefined()
  expect(f.requests).toEqual([])
})

test("binding picker lists location sessions newest first without touching page status", async () => {
  const replies = [
    json([{ id: binding(1).sessionID, title: "older", updated: 1 }, { id: binding(2).sessionID, title: "newer", updated: 2 }]),
    json({ _tag: "server" }, 500),
  ]
  const f = fixture((request) => new URL(request.url).pathname === "/api/session" ? replies.shift()! : reads(request))
  await f.model.load()
  await f.model.loadSessions()
  expect(f.model.state.sessionsStatus).toBe("ready")
  expect(f.model.state.sessions.map((row) => row.title)).toEqual(["newer", "older"])
  await f.model.loadSessions()
  expect(f.model.state.sessionsStatus).toBe("error")
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.failure).toBeUndefined()
})
