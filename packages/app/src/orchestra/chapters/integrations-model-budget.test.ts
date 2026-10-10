import { expect, test } from "bun:test"
import { binding, connection, fixture, json, reads, target } from "./integrations-model.fixture"

test("512 targets cannot drop incoming binding page while advancing its cursor; selected metadata survives", async () => {
  const f = fixture((request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith("/bindings")) return json({ items: Array.from({ length: 32 }, (_, index) => binding(index + 1)),
      coverage: "current-actor", after: binding(32).sessionID })
    if (url.pathname.endsWith("/targets")) {
      const offset = Number(url.searchParams.get("after") ?? "0")
      return json({ items: Array.from({ length: 32 }, (_, index) => target(offset + index + 1)), coverage: "live",
        ...(offset < 480 ? { after: String(offset + 32).padStart(32, "0") } : {}) })
    }
    return reads(request)
  })
  await f.model.select(connection())
  for (let index = 1; index < 16; index++) await f.model.moreTargets()
  expect(f.model.state.targets).toHaveLength(512)
  await f.model.selectTarget(target())
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.bindings).toEqual(Array.from({ length: 32 }, (_, index) => binding(index + 1)))
  expect(f.model.state.bindingsAfter).toBe(binding(32).sessionID)
  expect(f.model.state.targets.find((row) => row.target.id === target().target.id)).toEqual(target())
  expect(f.model.state.connections.length + f.model.state.targets.length + f.model.state.bindings.length).toBe(512)
})

test("binding capacity cannot starve next connection page; selected account and target refs survive eviction", async () => {
  const f = fixture((request) => {
    const url = new URL(request.url)
    if (request.method === "POST") return json({ requestID: "ack", reused: false, data: null })
    if (url.pathname.endsWith("/bindings")) {
      const offset = Number(url.searchParams.get("after")?.slice(4) ?? "0")
      return json({ items: Array.from({ length: 32 }, (_, index) => binding(offset + index + 1)), coverage: "current-actor",
        ...(offset < 480 ? { after: binding(offset + 32).sessionID } : {}) })
    }
    if (url.pathname.endsWith("/connections")) {
      const offset = Number(url.searchParams.get("after")?.slice(6) ?? "0")
      return json({ items: Array.from({ length: 32 }, (_, index) => connection(offset + index + 1)),
        coverage: "live", after: connection(offset + 32).connection.id })
    }
    return reads(request)
  })
  await f.model.load(); await f.model.select(connection()); await f.model.selectTarget(target())
  for (let index = 1; index < 16; index++) await f.model.moreBindings()
  expect(f.model.state.bindings).toHaveLength(510)
  expect(f.model.state.connections).toEqual([connection()])
  expect(f.model.state.targets).toEqual([target()])
  await f.model.load(true)
  expect(f.model.state.connections).toHaveLength(33)
  expect(f.model.state.connections).toEqual([connection(), ...Array.from({ length: 32 }, (_, index) => connection(index + 33))])
  expect(f.model.state.after).toBe(connection(64).connection.id)
  expect(f.model.state.targets).toEqual([target()])
  expect(f.model.state.connections.length + f.model.state.targets.length + f.model.state.bindings.length).toBe(512)
  await f.model.unbind(binding().sessionID)
  expect(f.requests.find((row) => row.method === "POST")?.body).toEqual({ target: target().target, sessionID: binding().sessionID })
})
