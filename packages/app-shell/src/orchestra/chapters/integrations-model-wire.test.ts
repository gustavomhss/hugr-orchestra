import { expect, test } from "bun:test"
import { connection, fixture, json } from "./integrations-model.fixture"

test.each([
  ["coverage", { items: [], coverage: "all" }],
  ["credential", { items: [{ ...connection(), credential: "ready" }], coverage: "live" }],
  ["page limit", { items: Array.from({ length: 33 }, () => connection()), coverage: "live" }],
  ["cursor", { items: [connection()], coverage: "live", after: "bad-id" }],
  ["extra token", { items: [connection()], coverage: "live", token: "must not enter public state" }],
] as const)("malformed HTTP DTO cannot claim ready: %s", async (_name, page) => {
  const f = fixture(() => json(page))
  await f.model.load()
  expect(f.model.state.status).toBe("error")
  expect(f.model.state.failure).toBe("request")
  expect(f.model.state.connections).toEqual([])
})

test.each([
  [401, "UnauthorizedError", "authorization"], [403, "ForbiddenError", "authorization"],
  [404, "missing", "unsupported"], [405, "method", "unsupported"], [501, "unsupported", "unsupported"],
  [400, "InvalidRequestError", "invalid"], [422, "validation", "invalid"], [409, "conflict", "request"],
  [500, "server", "request"],
] as const)("HTTP %i maps sanitized mutation failure %s/%s", async (status, tag, expected) => {
  const f = fixture(() => json({ _tag: tag, message: "private-secret private-intent-1" }, status))
  await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.model.state.failure).toBe(expected)
  expect(JSON.stringify(f.model.state)).not.toContain("private-secret")
  expect(JSON.stringify(f.model.state)).not.toContain("private-intent")
})
