import { expect, test } from "bun:test"
import { binding, connection, fixture, json, reads, target } from "./integrations-model.fixture"

test.each(["connections", "targets", "bindings"] as const)("repeated cursor stall rejected before publishing %s rows", async (kind) => {
  const opaque = "x".repeat(32)
  const f = fixture((request) => {
    const url = new URL(request.url)
    const more = url.searchParams.has("after")
    if (kind === "connections" && url.pathname.endsWith("/connections")) return json({
      items: [connection(more ? 2 : 1)], after: connection().connection.id, coverage: "live",
    })
    if (kind === "targets" && url.pathname.endsWith("/targets")) return json({
      items: [target(more ? 2 : 1)], after: opaque, coverage: "live",
    })
    if (kind === "bindings" && url.pathname.endsWith("/bindings")) return json({
      items: [binding(more ? 2 : 1)], after: binding().sessionID, coverage: "current-actor",
    })
    return reads(request)
  })
  await f.model.load()
  if (kind !== "connections") await f.model.select(connection())
  if (kind === "bindings") await f.model.selectTarget(target())
  expect(f.model.state.status).toBe("ready")
  const before = JSON.stringify([f.model.state.connections, f.model.state.targets, f.model.state.bindings])
  if (kind === "connections") await f.model.load(true)
  if (kind === "targets") await f.model.moreTargets()
  if (kind === "bindings") await f.model.moreBindings()
  expect(f.model.state.status).toBe("error")
  expect(f.model.state.failure).toBe("request")
  expect(JSON.stringify([f.model.state.connections, f.model.state.targets, f.model.state.bindings])).toBe(before)
  expect(f.requests.filter((row) => new URL(row.url).searchParams.has("after"))).toHaveLength(1)
})

test.each(["connections", "bindings"] as const)("ordered %s pages reject duplicate/backward rows and cursor", async (kind) => {
  for (const shape of ["duplicate", "backward", "cursor"] as const) {
    const f = fixture((request) => {
      const url = new URL(request.url)
      const more = url.searchParams.has("after")
      if (kind === "connections" && url.pathname.endsWith("/connections")) return json({ coverage: "live",
        items: more ? shape === "duplicate" ? [connection(4), connection(4)] : shape === "backward"
          ? [connection(5), connection(4)] : [connection(4)] : [connection(2)],
        after: more ? connection(shape === "cursor" ? 2 : shape === "duplicate" ? 4 : 5).connection.id : connection(3).connection.id,
      })
      if (kind === "bindings" && url.pathname.endsWith("/bindings")) return json({ coverage: "current-actor",
        items: more ? shape === "duplicate" ? [binding(4), binding(4)] : shape === "backward"
          ? [binding(5), binding(4)] : [binding(4)] : [binding(2)],
        after: more ? binding(shape === "cursor" ? 2 : shape === "duplicate" ? 4 : 5).sessionID : binding(3).sessionID,
      })
      return reads(request)
    })
    await f.model.load()
    if (kind === "bindings") { await f.model.select(connection()); await f.model.selectTarget(target()) }
    if (kind === "connections") await f.model.load(true)
    if (kind === "bindings") await f.model.moreBindings()
    expect(f.model.state.status).toBe("error")
  }
})

test("opaque cursor cycle rejected and history resets with owning connection query", async () => {
  const first = "x".repeat(32)
  const second = "y".repeat(32)
  const f = fixture((request) => {
    const url = new URL(request.url)
    if (!url.pathname.endsWith("/targets")) return reads(request)
    const after = url.searchParams.get("after")
    return json({ items: [target(after === null ? 1 : after === first ? 2 : 3)], coverage: "live",
      after: after === first ? second : first })
  })
  await f.model.select(connection())
  await f.model.moreTargets()
  await f.model.moreTargets()
  expect(f.model.state.status).toBe("error")
  expect(f.model.state.targets).toEqual([target(), target(2)])
  await f.model.select(connection())
  expect(f.model.state.status).toBe("ready")
  expect(f.model.state.targets).toEqual([target()])
  expect(f.model.state.targetsAfter).toBe(first)
})

test("opaque continuation history caps at 512; cannot forget old cursors and loop forever", async () => {
  let issued = 0
  const f = fixture(() => json({ items: [], coverage: "live", after: String(++issued).padStart(32, "0") }))
  await f.model.select(connection())
  for (let index = 1; index < 512; index++) await f.model.moreTargets()
  expect(f.model.state.status).toBe("ready")
  await f.model.moreTargets()
  expect(issued).toBe(513)
  expect(f.model.state.status).toBe("error")
  expect(f.model.state.targetsAfter).toBe(String(512).padStart(32, "0"))
}, 15000)
