import { expect, test } from "bun:test"
import { browser, connection, fixture, json, reads } from "./integrations-model.fixture"

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

test("browser privacy observer records every synchronous snapshot without private credential or operation key", async () => {
  const secret = "private-observed-credential"
  const key = "private-observed-operation"
  const snapshots: string[] = []
  let mode: "success" | "credential" | "idempotency" | "error" = "success"
  const f = fixture((request) => {
    if (request.method === "GET") return reads(request)
    if (mode === "error") return json({ _tag: "ForbiddenError", message: `${secret} ${key}` }, 403)
    return json({ requestID: mode === "credential" ? `credential=${secret}` : mode === "idempotency" ? `request=${key}` : "ack",
      reused: false, data: { connection: connection().connection, verification: "verified" } })
  }, false, (state) => snapshots.push(JSON.stringify(state)), () => key)
  if (!(await browser(f, import.meta.path, "browser privacy observer"))) return
  expect(snapshots).toHaveLength(1)
  for (const scenario of ["success", "credential", "idempotency", "error"] as const) {
    mode = scenario
    const before = snapshots.length
    const pending = f.model.connect({ provider: "slack", key: secret })
    expect(snapshots.length).toBeGreaterThan(before)
    expect(snapshots.every((snapshot) => !snapshot.includes(secret) && !snapshot.includes(key))).toBe(true)
    await pending
    expect(snapshots.every((snapshot) => !snapshot.includes(secret) && !snapshot.includes(key))).toBe(true)
    expect(f.model.state.failure).toBe(scenario === "success" ? undefined : scenario === "error" ? "authorization" : "unknown")
  }
  const beforeDispose = snapshots.length
  f.model.dispose()
  expect(snapshots.length).toBeGreaterThan(beforeDispose)
  expect(snapshots.every((snapshot) => !snapshot.includes(secret) && !snapshot.includes(key))).toBe(true)
  expect(f.requests.filter((row) => row.method === "POST")).toHaveLength(4)
  f.dispose()
})
