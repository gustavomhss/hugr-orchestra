import { afterEach, expect, test } from "bun:test"
import type { AppDockAPI } from "./app-dock-api"
import type { WorkspacePreparation } from "./app-dock-rpc"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { cleanups, closeFixtures, confirm, fixture, identity, observe, target, turn } from "./app-dock-rpc-workspace.fixture"

afterEach(closeFixtures)

test("workspace: authoritative cold classification never falls back without a preparer", async () => {
  const f = fixture()
  expect(await f.json("dock_list")).toMatchObject([{ backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "unbound" }])
  expect(await f.json("dock_read")).toMatchObject({ backend: "linux-atspi", code: "not-ready", outcome: "not-dispatched" })
  expect(f.viewer.browserReads).toBe(0)
  expect(await f.json("dock_activate", { tabID: "workspace" })).toMatchObject([{ tabID: "workspace" }])
  expect(f.viewer.activations).toBe(1)
  expect(await f.json("dock_close")).toEqual([])
})

test("P1 classification: failed cold preparation stays native after metadata withdrawal", async () => {
  const f = fixture()
  f.prepare(async () => { throw new NativeDockProtocol.NativeError("ownership-unresolved", "Census unavailable") })
  expect(await f.json("dock_read")).toMatchObject({ code: "ownership-unresolved", outcome: "not-dispatched" })
  f.viewer.placement = undefined
  expect(await f.json("dock_read")).toMatchObject({ backend: "linux-atspi", code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.viewer.browserReads).toBe(0)
  expect(f.calls).toHaveLength(1)
  expect(await f.json("dock_list")).toMatchObject([{ backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "unbound" }])
  expect(await f.json("dock_activate", { tabID: "workspace" })).toMatchObject([{ tabID: "workspace" }])
  expect(f.viewer.activations).toBe(1)
  expect(await f.json("dock_close")).toEqual([])
})

test.each(["list", "unready"])("P1 classification: %s observation survives reset and metadata withdrawal", async (observation) => {
  const f = fixture()
  if (observation === "list")
    expect(await f.json("dock_list")).toMatchObject([{ backend: "linux-atspi", scopeKind: "workspace" }])
  if (observation === "unready") {
    f.viewer.placement = { ...f.viewer.placement!, ready: false }
    expect(await f.json("dock_read")).toMatchObject({ code: "not-ready", outcome: "not-dispatched" })
  }
  await f.rpc.reset()
  f.configure()
  f.viewer.placement = undefined
  expect(await f.json("dock_read")).toMatchObject({ backend: "linux-atspi", code: "wrong-scope", outcome: "not-dispatched" })
  expect(await f.json("dock_list")).toMatchObject([{ backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "unbound" }])
  expect(f.viewer.browserReads).toBe(0)
})

test("P1 classification: ordinary browsers and replacement generations remain browser targets", async () => {
  const f = fixture()
  const placement = f.viewer.placement
  f.viewer.placement = undefined
  expect(await f.json("dock_read")).toEqual({ backend: "browser", tabID: "workspace" })
  f.viewer.placement = placement
  expect(await f.json("dock_list")).toMatchObject([{ backend: "linux-atspi", scopeKind: "workspace" }])
  f.viewer.placement = undefined
  f.viewer.tabs[0]!.generation++
  expect(await f.json("dock_read")).toEqual({ backend: "browser", tabID: "workspace" })
  expect(await f.json("dock_list")).toEqual(f.viewer.tabs)
  expect(f.viewer.browserReads).toBe(2)
})

test("P1 classification: stale removal cannot erase current cold intent", async () => {
  const f = fixture()
  f.viewer.tabs[0]!.generation = 2
  expect(await f.json("dock_list")).toMatchObject([{ backend: "linux-atspi", scopeKind: "workspace" }])
  f.viewer.placement = undefined
  f.viewer.removed.forEach((listener) => listener({ senderID: 1, tabID: "workspace", generation: 1 }))
  expect(await f.json("dock_read")).toMatchObject({ backend: "linux-atspi", code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.viewer.browserReads).toBe(0)
  const replacement = { ...f.viewer.tabs[0]!, generation: 3 }
  expect(await f.json("dock_close")).toEqual([])
  f.viewer.tabs.push(replacement)
  expect(await f.json("dock_read")).toEqual({ backend: "browser", tabID: "workspace" })
})

test.each([
  ["unknown", "success"], ["unknown", "reap"], ["not-dispatched", "success"], ["not-dispatched", "reap"],
] as const)("P2 preparation cleanup: %s confirmation failure with %s reaping preserves wire evidence", async (outcome, fault) => {
  const f = fixture()
  const prepared = await f.acquire()
  const wire = f.clients[0]!.wire
  const primary = new NativeDockProtocol.NativeError("confirmation-failed", "Provider confirmation failed", outcome,
    { receipt: "primary-evidence", detail: "café 🧪" })
  wire.confirmationError = primary
  wire.holdReap = true
  f.prepare(async () => prepared)
  const reading = observe(f.json("dock_read"))
  await wire.termination.promise
  await turn()
  expect(reading.state.settled).toBe(false)
  if (fault === "reap") wire.reap.reject(new Error("Synthetic /private/reap failure"))
  if (fault === "success") wire.reap.resolve()
  await reading.result
  expect(f.replies.at(-1)).toEqual({ type: "dock.rpc.result", id: expect.any(String), ok: false,
    error: { backend: "linux-atspi", code: primary.code, message: primary.message, outcome, result: primary.result,
      ...(fault === "success" ? {} : { cleanup: { code: "helper-termination-failed", outcome: "unknown" } }) } })
  expect(wire.requests.map((request) => request.op)).toEqual(["bind", "bind", "shutdown"])
  expect(wire.terminations).toBe(1)
  if (fault === "reap") await expect(f.native.reset()).rejects.toMatchObject({ code: "helper-termination-failed" })
})

test.each([
  new Error("Synthetic /private/orphan cleanup failure"),
  new NativeDockProtocol.NativeError("/private/cleanup", "Private message"),
  new NativeDockProtocol.NativeError("x".repeat(257), "Private message"),
])("P2 preparation cleanup: pre-bind rejection keeps primary with sanitized cleanup (%#)", async (failure) => {
  const f = fixture()
  const prepared = await f.acquire({ ...target(), appID: "foreign" })
  const wire = f.clients[0]!.wire
  wire.holdReap = true
  f.prepare(async () => ({ ...prepared, client: { hello: prepared.client.hello,
    request: (call, signal) => prepared.client.request(call, signal),
    close: async () => { await prepared.client.close(); throw failure } } }))
  const reading = observe(f.json("dock_read"))
  await wire.termination.promise
  await turn()
  expect(reading.state.settled).toBe(false)
  wire.reap.resolve()
  await reading.result
  expect(f.replies.at(-1)).toEqual({ type: "dock.rpc.result", id: expect.any(String), ok: false,
    error: { backend: "linux-atspi", code: "wrong-scope", message: "Prepared target does not match captured workspace",
      outcome: "not-dispatched", cleanup: { code: "native-cleanup-failed", outcome: "unknown" } } })
  expect(wire.requests.map((request) => request.op)).toEqual(["shutdown"])
  await expect(f.native.reset()).rejects.toBe(failure)
})

test("workspace: permission denial sends no RPC and calls no preparer", async () => {
  const f = fixture()
  f.prepare(() => f.acquire())
  expect(await f.tool("dock_read", {}, { ask: async () => { throw new Error("Permission denied") } })).toBe("Permission denied")
  expect(f.sent).toEqual([])
  expect(f.calls).toEqual([])
})

test("workspace: private preparation fields cannot enter captured placement or model admission", async () => {
  const f = fixture()
  const proof = target()
  Object.assign(proof.runtime, { privatePath: "/synthetic-private/runtime" })
  f.viewer.placement = Object.assign({ ...f.viewer.placement! }, { privatePath: "/synthetic-private/placement" })
  f.prepare(() => f.acquire(proof))
  expect(await f.json("dock_read")).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
  expect(f.calls[0]!.placement).toEqual({ runtimeID: "runtime", runtimeEpoch: "epoch", ready: true })
  expect(f.replies[1]).toEqual({ type: "dock.rpc.native-admitted", id: (f.sent[0] as { id: string }).id, backend: "linux-atspi",
    target: { ...identity(), runtimeID: "runtime", runtimeEpoch: "epoch", accessibilitySessionID: "session",
      scopeKind: "workspace", appID: "workspace", launchEpoch: "session", ownershipRevision: 0 } })
})

test("workspace: cold read sends pending then captured admission and binds through real client", async () => {
  const f = fixture()
  const gate = f.gate()
  const entered = f.gate()
  f.prepare(async () => { entered.resolve(); await gate.promise; return f.acquire() })
  const reading = observe(f.json("dock_read"))
  await entered.promise
  expect(reading.state.settled).toBe(false)
  expect(f.replies).toEqual([{ type: "dock.rpc.native-pending", id: (f.sent[0] as { id: string }).id, backend: "linux-atspi", scopeKind: "workspace" }])
  expect(f.calls[0]).toMatchObject({ identity: identity(), placement: { runtimeID: "runtime", runtimeEpoch: "epoch", ready: true } })
  expect(Object.isFrozen(f.calls[0]!.identity)).toBe(true)
  expect(Object.isFrozen(f.calls[0]!.placement)).toBe(true)
  f.viewer.tabs.push({ ...f.viewer.tabs[0]!, tabID: "browser", active: true })
  f.viewer.tabs[0]!.active = false
  gate.resolve()
  expect(await reading.result).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
  expect(f.replies[1]).toMatchObject({ type: "dock.rpc.native-admitted", target: { ...identity(), scopeKind: "workspace", ownershipRevision: 0,
    runtimeID: "runtime", runtimeEpoch: "epoch", accessibilitySessionID: "session", appID: "workspace", launchEpoch: "session" } })
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["bind", "bind", "read"])
  expect(f.viewer.browserReads).toBe(0)
})

test.each(["unready", "failure"])("workspace: %s preparation stays native and unavailable", async (mode) => {
  const f = fixture()
  f.prepare(async () => { throw new Error("Census unavailable") })
  if (mode === "unready") f.viewer.placement = { ...f.viewer.placement!, ready: false }
  expect(await f.json("dock_read")).toMatchObject({ backend: "linux-atspi", code: "not-ready", outcome: "not-dispatched" })
  expect(f.calls.length).toBe(mode === "unready" ? 0 : 1)
  expect(await f.json("dock_list")).toMatchObject([{ backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "unbound" }])
  expect(await f.json("dock_activate", { tabID: "workspace" })).toMatchObject([{ tabID: "workspace" }])
  expect(await f.json("dock_close")).toEqual([])
  expect(f.viewer.browserReads).toBe(0)
})

test("workspace: selectors and mutations use a current binding and never invoke preparation", async () => {
  const f = fixture()
  f.prepare(() => f.acquire())
  expect(await f.json("dock_read", { rootRef: "n:root" })).toMatchObject({ code: "not-ready" })
  expect(await f.json("dock_read", { cursor: "cursor" })).toMatchObject({ code: "not-ready" })
  expect(await f.json("dock_action", { ref: "n:root", actionID: "action" })).toMatchObject({ code: "not-ready" })
  expect(f.calls).toEqual([])
  await f.json("dock_read")
  await f.json("dock_read", { rootRef: "n:root" })
  await f.json("dock_read", { cursor: "cursor" })
  await f.json("dock_action", { ref: "n:root", actionID: "action" })
  await f.json("dock_keyboard", { ref: "n:root", keys: "ctrl+comma" })
  expect(f.calls).toHaveLength(1)
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["bind", "bind", "read", "read", "read", "action", "key"])
  expect(f.clients[0]!.wire.requests.at(-1)?.args).toEqual({ ref: "n:root", keys: "ctrl+comma" })
  expect(f.viewer.browserReads).toBe(0)
})

test("P1 authority: withdrawn workspace authority rejects old refs before provider and keeps viewer lifecycle", async () => {
  const f = fixture()
  f.prepare(() => f.acquire())
  const observation = await f.json("dock_read") as { ref: string }
  const wire = f.clients[0]!.wire
  expect(await f.json("dock_action", { ref: observation.ref, actionID: "action" })).toEqual(wire.receipt)
  f.viewer.placement = undefined
  const before = wire.requests.length
  expect(await f.json("dock_action", { ref: observation.ref, actionID: "action" })).toMatchObject({
    backend: "linux-atspi", code: "wrong-scope", outcome: "not-dispatched",
  })
  expect(await f.json("dock_read")).toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  expect(wire.requests).toHaveLength(before)
  expect(f.calls).toHaveLength(1)
  expect(f.viewer.browserReads).toBe(0)
  expect(await f.json("dock_list")).toMatchObject([{ backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "unbound" }])
  expect(await f.json("dock_activate", { tabID: "workspace" })).toMatchObject([{ tabID: "workspace" }])
  expect(f.viewer.activations).toBe(1)
  expect(await f.json("dock_close")).toEqual([])
  expect(wire.reaped).toBe(true)
})

test("P1 authority: legacy application binding without a workspace getter remains usable", async () => {
  const f = fixture()
  const viewer: Pick<AppDockAPI, "list" | "onTabRemoved" | "read"> = {
    list: () => f.viewer.list(), onTabRemoved: (listener) => f.viewer.onTabRemoved(listener), read: (senderID, tabID) => f.viewer.read(senderID, tabID),
  }
  f.rpc.setAppDock(viewer as AppDockAPI)
  const prepared = await f.acquire()
  await f.rpc.registerNative({ ...identity(), ...target().runtime, appID: "workspace", launchEpoch: "session", ownershipRevision: 0 },
    { ...target(), scopeKind: "application" }, prepared.client, confirm)
  expect(await f.json("dock_action", { ref: "n:legacy", actionID: "action" })).toEqual(f.clients[0]!.wire.receipt)
  expect(f.viewer.browserReads).toBe(0)
})

test.each([
  ["profile", "success"], ["profile", "unbind"], ["profile", "reap"],
  ["placement", "success"], ["placement", "unbind"], ["placement", "reap"],
] as const)("P1 receipt: ACK plus %s drift and %s cleanup preserves primary evidence", async (drift, fault) => {
  const f = fixture()
  f.prepare(() => f.acquire())
  const observation = await f.json("dock_read") as { ref: string }
  const wire = f.clients[0]!.wire
  wire.onAction = () => {
    if (drift === "profile") f.viewer.profileID = "other"
    if (drift === "placement") f.viewer.placement = { ...f.viewer.placement!, runtimeEpoch: "other" }
  }
  wire.holdUnbind = true
  wire.holdReap = true
  const action = observe(f.json("dock_action", { ref: observation.ref, actionID: "action" }))
  const unbind = await wire.unbind.promise
  await turn()
  expect(action.state.settled).toBe(false)
  if (fault === "unbind") wire.reject(unbind.id)
  if (fault !== "unbind") wire.reply(unbind.id, { unbound: true })
  await wire.termination.promise
  expect(action.state.settled).toBe(false)
  if (fault === "reap") wire.reap.reject(new Error("Synthetic /private/reap failure"))
  if (fault !== "reap") wire.reap.resolve()
  expect(await action.result).toEqual({ backend: "linux-atspi", code: "wrong-scope", message: "Native workspace changed during request", outcome: "unknown",
    result: wire.receipt, target: { ...identity(), ...target().runtime, scopeKind: "workspace", appID: "workspace", launchEpoch: "session", ownershipRevision: 0 },
    ...(fault === "success" ? {} : { cleanup: { code: fault === "unbind" ? "unbind-failed" : "helper-termination-failed", outcome: "unknown" } }) })
  expect(wire.requests.map((request) => request.op)).toEqual(["bind", "bind", "read", "action", "unbind", "shutdown"])
})

test.each([
  new Error("Synthetic /private/untyped cleanup failure"),
  new NativeDockProtocol.NativeError("/private/cleanup", "Private message"),
  new NativeDockProtocol.NativeError("x".repeat(257), "Private message"),
] as const)("P1 receipt: invalid or untyped host cleanup evidence is bounded (%#)", async (failure) => {
  const f = fixture()
  f.prepare(async () => {
    const prepared = await f.acquire()
    const client: NativeDockProtocol.Client = { hello: prepared.client.hello,
      request: (call, signal) => prepared.client.request(call, signal),
      close: async () => { await prepared.client.close(); throw failure } }
    return { ...prepared, client }
  })
  const observation = await f.json("dock_read") as { ref: string }
  const wire = f.clients[0]!.wire
  wire.onAction = () => { f.viewer.profileID = "other" }
  expect(await f.json("dock_action", { ref: observation.ref, actionID: "action" })).toEqual({
    backend: "linux-atspi", code: "wrong-scope", message: "Native workspace changed during request", outcome: "unknown", result: wire.receipt,
    target: { ...identity(), ...target().runtime, scopeKind: "workspace", appID: "workspace", launchEpoch: "session", ownershipRevision: 0 },
    cleanup: { code: "native-cleanup-failed", outcome: "unknown" },
  })
  expect(wire.reaped).toBe(true)
})

test("P1 receipt: an untyped post-ACK scope failure remains unknown with its receipt", async () => {
  const f = fixture()
  f.prepare(() => f.acquire())
  const observation = await f.json("dock_read") as { ref: string }
  const probe = { fail: false }
  f.rpc.setProfileResolver(() => {
    if (probe.fail) {
      probe.fail = false
      f.viewer.profileID = "other"
      throw new Error("Synthetic /private/scope probe failure")
    }
    return { profileID: f.viewer.profileID, storageKey: "storage" }
  })
  const wire = f.clients[0]!.wire
  wire.onAction = () => { probe.fail = true }
  expect(await f.json("dock_action", { ref: observation.ref, actionID: "action" })).toEqual({
    backend: "linux-atspi", code: "transport-error", message: "Native workspace request failed", outcome: "unknown", result: wire.receipt,
    target: { ...identity(), ...target().runtime, scopeKind: "workspace", appID: "workspace", launchEpoch: "session", ownershipRevision: 0 },
  })
  expect(wire.reaped).toBe(true)
})

test.each(["generation", "profile", "runtime", "epoch", "ready"])("workspace: after-await %s drift rejects and reaps the returned orphan", async (change) => {
  const f = fixture()
  const gate = f.gate()
  const entered = f.gate()
  f.prepare(async () => { entered.resolve(); await gate.promise; return f.acquire() })
  const reading = f.json("dock_read")
  await entered.promise
  if (change === "generation") f.viewer.tabs[0]!.generation++
  if (change === "profile") f.viewer.profileID = "other"
  if (change === "runtime") f.viewer.placement = { ...f.viewer.placement!, runtimeID: "other" }
  if (change === "epoch") f.viewer.placement = { ...f.viewer.placement!, runtimeEpoch: "other" }
  if (change === "ready") f.viewer.placement = { ...f.viewer.placement!, ready: false }
  gate.resolve()
  expect(await reading).toMatchObject({ backend: "linux-atspi", code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["shutdown"])
  expect(f.clients[0]!.wire.reaped).toBe(true)
  expect(f.viewer.browserReads).toBe(0)
})

test.each(["scope", "marker", "session", "runtime", "epoch"])("workspace: returned target %s mismatch is rejected before discovery", async (change) => {
  const f = fixture()
  const proof = target()
  if (change === "scope") proof.scopeKind = "application"
  if (change === "marker") proof.appID = "other"
  if (change === "session") proof.launchEpoch = "other"
  if (change === "runtime") proof.runtime.runtimeID = "other"
  if (change === "epoch") proof.runtime.runtimeEpoch = "other"
  f.prepare(() => f.acquire(proof))
  expect(await f.json("dock_read")).toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["shutdown"])
  expect(f.clients[0]!.wire.reaped).toBe(true)
})

test.each(["abort", "close", "window", "reset"])("workspace: %s during preparation cannot resurrect a binding", async (event) => {
  const f = fixture()
  const gate = f.gate()
  const entered = f.gate()
  const abort = new AbortController()
  f.prepare(async () => { entered.resolve(); await gate.promise; return f.acquire() })
  const reading = f.json("dock_read", {}, { abort: abort.signal })
  await entered.promise
  const resetting = event === "reset" ? observe(f.rpc.reset()) : undefined
  if (event === "abort") abort.abort()
  if (event === "close") expect(await f.json("dock_close")).toEqual([])
  if (event === "window") f.win.destroy()
  expect(f.calls[0]!.signal.aborted).toBe(true)
  await turn()
  if (resetting) expect(resetting.state.settled).toBe(false)
  gate.resolve()
  expect(await reading).toMatchObject({ backend: "linux-atspi", code: "cancelled", outcome: "not-dispatched" })
  await resetting?.result
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["shutdown"])
  expect(f.clients[0]!.wire.reaped).toBe(true)
  expect(f.replies.filter((reply) => NativeDockProtocol.object(reply) && reply.type === "dock.rpc.native-admitted")).toEqual([])
  if (event === "reset") {
    f.configure()
    expect(await f.json("dock_read")).toMatchObject({ code: "not-ready" })
    expect(f.calls).toHaveLength(1)
  }
})

test("workspace: orphan cleanup joins actual reaping before settling caller and reset", async () => {
  const f = fixture()
  const gate = f.gate()
  const entered = f.gate()
  const acquired = f.gate()
  f.prepare(async () => {
    entered.resolve()
    await gate.promise
    const prepared = await f.acquire()
    f.clients[0]!.wire.holdReap = true
    acquired.resolve()
    return prepared
  })
  const reading = observe(f.json("dock_read"))
  await entered.promise
  const resetting = observe(f.rpc.reset())
  gate.resolve()
  await acquired.promise
  await turn()
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["shutdown"])
  await f.clients[0]!.wire.termination.promise
  expect(reading.state.settled).toBe(false)
  expect(resetting.state.settled).toBe(false)
  f.clients[0]!.wire.reap.resolve()
  expect(await reading.result).toMatchObject({ code: "cancelled" })
  await resetting.result
  expect(f.clients[0]!.wire.reaped).toBe(true)
})

test("workspace: confirmation-time scope loss cannot confirm or retain a prepared binding", async () => {
  const f = fixture()
  const gate = f.gate()
  const entered = f.gate()
  f.prepare(async () => ({ ...await f.acquire(), confirm: async (proposal) => {
    entered.resolve()
    await gate.promise
    return proposal.roots
  } }))
  const reading = f.json("dock_read")
  await entered.promise
  f.viewer.profileID = "other"
  gate.resolve()
  expect(await reading).toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["bind", "shutdown"])
  expect(f.clients[0]!.wire.reaped).toBe(true)
})

test("workspace: scope loss after provider read preserves unknown evidence and unbinds its own slot", async () => {
  const f = fixture()
  f.prepare(async () => {
    const prepared = await f.acquire()
    f.clients[0]!.wire.onRead = () => { f.viewer.profileID = "other" }
    return prepared
  })
  expect(await f.json("dock_read")).toMatchObject({ code: "wrong-scope", outcome: "unknown",
    result: { backend: "linux-atspi", scopeKind: "workspace" } })
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["bind", "bind", "read", "unbind", "shutdown"])
  expect(f.clients[0]!.wire.reaped).toBe(true)
})

test("workspace: stale removal cannot cancel an unbound replacement preparation", async () => {
  const f = fixture()
  f.viewer.tabs[0]!.generation = 2
  const gate = f.gate()
  const entered = f.gate()
  f.prepare(async () => { entered.resolve(); await gate.promise; return f.acquire() })
  const reading = f.json("dock_read")
  await entered.promise
  f.viewer.removed.forEach((listener) => listener({ senderID: 1, tabID: "workspace", generation: 1 }))
  expect(f.calls[0]!.signal.aborted).toBe(false)
  gate.resolve()
  expect(await reading).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
})

test("workspace: reset late shared adoption cleans only the old request and preserves the new scope", async () => {
  const f = fixture()
  const gate = f.gate()
  const entered = f.gate()
  const replacement = Promise.withResolvers<Awaited<ReturnType<WorkspacePreparation>>>()
  replacement.promise.catch(() => {})
  cleanups.add(async () => {
    replacement.reject(new NativeDockProtocol.NativeError("cancelled", "Test preparation ended"))
    await replacement.promise.catch(() => {})
  })
  f.prepare(async () => { entered.resolve(); await gate.promise; return replacement.promise })
  const old = f.json("dock_read")
  await entered.promise
  const resetting = observe(f.rpc.reset())
  f.viewer.tabs[0]!.generation = 2
  f.configure()
  f.prepare(async () => {
    const prepared = await f.acquire()
    replacement.resolve(prepared)
    return prepared
  })
  const fresh = await f.json("dock_read")
  gate.resolve()
  expect(await old).toMatchObject({ code: "cancelled" })
  await resetting.result
  expect(await f.json("dock_read", { rootRef: "n:current" })).toEqual(fresh)
  expect(f.clients).toHaveLength(1)
  expect(f.clients[0]!.wire.reaped).toBe(false)
})

test("workspace: pre-aborted request never calls preparation", async () => {
  const f = fixture()
  f.prepare(() => f.acquire())
  const abort = new AbortController()
  abort.abort()
  expect(await f.json("dock_read", {}, { abort: abort.signal })).toMatchObject({ code: "cancelled" })
  expect(f.calls).toEqual([])
})


test("workspace: a returned shared client survives orphan cleanup after scope loss", async () => {
  const f = fixture()
  const shared = await f.acquire()
  const keeper = { ...identity(), tabID: "keeper", ...target().runtime, scopeKind: "workspace" as const,
    appID: "workspace", launchEpoch: "session", ownershipRevision: 0 }
  await f.native.bind(keeper, target(), shared.client, confirm)
  const gate = f.gate()
  const entered = f.gate()
  f.prepare(async () => { entered.resolve(); await gate.promise; return shared })
  const reading = f.json("dock_read")
  await entered.promise
  f.viewer.profileID = "other"
  gate.resolve()
  expect(await reading).toMatchObject({ code: "wrong-scope" })
  expect(f.clients[0]!.wire.reaped).toBe(false)
  expect(f.native.has(keeper)).toBe(true)
  await expect(f.native.dispatch("read", keeper, {})).resolves.toMatchObject({ backend: "linux-atspi" })
})

test("workspace: 32 failed reaps reject preparation before acquiring client 33", async () => {
  const f = fixture()
  for (const _ of Array.from({ length: 32 })) {
    const old = await f.acquire()
    const id = { ...identity(), ...target().runtime, scopeKind: "workspace" as const, appID: "workspace", launchEpoch: "session", ownershipRevision: 0 }
    await f.native.bind(id, target(), old.client, confirm)
    const wire = f.clients.at(-1)!.wire
    wire.holdReap = true
    const removal = f.native.unbind(id)
    removal.catch(() => {})
    await wire.termination.promise
    wire.reap.reject(new Error("Synthetic reap failure"))
    await expect(removal).rejects.toMatchObject({ code: "helper-termination-failed" })
  }
  f.prepare(() => f.acquire())
  expect(await f.json("dock_read")).toMatchObject({ code: "capacity", outcome: "not-dispatched" })
  expect(f.calls).toEqual([])
  expect(f.clients).toHaveLength(32)
})

test("workspace: preparation watchdog fails caller/reset, retains capacity, and cleans a late client once", async () => {
  const f = fixture()
  const gate = f.gate()
  const entered = f.gate()
  f.prepare(async () => { entered.resolve(); await gate.promise; return f.acquire() })
  const reading = f.json("dock_read")
  await entered.promise
  const resetting = f.rpc.reset()
  resetting.catch(() => {})
  expect(await reading).toMatchObject({ code: "native-preparation-timeout", outcome: "unknown" })
  await expect(resetting).rejects.toMatchObject({ code: "native-preparation-timeout", outcome: "unknown" })
  const reservations = Array.from({ length: 31 }, () => f.native.reserveClient())
  try {
    expect(() => f.native.reserveClient()).toThrow("Native client cleanup capacity exhausted")
  } finally {
    reservations.forEach((reservation) => reservation.fail(new NativeDockProtocol.NativeError("cancelled", "No acquisition")))
    await Promise.allSettled(reservations.map((reservation) => reservation.completion))
    gate.resolve()
  }
  await turn()
  await f.clients[0]!.wire.termination.promise
  await turn()
  expect(f.clients[0]!.wire.requests.map((request) => request.op)).toEqual(["shutdown"])
  expect(f.clients[0]!.wire.reaped).toBe(true)
  expect(f.replies.filter((reply) => NativeDockProtocol.object(reply) && reply.type === "dock.rpc.result")).toHaveLength(1)
  await expect(resetting).rejects.toMatchObject({ code: "native-preparation-timeout" })
  const recovered = f.native.reserveClient()
  recovered.fail(new NativeDockProtocol.NativeError("cancelled", "No acquisition"))
  await Promise.allSettled([recovered.completion])
}, 30000)

test("scoped callers reach their own world whatever tab the user has selected", async () => {
  const f = fixture()
  f.prepare(() => f.acquire())
  f.viewer.tabs.push({ ...f.viewer.tabs[0]!, tabID: "browser", active: true })
  f.viewer.tabs[0]!.active = false
  const linux = { agent: "linux" }
  expect(await f.json("ui_read", {}, linux)).toMatchObject({ backend: "linux-atspi", scopeKind: "workspace" })
  expect(f.viewer.browserReads).toBe(0)
  expect(await f.json("dock_read", {}, { agent: "build" })).toEqual({ backend: "browser", tabID: "browser" })
  // Only the Linux tab left: a browser-scoped caller is refused instead of silently reading the workspace.
  f.viewer.tabs = f.viewer.tabs.filter((tab) => tab.tabID === "workspace")
  expect(await f.tool("dock_read", {}, { agent: "build" })).toContain("operated by the linux agent")
  expect(await f.tool("dock_activate", { tabID: "workspace" }, { agent: "build" })).toContain("operated by the linux agent")
  expect(f.viewer.browserReads).toBe(1)
  f.viewer.tabs = []
  expect(await f.tool("ui_read", {}, linux)).toContain("Apps > Linux workspace")
})
