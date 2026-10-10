import { expect, test } from "bun:test"
import { connection, fixture, json, reads } from "./integrations-model.fixture"

test.each([
  ["abc123", "credential=abc123", "unknown"], ["ab", "prefixabsuffix", "unknown"],
  ["a", "credential=a", "unknown"], ["a", "credential=a!", "unknown"],
  ["a", "slack", undefined], ["a", "𐐀a𐐀", undefined], ["a", "éa_", undefined], ["a", "1a2", undefined],
  ["𐐀", "𐐀", "unknown"], ["𐐀", "credential=𐐀!", "unknown"], ["𐐀", "x𐐀x", undefined],
] as const)("credential %s string leaf %s has disclosure result %s", async (secret, leaf, expected) => {
  const f = fixture((request) => request.method === "GET" ? reads(request) : json({ requestID: leaf, reused: false,
    data: { connection: connection().connection, verification: "verified" } }))
  await f.model.connect({ provider: "slack", key: secret })
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(1)
  expect(f.model.state.failure).toBe(expected)
  expect(f.model.state.receipt?.requestID).toBe(expected ? undefined : leaf)
  if (expected) expect(JSON.stringify(f.model.state)).not.toContain(leaf)
})

test.each([
  ["abc123", "request=abc123", "unknown"], ["a", "request=a", "unknown"], ["a", "slack", undefined],
  ["𐐀", "𐐀", "unknown"], ["𐐀", "credential=𐐀!", "unknown"], ["𐐀", "x𐐀x", undefined],
] as const)("private idempotency %s string leaf %s has disclosure result %s", async (key, leaf, expected) => {
  const f = fixture((request) => request.method === "GET" ? reads(request) : json({ requestID: leaf, reused: false,
    data: { connection: connection().connection, verification: "verified" } }), false, undefined, () => key)
  await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(1)
  expect(f.model.state.failure).toBe(expected)
  expect(f.model.state.receipt?.requestID).toBe(expected ? undefined : leaf)
})
