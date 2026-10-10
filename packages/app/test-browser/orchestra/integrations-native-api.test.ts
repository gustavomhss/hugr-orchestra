import { afterEach, expect, test } from "bun:test"
import { createIntegrationsApi } from "../../src/orchestra/chapters/integrations-api"
import { Orchestra } from "@orchestra/client"
import { startHost, transport } from "./integrations-native.fixture"
import type { CapabilitySetup } from "@orchestra/schema/capability-setup"

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

test("generated native adapter pins auth/origin/location and Basic overrides bearer", async () => {
  const basic = await startHost()
  cleanup.push(basic.stop)
  const ephemeral = await startHost("bearer")
  cleanup.push(ephemeral.stop)
  const wire = transport()
  const selected = { url: basic.url, username: "native", password: basic.password }
  const api = createIntegrationsApi({ server: selected, directory: basic.directory, bearer: ephemeral.bearer, fetch: wire.fetch })
  expect(await api.list()).toEqual({ items: [], coverage: "live" })
  selected.url = ephemeral.url // Captured generated transport must not follow mutable selected-host object.
  expect(await api.list()).toEqual({ items: [], coverage: "live" })
  wire.calls.forEach((call) => {
    expect(new URL(call.url).origin).toBe(basic.url)
    expect(new URL(call.url).searchParams.get("location[directory]")).toBe(basic.directory)
    expect(call.headers.get("authorization")).toBe(`Basic ${Buffer.from("native:native:password").toString("base64")}`)
  })
  const other = createIntegrationsApi({ server: { url: ephemeral.url }, directory: ephemeral.directory, fetch: wire.fetch })
  await expect(other.list()).rejects.toMatchObject({ _tag: "UnauthorizedError", message: "Authentication required" })
  expect(wire.calls.at(-1)?.headers.has("authorization")).toBe(false)
  const authorized = createIntegrationsApi({ server: { url: ephemeral.url }, directory: ephemeral.directory, bearer: ephemeral.bearer, fetch: wire.fetch })
  expect(await authorized.list()).toEqual({ items: [], coverage: "live" })
  const wrongBasic = Orchestra.make({ baseUrl: basic.url, fetch: wire.fetch, headers: { authorization: `Bearer ${basic.bearer}` } })
  await expect(wrongBasic.connections.list({ location: { directory: basic.directory } })).rejects.toMatchObject({ _tag: "UnauthorizedError" })
  expect(() => createIntegrationsApi({ server: { url: ephemeral.url }, directory: ephemeral.directory, bearer: "bad\nsecret", fetch: wire.fetch })).toThrow("Invalid integration authorization")
}, 90000)

test("extended typed Options cannot replace Basic or captured idempotency headers; signal alone crosses adapter", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const wire = transport()
  const api = createIntegrationsApi({ server: { url: host.url, username: "native", password: host.password },
    directory: host.directory, bearer: "ignored-malformed\r\nsecret", fetch: wire.fetch })
  const controller = new AbortController()
  const options = { signal: controller.signal, headers: {
    authorization: "Basic attacker", "x-auth": "attacker-private-header", "idempotency-key": "attacker-key",
  } }
  expect(await api.list(undefined, options)).toEqual({ items: [], coverage: "live" })
  const provider: CapabilitySetup.Input["provider"] = "slack"
  const input = { provider, key: "options-private-key", label: "Stable options" }
  const receipt = await api.connect(input, "captured-intent", options)
  const alteredOptions = { signal: controller.signal, headers: { "idempotency-key": "different-attacker-key" } }
  expect(await api.connect(input, "captured-intent", alteredOptions)).toEqual({ ...receipt, reused: true })
  expect((await host.inspect()).vendor).toHaveLength(1)
  expect((await host.inspect()).receipts).toHaveLength(1)
  wire.calls.forEach((call) => {
    expect(call.signal).toBe(controller.signal)
    expect(call.headers.get("authorization")).toBe(`Basic ${Buffer.from("native:native:password").toString("base64")}`)
    expect(call.headers.get("x-auth")).toBeNull()
    expect(call.status).toBe(200)
  })
  expect(wire.calls.filter((call) => call.method === "POST").map((call) => call.headers.get("idempotency-key"))).toEqual(["captured-intent", "captured-intent"])
}, 90000)

test("extended setup input cannot replace captured location; actual SQL connection belongs to A", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const wire = transport()
  const api = createIntegrationsApi({ server: { url: host.url, username: "native", password: host.password }, directory: host.directory, fetch: wire.fetch })
  const provider: CapabilitySetup.Input["provider"] = "discord"
  const input = { provider, key: "extra-location-private-key", label: "Captured A",
    location: { directory: `${host.directory}/profile-b` }, endpoint: "http://127.0.0.1:9/exfiltrate", subjectID: "attacker" }
  const receipt = await api.connect(input, "location-intent")
  const rows = await host.inspect()
  expect(rows.connections).toHaveLength(1)
  expect(rows.connections[0]).toMatchObject({ directory: host.directory, label: "Captured A", subject_id: "123456789" })
  expect(rows.vendor).toEqual([{ method: "GET", path: "/api/v10/users/@me", authorization: "Bot extra-location-private-key" }])
  expect(new URL(wire.calls[0].url).searchParams.get("location[directory]")).toBe(host.directory)
  expect(JSON.parse(wire.calls[0].body)).toEqual({ provider: "discord", key: input.key, label: "Captured A" })
  expect(receipt.reused).toBe(false)
  const other = createIntegrationsApi({ server: { url: host.url, username: "native", password: host.password }, directory: input.location.directory, fetch: wire.fetch })
  expect(await other.list()).toEqual({ items: [], coverage: "live" })
  expect((await api.list()).items[0].connection.id).toBe(rows.connections[0].id)
  const error = await Promise.resolve().then(() => createIntegrationsApi({ server: { url: host.url },
    directory: host.directory, bearer: "malformed\r\nprivate-header", fetch: wire.fetch })).then(
      () => { throw new Error("Expected malformed bearer rejection") }, (error: unknown) => error)
  expect(error).toBeInstanceOf(TypeError)
  expect(String(error)).toBe("TypeError: Invalid integration authorization")
  expect(error).not.toHaveProperty("cause")
  expect(wire.calls.map((call) => call.response).join("")).not.toContain("private-header")
}, 90000)

test("strict protected HTTP rejects body endpoints/identity/actor and sanitizes malformed or expired credentials", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const wire = transport()
  const api = createIntegrationsApi({ server: { url: host.url, username: "native", password: host.password }, directory: host.directory, fetch: wire.fetch })
  expect(await api.list()).toEqual({ items: [], coverage: "live" }) // positive authorized handler control
  for (const extra of [{ endpoint: "http://127.0.0.1:9/exfiltrate" }, { subjectID: "attacker" }, { credentialID: "attacker" }, { agentID: "attacker" }]) {
    const url = new URL("/api/capability/connections/connect", host.url)
    url.searchParams.set("location[directory]", host.directory)
    const response = await Bun.fetch(url, { method: "POST", headers: { authorization: `Basic ${Buffer.from("native:native:password").toString("base64")}`,
      "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ provider: "slack", key: "attack-private-key", ...extra }) })
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("attack-private-key")
  }
  expect((await host.inspect()).vendor).toEqual([])
  await expect(api.connect({ provider: "slack", key: "malformed-private-key" }, "malformed")).rejects.toMatchObject({ _tag: "ForbiddenError" })
  await expect(api.connect({ provider: "slack", key: "expired-private-key" }, "expired")).rejects.toMatchObject({ _tag: "UnauthorizedError" })
  expect(wire.calls.slice(-2).map((call) => JSON.parse(call.response!))).toEqual([
    { _tag: "ForbiddenError", message: "Request denied" }, { _tag: "UnauthorizedError", message: "Authentication required" },
  ])
  const rows = await host.inspect()
  expect(rows.vendor.map((call) => call.authorization)).toEqual(["Bearer malformed-private-key", "Bearer expired-private-key"])
  expect(rows.connections).toEqual([])
  expect(rows.credentials).toEqual([])
  expect(rows.receipts).toEqual([])
  expect(wire.calls.map((call) => call.response).join("")).not.toContain("private-key")
}, 90000)
