import { afterEach, expect, spyOn, test } from "bun:test"
import { NativeDock } from "./app-dock-native"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { NativeDockClient } from "./app-dock-native-client"
import { WireChannel, closeDocks, confirm, docks, fixture, identity, occupancy, root, target, turn, wireFixture, workspaceIdentity, workspaceTarget } from "./app-dock-native.fixture"
import { rejection } from "./rejection.fixture"

afterEach(closeDocks)

test.each(["success", "reap"])("P2 binding cleanup: confirmation failure survives %s cleanup", async (fault) => {
  const f = await wireFixture()
  const primary = new NativeDockProtocol.NativeError("confirmation-failed", "Provider confirmation failed", "unknown",
    { receipt: "primary-evidence", detail: "café 🧪" })
  f.channel.confirmationError = primary
  f.channel.holdReap = true
  const state = { settled: false }
  const binding = f.dock.bind(identity(), target(), f.client, confirm).then(
    () => { state.settled = true; return undefined },
    (error: unknown) => { state.settled = true; return error },
  )
  try {
    await f.channel.terminationStarted.promise
    await turn()
    expect(state.settled).toBe(false)
    if (fault === "reap") f.channel.reap.reject(new Error("Synthetic /private/reap failure"))
    if (fault === "success") f.channel.reap.resolve()
    expect(await binding).toMatchObject({ code: primary.code, message: primary.message, outcome: primary.outcome, result: primary.result,
      cleanup: fault === "success" ? undefined : { code: "helper-termination-failed", outcome: "unknown" } })
    expect(f.channel.requests.map((request) => request.op)).toEqual(["bind", "bind", "shutdown"])
    if (fault === "reap") expect(await rejection(f.dock.reset())).toMatchObject({ code: "helper-termination-failed" })
  } finally {
    docks.delete(f.dock)
    f.channel.reap.resolve()
    await Promise.allSettled([binding, f.dock.close()])
  }
})

test("scope: real client carries captured workspace proof and explicit binding/tombstone metadata", async () => {
  const channel = new WireChannel()
  channel.scopeKinds = ["application", "workspace"]
  channel.appID = "workspace"
  channel.launchEpoch = "session"
  const f = await wireFixture({}, channel)
  const caller = workspaceIdentity()
  const proof = workspaceTarget()
  const entered = Promise.withResolvers<void>()
  const approval = Promise.withResolvers<NativeDockProtocol.Handle[]>()
  const binding = f.dock.bind(caller, proof, f.client, () => {
    entered.resolve()
    return approval.promise
  })
  binding.catch(() => {})
  try {
    await entered.promise
    expect(f.dock.metadata(workspaceIdentity())).toEqual({ backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "binding",
      helperEpoch: "helper", sessionID: "session" })
    expect(channel.requests[0]!.args.target).toEqual(workspaceTarget())
    caller.scopeKind = "application"
    proof.scopeKind = "application"
    proof.processIdentities[0]!.mountNamespace = "changed"
    expect(() => f.dock.has(caller)).toThrow("Native registration belongs to another scope")
    expect(channel.requests[0]!.args.target).toEqual(workspaceTarget())
    approval.resolve([root()])
    const bound = await binding
    expect(bound).toMatchObject({ appID: "workspace", launchEpoch: "session" })
    expect(f.dock.metadata(workspaceIdentity())).toEqual({ backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "bound",
      helperEpoch: "helper", sessionID: "session" })
    await f.dock.dispatch("read", workspaceIdentity(), {})
    expect(channel.requests.at(-1)).toMatchObject({ op: "read", bindingID: bound.bindingID, bindingEpoch: bound.bindingEpoch })
    await f.dock.unbind(workspaceIdentity())
    expect(f.dock.metadata(workspaceIdentity())).toEqual({ backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "unbound" })
  } finally {
    approval.resolve([root()])
    await binding.catch(() => {})
    await f.dock.close()
    await f.client.close()
  }
})


test("pending confirmation removal shares retirement and waits for actual client reaping", async () => {
  for (const method of ["unbind", "closeTab", "close"] as const) {
    const f = await wireFixture()
    f.channel.holdReap = true
    const close = spyOn(f.client, "close")
    const approval = Promise.withResolvers<NativeDockProtocol.Handle[]>()
    const entered = Promise.withResolvers<void>()
    const state = { bound: false, removed: false }
    const binding = f.dock.bind(identity(), target(), f.client, () => {
      entered.resolve()
      return approval.promise
    }).then(() => { state.bound = true; return null }, (error: unknown) => { state.bound = true; return error })
    try {
      await entered.promise
      const removal = (method === "unbind" ? f.dock.unbind(identity())
        : method === "closeTab" ? f.dock.closeTab(1, "native") : f.dock.close()).then(() => { state.removed = true })
      expect(f.dock.has(identity())).toBe(false)
      await turn()
      expect(f.channel.terminating).toBe(1)
      expect(state).toEqual({ bound: false, removed: false })
      expect(occupancy(f.dock)).toEqual({ slots: 0, clients: 1, retiring: 1, cleanups: 1, controlClients: 0, maxControls: 0 })
      if (method !== "close")
        expect(await rejection(f.dock.bind({ ...identity(), generation: 2 }, target(), f.client, confirm))).toMatchObject({ code: "client-retiring", outcome: "not-dispatched" })
      f.channel.reap.resolve()
      await removal
      expect(await binding).toMatchObject({ code: "cancelled" })
      expect(state).toEqual({ bound: true, removed: true })
      expect(f.channel.terminated).toBe(true)
      expect(close.mock.calls).toHaveLength(1)
      expect(f.channel.requests.filter((request) => request.op === "bind")).toHaveLength(1)
      expect(occupancy(f.dock)).toEqual({ slots: 0, clients: 0, retiring: 0, cleanups: 0, controlClients: 0, maxControls: 0 })
    } finally {
      approval.resolve([root()])
      f.channel.reap.resolve()
      await binding
      await f.dock.close()
      close.mockRestore()
    }
  }
})

test("discovery cancellation waits for last unused real client to reap", async () => {
  const f = await wireFixture()
  f.channel.holdDiscovery = true
  f.channel.holdReap = true
  const state = { bound: false, removed: false }
  const binding = f.dock.bind(identity(), target(), f.client, confirm).then(() => null, (error: unknown) => {
    state.bound = true
    return error
  })
  try {
    await turn()
    expect(f.channel.requests.at(-1)).toMatchObject({ op: "bind", args: { phase: "discover" } })
    const removal = f.dock.closeTab(1, "native").then(() => { state.removed = true })
    await turn()
    expect(f.channel.terminating).toBe(1)
    expect(state).toEqual({ bound: false, removed: false })
    expect(occupancy(f.dock).retiring).toBe(1)
    expect(f.channel.requests.some((request) => request.op === "cancel")).toBe(true)
    f.channel.reap.resolve()
    await removal
    expect(await binding).toMatchObject({ code: "cancelled" })
    expect(f.channel.terminated).toBe(true)
  } finally {
    f.channel.reap.resolve()
    await binding
    await f.dock.close()
  }
})

test("existing full scope is checked before rejecting a retiring client", async () => {
  const f = await wireFixture()
  f.channel.holdReap = true
  await f.dock.bind(identity(), target(), f.client, confirm)
  const removal = f.dock.unbind(identity())
  const currentChannel = new WireChannel()
  const currentClient = await NativeDockClient.create(currentChannel)
  const current = { ...identity(), generation: 2 }
  try {
    await f.dock.bind(current, target(), currentClient, confirm)
    expect(await rejection(f.dock.bind(identity(), target(), f.client, confirm))).toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
    expect(await rejection(f.dock.bind(current, target(), f.client, confirm))).toMatchObject({ code: "duplicate-bind" })
    expect(await rejection(f.dock.bind({ ...current, tabID: "other" }, target(), f.client, confirm))).toMatchObject({ code: "client-retiring" })
    expect(f.dock.has(current)).toBe(true)
    expect(() => f.dock.has(identity())).toThrow("Native registration belongs to another scope")
    f.channel.reap.resolve()
    await removal
    expect(await f.dock.dispatch("read", current, {})).toMatchObject({ backend: "linux-atspi" })
  } finally {
    f.channel.reap.resolve()
    await removal
    await f.dock.close()
    await currentClient.close()
  }
})

test("removing a pending discovery or confirmation preserves another registered slot on real client", async () => {
  for (const phase of ["discover", "confirm"] as const) {
    const f = await wireFixture()
    const approval = Promise.withResolvers<NativeDockProtocol.Handle[]>()
    const entered = Promise.withResolvers<void>()
    const keeper = { ...identity(), tabID: "keeper" }
    await f.dock.bind(keeper, target(), f.client, confirm)
    f.channel.holdDiscovery = phase === "discover"
    const binding = f.dock.bind(identity(), target(), f.client, () => {
      entered.resolve()
      return approval.promise
    }).then(() => null, (error: unknown) => error)
    try {
      if (phase === "confirm") await entered.promise
      if (phase === "discover") await turn()
      await f.dock.unbind(identity())
      expect(await binding).toMatchObject({ code: "cancelled" })
      expect(f.channel.terminating).toBe(0)
      expect(occupancy(f.dock)).toEqual({ slots: 1, clients: 1, retiring: 0, cleanups: 0, controlClients: 0, maxControls: 0 })
      expect(await f.dock.dispatch("read", keeper, {})).toMatchObject({ backend: "linux-atspi" })
      await f.dock.unbind(keeper)
      expect(f.channel.terminating).toBe(1)
      expect(f.channel.terminated).toBe(true)
    } finally {
      approval.resolve([root()])
      await binding
      await f.dock.close()
    }
  }
})

test("failed bind and facade close await the same real-client retirement", async () => {
  const f = await wireFixture()
  f.channel.holdReap = true
  const close = spyOn(f.client, "close")
  const state = { bound: false, closed: false }
  const binding = f.dock.bind(identity(), target(), f.client, async () => []).then(() => null, (error: unknown) => {
    state.bound = true
    return error
  })
  try {
    await turn()
    expect(f.channel.terminating).toBe(1)
    expect(f.dock.has(identity())).toBe(false)
    const closing = f.dock.close().then(() => { state.closed = true })
    await turn()
    expect(state).toEqual({ bound: false, closed: false })
    expect(occupancy(f.dock)).toEqual({ slots: 0, clients: 1, retiring: 1, cleanups: 1, controlClients: 0, maxControls: 0 })
    f.channel.reap.resolve()
    await closing
    expect(await binding).toMatchObject({ code: "ownership-unresolved" })
    expect(close.mock.calls).toHaveLength(1)
    expect(f.channel.terminated).toBe(true)
  } finally {
    f.channel.reap.resolve()
    await binding
    await f.dock.close()
    close.mockRestore()
  }
})

test("last shared-slot removal reserves retirement and waits for every guest control before reaping", async () => {
  const f = await wireFixture()
  f.channel.holdReap = true
  f.channel.holdUnbind = true
  const other = { ...identity(), tabID: "other" }
  await f.dock.bind(identity(), target(), f.client, confirm)
  await f.dock.bind(other, target(), f.client, confirm)
  const state = { first: false, second: false, closed: false }
  const first = f.dock.unbind(identity()).then(() => { state.first = true })
  const second = f.dock.unbind(other).then(() => { state.second = true })
  try {
    await turn()
    const controls = f.channel.requests.filter((request) => request.op === "unbind")
    expect(controls).toHaveLength(2)
    expect(f.channel.terminating).toBe(0)
    expect(occupancy(f.dock)).toEqual({ slots: 0, clients: 1, retiring: 1, cleanups: 1, controlClients: 1, maxControls: 2 })
    expect(await rejection(f.dock.bind(identity(), target(), f.client, confirm))).toMatchObject({ code: "client-retiring" })
    f.channel.send(controls[1].id, { backend: "linux-atspi", unbound: true })
    const closing = f.dock.close().then(() => { state.closed = true })
    await turn()
    expect(f.channel.terminating).toBe(0)
    expect(state).toEqual({ first: false, second: false, closed: false })
    f.channel.send(controls[0].id, { backend: "linux-atspi", unbound: true })
    await f.channel.terminationStarted.promise
    expect(f.channel.terminating).toBe(1)
    expect(state).toEqual({ first: false, second: false, closed: false })
    f.channel.reap.resolve()
    await Promise.all([first, second, closing])
    expect(state).toEqual({ first: true, second: true, closed: true })
    expect(occupancy(f.dock)).toEqual({ slots: 0, clients: 0, retiring: 0, cleanups: 0, controlClients: 0, maxControls: 0 })
  } finally {
    // A failed assertion must still release all held controls and the synthetic reap gate.
    f.channel.requests.filter((request) => request.op === "unbind").forEach((request) => f.channel.send(request.id, { backend: "linux-atspi", unbound: true }))
    f.channel.reap.resolve()
    await Promise.allSettled([first, second, f.dock.close()])
  }
})

test("33rd client is rejected while 32 real-client terminations remain held", async () => {
  const dock = new NativeDock()
  docks.add(dock)
  const channels = Array.from({ length: 32 }, () => new WireChannel())
  const clients: NativeDockClient[] = []
  const removals: Promise<void>[] = []
  const extra = new WireChannel()
  const extraClient = await NativeDockClient.create(extra)
  const state = { removed: 0, closed: false }
  try {
    // Complete startup before opening any held retirement deadlines.
    for (const channel of channels) clients.push(await NativeDockClient.create(channel))
    for (const [index, client] of clients.entries()) {
      const channel = channels[index]!
      channel.holdReap = true
      const id = { ...identity(), tabID: `retiring-${index}` }
      await dock.bind(id, target(), client, confirm)
      const removal = dock.unbind(id).then(() => { state.removed++ })
      removal.catch(() => {})
      removals.push(removal)
      await channel.terminationStarted.promise
      expect(channel.terminating).toBe(1)
    }
    expect(state.removed).toBe(0)
    expect(occupancy(dock)).toEqual({ slots: 0, clients: 32, retiring: 32, cleanups: 32, controlClients: 0, maxControls: 0 })
    expect(await rejection(dock.bind({ ...identity(), tabID: "overflow" }, target(), extraClient, confirm))).toMatchObject({ code: "capacity", outcome: "not-dispatched" })
    expect(extra.requests).toHaveLength(0)
    channels[0].reap.resolve()
    await removals[0]
    expect(occupancy(dock).clients).toBe(31)
    const id = { ...identity(), tabID: "recovered" }
    await dock.bind(id, target(), extraClient, confirm)
    extra.holdReap = true
    removals.push(dock.unbind(id).then(() => { state.removed++ }))
    const closing = dock.close().then(() => { state.closed = true })
    closing.catch(() => {})
    await extra.terminationStarted.promise
    expect(state).toEqual({ removed: 1, closed: false })
    expect(occupancy(dock)).toEqual({ slots: 0, clients: 32, retiring: 32, cleanups: 32, controlClients: 0, maxControls: 0 })
    channels.forEach((channel) => channel.reap.resolve())
    extra.reap.resolve()
    await Promise.all([...removals, closing])
    expect(state).toEqual({ removed: 33, closed: true })
    expect([...channels, extra].every((channel) => channel.terminating === 1 && channel.terminated)).toBe(true)
    expect(occupancy(dock)).toEqual({ slots: 0, clients: 0, retiring: 0, cleanups: 0, controlClients: 0, maxControls: 0 })
  } finally {
    docks.delete(dock)
    channels.forEach((channel) => channel.reap.resolve())
    extra.reap.resolve()
    await Promise.allSettled([...removals, dock.close(), ...clients.map((client) => client.close()), extraClient.close()])
  }
})

test("65 completed real-client retirements leave no growing history", async () => {
  const dock = new NativeDock()
  docks.add(dock)
  for (const generation of Array.from({ length: 65 }, (_, index) => index + 1)) {
    const channel = new WireChannel()
    const client = await NativeDockClient.create(channel)
    const id = { ...identity(), generation }
    await dock.bind(id, target(), client, confirm)
    await dock.unbind(id)
    expect(channel.terminating).toBe(1)
    expect(channel.terminated).toBe(true)
    expect(occupancy(dock)).toEqual({ slots: 0, clients: 0, retiring: 0, cleanups: 0, controlClients: 0, maxControls: 0 })
  }
})

test("failed native reaping remains counted and facade close propagates its bounded error", async () => {
  const f = await wireFixture()
  f.channel.holdReap = true
  await f.dock.bind(identity(), target(), f.client, confirm)
  const removal = f.dock.unbind(identity())
  removal.catch(() => {})
  try {
    await f.channel.terminationStarted.promise
    expect(occupancy(f.dock).clients).toBe(1)
    f.channel.reap.reject(new Error("Synthetic reap failure"))
    expect(await rejection(removal)).toMatchObject({ code: "helper-termination-failed", outcome: "unknown" })
    expect(f.channel.terminated).toBe(false)
    expect(occupancy(f.dock)).toEqual({ slots: 0, clients: 1, retiring: 1, cleanups: 0, controlClients: 0, maxControls: 0 })
    expect(await rejection(f.dock.bind(identity(), target(), f.client, confirm))).toMatchObject({ code: "client-retiring" })
    expect(await rejection(f.dock.close())).toMatchObject({ code: "helper-termination-failed", outcome: "unknown" })
    expect(await rejection(f.dock.close())).toMatchObject({ code: "helper-termination-failed" })
    expect(f.channel.terminating).toBe(1)
  } finally {
    docks.delete(f.dock)
    f.channel.reap.resolve()
    await Promise.allSettled([removal, f.dock.close()])
  }
})

test("native reap timeout stays visible instead of claiming successful termination", async () => {
  const f = await wireFixture({ cancelGraceMs: 20 })
  f.channel.holdReap = true
  await f.dock.bind(identity(), target(), f.client, confirm)
  try {
    expect(await rejection(f.dock.unbind(identity()))).toMatchObject({ code: "helper-termination-timeout", outcome: "unknown" })
    expect(f.channel.terminated).toBe(false)
    expect(occupancy(f.dock)).toEqual({ slots: 0, clients: 1, retiring: 1, cleanups: 0, controlClients: 0, maxControls: 0 })
    expect(await rejection(f.dock.close())).toMatchObject({ code: "helper-termination-timeout" })
    f.channel.reap.resolve()
    await turn()
    expect(f.channel.terminated).toBe(true)
    expect(await rejection(f.dock.close())).toMatchObject({ code: "helper-termination-timeout" })
    expect(occupancy(f.dock).clients).toBe(1)
  } finally {
    docks.delete(f.dock)
    f.channel.reap.resolve()
    await f.dock.close().catch(() => {})
  }
})

test("acknowledged action scope loss preserves unknown and bounded result through actual client", async () => {
  const f = await wireFixture()
  f.channel.holdAction = true
  await f.dock.bind(identity(), target(), f.client, confirm)
  const result = f.dock.dispatch("click", identity(), { ref: "n:button" }).then(() => null, (error: unknown) => error)
  const action = await f.channel.actionStarted.promise
  await turn()
  const evidence = { backend: "linux-atspi", method: "action", dispatch: "acknowledged", postcondition: "unverified",
    detail: "café 🧪 漢字 é" }
  f.channel.send(action.id, evidence)
  const removed = Promise.withResolvers<void>()
  queueMicrotask(() => {
    f.dock.closeTab(1, "native").then(removed.resolve, removed.reject)
  })
  const error = await result
  expect(error).toMatchObject({ code: "wrong-scope", outcome: "unknown", result: evidence })
  expect(error).toBeInstanceOf(NativeDockProtocol.NativeError)
  expect(NativeDockProtocol.json((error as NativeDockProtocol.NativeError).result)).toBe(true)
  expect(Buffer.byteLength(JSON.stringify((error as NativeDockProtocol.NativeError).result))).toBeLessThanOrEqual(NativeDockProtocol.limits.frameBytes)
  await removed.promise
  expect(f.channel.requests.filter((request) => request.op === "action")).toHaveLength(1)
})

test("pre-request cancellation and wrong scope remain not-dispatched on actual client", async () => {
  const f = await wireFixture()
  await f.dock.bind(identity(), target(), f.client, confirm)
  expect(await rejection(f.dock.dispatch("click", { ...identity(), generation: 2 }, { ref: "n:button" }))).toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  const result = f.dock.dispatch("click", identity(), { ref: "n:button" })
  const removal = f.dock.closeTab(1, "native")
  expect(await rejection(result)).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
  await removal
  expect(f.channel.requests.filter((request) => request.op === "action")).toHaveLength(0)
})

test("operation result evidence obeys JSON structure and UTF-8 frame bounds at client boundary", async () => {
  const f = fixture()
  await f.dock.bind(identity(), target(), f.client, confirm)
  for (const value of [null, "", { text: "café 🧪 漢字 é", dispatch: "acknowledged", postcondition: "unverified" }]) {
    f.client.reply = async (call) => call.op === "read" ? value : f.client.defaultReply(call)
    expect(await f.dock.dispatch("read", identity(), {})).toEqual(value)
  }
  const deep = Array.from({ length: 42 }).reduce<NativeDockProtocol.JSONValue>((value) => ({ child: value }), null)
  for (const value of [Number.NaN, "🧪".repeat(Math.floor(NativeDockProtocol.limits.frameBytes / 4) + 1), Array.from({ length: 4097 }, () => 0), deep]) {
    f.client.reply = async (call) => call.op === "read" ? value : f.client.defaultReply(call)
    expect(await rejection(f.dock.dispatch("read", identity(), {}))).toMatchObject({ code: "protocol-error", outcome: "unknown", result: undefined })
  }
})
