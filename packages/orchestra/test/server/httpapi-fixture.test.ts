import { expect, test } from "bun:test"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"
import { httpApiFixture } from "./httpapi-fixture"

test("disposing a fixture leaves the default HTTP handler usable for a fresh Location", async () => {
  await using initialDirectory = await tmpdir({ config: { formatter: false, lsp: false } })
  const shared = Server.Default()
  const initial = await shared.app.request("/api/reference", {
    headers: { "x-orchestra-directory": initialDirectory.path },
  })
  expect(initial.status).toBe(200)
  expect(await initial.json()).toMatchObject({ location: { directory: initialDirectory.path }, data: [] })

  const fixture = httpApiFixture()
  try {
    const response = await fixture.handler(
      new Request("http://localhost/api/reference", { headers: { "x-orchestra-directory": initialDirectory.path } }),
      HttpApiApp.context,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ location: { directory: initialDirectory.path }, data: [] })
  } finally {
    await fixture.dispose()
  }

  expect(Server.Default()).toBe(shared)
  // Health is pure and survives closed services. Opening a new Location probes the live InstanceStore/Location map.
  await using fresh = await tmpdir({ config: { formatter: false, lsp: false } })
  const response = await shared.app.request("/api/reference", { headers: { "x-orchestra-directory": fresh.path } })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ location: { directory: fresh.path }, data: [] })
}, 30_000)
