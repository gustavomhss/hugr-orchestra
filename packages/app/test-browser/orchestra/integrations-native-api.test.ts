import { afterEach, expect, test } from "bun:test"
import { createIntegrationsApi } from "../../src/orchestra/chapters/integrations-api"
import { Orchestra } from "@orchestra/client"
import { startHost, transport } from "./integrations-native.fixture"

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
