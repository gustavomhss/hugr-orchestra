import { afterEach, expect, test } from "bun:test"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { closeFixtures, confirm, fixture, identity, observe, target, turn } from "./app-dock-rpc-workspace.fixture"

afterEach(closeFixtures)

test("rebind: same-client fresh reads await old unbind, rotate bindings/refs, and reap only on close", async () => {
  const f = fixture()
  const prepared = await f.acquire()
  f.prepare(async () => prepared)
  const first = await f.json("dock_read") as { bindingID: string; ref: string }
  const wire = f.clients[0]!.wire
  wire.checkRefs = true
  wire.holdUnbind = true
  const reading = observe(f.json("dock_read"))
  const unbind = await wire.unbind.promise
  await turn()
  expect(f.calls).toHaveLength(2)
  expect(wire.requests.map((request) => request.op)).toEqual(["bind", "bind", "read", "unbind"])
  expect(reading.state.settled).toBe(false)
  expect(await f.json("dock_list")).toMatchObject([{ nativeReadiness: "binding" }])
  expect(wire.terminations).toBe(0)
  wire.holdUnbind = false
  wire.reply(unbind.id, { unbound: true })
  const second = await reading.result as { bindingID: string; ref: string }
  expect(second).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
  expect(second.bindingID).not.toBe(first.bindingID)
  expect(second.ref).not.toBe(first.ref)
  const third = await f.json("dock_read") as { bindingID: string; ref: string }
  expect(third.bindingID).not.toBe(second.bindingID)
  expect(third.ref).not.toBe(second.ref)
  await expect(prepared.client.request({ op: "action", bindingID: first.bindingID, bindingEpoch: first.bindingID,
    args: { ref: first.ref, actionID: "action" } })).rejects.toMatchObject({ code: "stale-binding" })
  expect(await f.json("dock_action", { ref: first.ref, actionID: "action" })).toMatchObject({ code: "stale-ref" })
  expect(await f.json("dock_action", { ref: third.ref, actionID: "action" })).toEqual(wire.receipt)
  expect(f.clients).toHaveLength(1)
  expect(f.calls).toHaveLength(3)
  expect(wire.requests.filter((request) => request.op === "shutdown")).toEqual([])
  expect(wire.reaped).toBe(false)
  expect(await f.json("dock_close")).toEqual([])
  expect(wire.requests.filter((request) => request.op === "shutdown")).toHaveLength(1)
  expect(wire.terminations).toBe(1)
  expect(wire.reaped).toBe(true)
})

test("rebind: changed client joins old unbind and reap before new discovery", async () => {
  const f = fixture()
  f.prepare(() => f.acquire())
  await f.json("dock_read")
  const old = f.clients[0]!
  old.wire.holdUnbind = true
  old.wire.holdReap = true
  const reading = observe(f.json("dock_read"))
  const unbind = await old.wire.unbind.promise
  expect(f.calls).toHaveLength(2)
  expect(f.clients[1]!.wire.requests).toEqual([])
  old.wire.reply(unbind.id, { unbound: true })
  await old.wire.termination.promise
  expect(f.clients[1]!.wire.requests).toEqual([])
  expect(reading.state.settled).toBe(false)
  old.wire.reap.resolve()
  expect(await reading.result).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
  expect(f.calls).toHaveLength(2)
  expect(old.wire.reaped).toBe(true)
  expect(f.clients[1]!.wire.reaped).toBe(false)
  expect(f.clients[1]!.wire.requests.map((request) => request.op)).toEqual(["bind", "bind", "read"])
  expect(await f.json("dock_close")).toEqual([])
  expect(f.clients[1]!.wire.reaped).toBe(true)
  expect(f.clients.every((entry) => entry.wire.terminations === 1)).toBe(true)
})

test("rebind: cancelled old mutation settles during census and its late ACK cannot remove replacement", async () => {
  const f = fixture()
  const prepared = await f.acquire()
  f.prepare(async () => prepared)
  const first = await f.json("dock_read") as { bindingID: string; ref: string }
  const wire = f.clients[0]!.wire
  wire.holdAction = true
  wire.holdUnbind = true
  const mutation = f.json("dock_action", { ref: first.ref, actionID: "action" })
  const action = await wire.action.promise
  const gate = f.gate()
  f.prepare(async () => { await gate.promise; return prepared })
  const reading = observe(f.json("dock_read"))
  await wire.cancellation.promise
  await turn()
  expect(f.calls).toHaveLength(2)
  expect(await mutation).toMatchObject({ code: "cancelled", outcome: "unknown" })
  expect(wire.requests.filter((request) => request.op === "unbind" || request.op === "shutdown")).toEqual([])
  gate.resolve()
  const unbind = await wire.unbind.promise
  wire.holdUnbind = false
  wire.reply(unbind.id, { unbound: true })
  await turn()
  expect(reading.state.settled).toBe(false)
  expect(wire.requests.filter((request) => request.op === "bind")).toHaveLength(2)
  wire.reply(action.id, wire.receipt)
  const fresh = await reading.result as { bindingID: string; ref: string }
  expect(fresh).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
  expect(fresh.bindingID).not.toBe(first.bindingID)
  expect(wire.requests.filter((request) => request.op === "unbind")).toHaveLength(1)
  expect(wire.requests.filter((request) => request.op === "shutdown")).toEqual([])
  expect(await f.json("dock_read", { rootRef: fresh.ref })).toEqual(fresh)
})

test("rebind: overlapping refreshes join predecessor unbind before discovering again", async () => {
  const f = fixture()
  const prepared = await f.acquire()
  f.prepare(async () => prepared)
  await f.json("dock_read")
  const wire = f.clients[0]!.wire
  wire.holdUnbind = true
  const older = f.json("dock_read")
  const unbind = await wire.unbind.promise
  const latest = observe(f.json("dock_read"))
  await turn()
  expect(f.calls).toHaveLength(3)
  expect(wire.requests.filter((request) => request.op === "bind")).toHaveLength(2)
  expect(latest.state.settled).toBe(false)
  wire.holdUnbind = false
  wire.reply(unbind.id, { unbound: true })
  expect(await older).toMatchObject({ code: "cancelled" })
  expect(await latest.result).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
  expect(wire.requests.filter((request) => request.op === "bind")).toHaveLength(4)
  expect(wire.requests.filter((request) => request.op === "unbind")).toHaveLength(1)
  expect(wire.terminations).toBe(0)
})

test("rebind: abort while old unbind waits prevents new discovery and joins reaping", async () => {
  const f = fixture()
  const prepared = await f.acquire()
  f.prepare(async () => prepared)
  await f.json("dock_read")
  const wire = f.clients[0]!.wire
  wire.holdUnbind = true
  wire.holdReap = true
  const controller = new AbortController()
  const reading = observe(f.json("dock_read", {}, { abort: controller.signal }))
  const unbind = await wire.unbind.promise
  controller.abort()
  wire.holdUnbind = false
  wire.reply(unbind.id, { unbound: true })
  await wire.termination.promise
  expect(reading.state.settled).toBe(false)
  expect(wire.requests.filter((request) => request.op === "bind")).toHaveLength(2)
  wire.reap.resolve()
  expect(await reading.result).toMatchObject({ code: "cancelled" })
  expect(wire.reaped).toBe(true)
  expect(await f.json("dock_list")).toMatchObject([{ nativeReadiness: "unbound" }])
})

test("rebind: rejected refreshed target leaves old guest binding and ownership intact", async () => {
  const f = fixture()
  const prepared = await f.acquire()
  f.prepare(async () => prepared)
  const first = await f.json("dock_read") as { ref: string }
  f.prepare(async () => ({ ...prepared, target: { ...target(), processIdentities: [] } }))
  expect(await f.json("dock_read")).toMatchObject({ code: "ownership-unresolved" })
  expect(f.clients[0]!.wire.requests.filter((request) => request.op === "unbind" || request.op === "shutdown")).toEqual([])
  expect(await f.json("dock_action", { ref: first.ref, actionID: "action" })).toEqual(f.clients[0]!.wire.receipt)
})

test("rebind: failed old-client reaping still joins unused replacement-client cleanup", async () => {
  const f = fixture()
  f.prepare(() => f.acquire())
  await f.json("dock_read")
  const old = f.clients[0]!.wire
  old.holdReap = true
  f.prepare(async () => {
    const prepared = await f.acquire()
    f.clients[1]!.wire.holdReap = true
    return prepared
  })
  const reading = observe(f.json("dock_read"))
  await old.termination.promise
  old.reap.reject(new Error("Old helper could not be reaped"))
  await f.clients[1]!.wire.termination.promise
  expect(reading.state.settled).toBe(false)
  expect(f.clients[1]!.wire.requests.map((request) => request.op)).toEqual(["shutdown"])
  f.clients[1]!.wire.reap.resolve()
  expect(await reading.result).toMatchObject({ code: "helper-termination-failed", outcome: "unknown" })
  expect(f.clients[1]!.wire.reaped).toBe(true)
  expect(await f.json("dock_list")).toMatchObject([{ nativeReadiness: "unbound" }])
})

test.each(["unbind", "confirm"])("rebind: failed %s clears pending replacement and reaps the real helper", async (fault) => {
  const f = fixture()
  const prepared = await f.acquire()
  f.prepare(async () => prepared)
  await f.json("dock_read")
  const wire = f.clients[0]!.wire
  wire.holdUnbind = true
  wire.failConfirm = fault === "confirm"
  const reading = f.json("dock_read")
  const unbind = await wire.unbind.promise
  expect(f.calls).toHaveLength(2)
  wire.holdUnbind = false
  if (fault === "unbind") wire.reject(unbind.id)
  if (fault === "confirm") wire.reply(unbind.id, { unbound: true })
  expect(await reading).toMatchObject({ code: fault === "unbind" ? "unbind-failed" : "confirmation-failed" })
  expect(wire.requests.filter((request) => request.op === "bind")).toHaveLength(fault === "unbind" ? 2 : 4)
  expect(wire.requests.filter((request) => request.op === "shutdown")).toHaveLength(1)
  expect(wire.terminations).toBe(1)
  expect(wire.reaped).toBe(true)
  expect(await f.json("dock_list")).toMatchObject([{ scopeKind: "workspace", nativeReadiness: "unbound" }])
  expect(await f.json("dock_action", { ref: "n:old", actionID: "action" })).toMatchObject({ code: "not-ready" })
})

test.each(["reset", "exit"])("rebind: %s still reaps the reused helper", async (event) => {
  const f = fixture()
  const prepared = await f.acquire()
  f.prepare(async () => prepared)
  await f.json("dock_read")
  expect(await f.json("dock_read")).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
  const wire = f.clients[0]!.wire
  expect(wire.terminations).toBe(0)
  if (event === "reset") await f.rpc.reset()
  if (event === "exit") { wire.end(); await prepared.client.close() }
  expect(wire.terminations).toBe(1)
  expect(wire.reaped).toBe(true)
})

test("rebind: preparation failure leaves the existing binding and current refs available", async () => {
  const f = fixture()
  const prepared = await f.acquire()
  f.prepare(async () => prepared)
  const first = await f.json("dock_read") as { ref: string }
  f.prepare(async () => { throw new NativeDockProtocol.NativeError("not-ready", "Census unavailable") })
  expect(await f.json("dock_read")).toMatchObject({ code: "not-ready" })
  expect(f.clients[0]!.wire.requests.filter((request) => request.op === "unbind" || request.op === "shutdown")).toEqual([])
  expect(await f.json("dock_action", { ref: first.ref, actionID: "action" })).toEqual(f.clients[0]!.wire.receipt)
})

test("rebind: rejected refresh validation preserves an existing application binding", async () => {
  const f = fixture()
  const prepared = await f.acquire()
  const application = { ...identity(), ...target().runtime, scopeKind: "application" as const, appID: "workspace", launchEpoch: "session", ownershipRevision: 0 }
  await f.rpc.registerNative(application, { ...target(), scopeKind: "application" }, prepared.client, confirm)
  f.prepare(async () => prepared)
  expect(await f.json("dock_read")).toMatchObject({ code: "wrong-scope" })
  expect(f.native.has(application)).toBe(true)
  expect(f.clients[0]!.wire.requests.filter((request) => request.op === "unbind" || request.op === "shutdown")).toEqual([])
})

