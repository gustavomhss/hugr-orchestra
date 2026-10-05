import { afterEach, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import type { ToolContext } from "@opencode-ai/plugin"
import { createAppDockHooks } from "../../../opencode/src/plugin/app-dock"
import type { AppDockAPI, NativeWorkspacePlacement } from "./app-dock-api"
import { AppDockRPC, type WorkspacePreparation } from "./app-dock-rpc"
import { NativeDock } from "./app-dock-native"
import { NativeDockClient } from "./app-dock-native-client"
import { NativeDockProtocol } from "./app-dock-native-protocol"

const target = (): NativeDockProtocol.Target => ({ scopeKind: "workspace", appID: "workspace", launchEpoch: "session", ownershipRevision: 0,
  runtime: { runtimeID: "runtime", runtimeEpoch: "epoch", accessibilitySessionID: "session" },
  processIdentities: [{ pid: 42, startTicks: 123, bootID: "boot", pidNamespace: "pid:[1]", mountNamespace: "mnt:[2]" }] })
const identity = () => ({ senderID: 1, tabID: "workspace", generation: 1, profileID: "profile" })
const confirm: NativeDockProtocol.Confirm = async (proposal) => proposal.roots
const turn = () => Bun.sleep(0)
const cleanups = new Set<() => Promise<void>>()
afterEach(async () => {
  const pending = [...cleanups]
  cleanups.clear()
  await Promise.all(pending.map((cleanup) => cleanup()))
})

// Controlled viewer/provider boundaries; production local RPC, plugin, facade,
// client and protocol own admission, routing, cancellation and resource cleanup.
class Wire implements NativeDockProtocol.Channel {
  private data?: (bytes: Uint8Array) => void
  private exit?: (exit: NativeDockProtocol.Exit) => void
  readonly requests: NativeDockProtocol.Request[] = []
  readonly held = new Set<string>()
  readonly unbind = Promise.withResolvers<NativeDockProtocol.Request>()
  readonly action = Promise.withResolvers<NativeDockProtocol.Request>()
  readonly cancellation = Promise.withResolvers<NativeDockProtocol.Request>()
  readonly termination = Promise.withResolvers<void>()
  readonly reap = Promise.withResolvers<void>()
  holdUnbind = false
  holdReap = false
  holdAction = false
  checkRefs = false
  failConfirm = false
  confirmationError?: NativeDockProtocol.NativeError
  terminations = 0
  reaped = false
  onRead?: () => void
  onAction?: () => void
  readonly receipt = { backend: "linux-atspi", scopeKind: "workspace", dispatch: "acknowledged", postcondition: "unverified",
    providerReceipt: { id: "ack-1", detail: "café 🧪" } }
  constructor(readonly epoch: string) {}
  onData(listener: (bytes: Uint8Array) => void) {
    this.data = listener
    queueMicrotask(() => this.reply("hello", { backend: "linux-atspi", helperEpoch: this.epoch, sessionID: "session",
      scopeKinds: ["application", "workspace"], limits: { ...NativeDockProtocol.limits },
      operations: ["bind", "read", "action", "type", "key", "unbind", "cancel", "shutdown"] }))
    return () => { this.data = undefined }
  }
  onExit(listener: (exit: NativeDockProtocol.Exit) => void) { this.exit = listener; return () => { this.exit = undefined } }
  end() { this.exit?.({ code: 1, reason: "helper-exited" }) }
  async write(bytes: Uint8Array) {
    const request = JSON.parse(new TextDecoder().decode(bytes)) as NativeDockProtocol.Request
    this.requests.push(request)
    if (request.op === "unbind" && this.holdUnbind) { this.held.add(request.id); this.unbind.resolve(request); return }
    if (request.op === "bind" && request.args.phase === "discover") {
      this.reply(request.id, { status: "proposal", proposalID: request.id, roots: [{ owner: ":1.42", path: "/window", name: "Window", role: 23 }] })
      return
    }
    if (request.op === "bind") {
      if (this.confirmationError) {
        this.reject(request.id, this.confirmationError.code, this.confirmationError.outcome,
          this.confirmationError.result, this.confirmationError.message)
        return
      }
      if (this.failConfirm) { this.reject(request.id, "confirmation-failed"); return }
      this.reply(request.id, { bindingID: request.id, bindingEpoch: request.id, appID: "workspace", launchEpoch: "session" })
      return
    }
    if (request.op === "action") {
      if (this.checkRefs && request.args.ref !== `n:${request.bindingID}`) { this.reject(request.id, "stale-ref"); return }
      this.onAction?.()
      this.action.resolve(request)
      if (this.holdAction) { this.held.add(request.id); return }
      this.reply(request.id, this.receipt)
      return
    }
    if (request.op === "cancel") this.cancellation.resolve(request)
    if (request.op === "read") this.onRead?.()
    this.reply(request.id, { backend: "linux-atspi", scopeKind: "workspace", bindingID: request.bindingID ?? "control", ref: `n:${request.bindingID}` })
  }
  reply(id: string, value: NativeDockProtocol.JSONValue) {
    this.held.delete(id)
    this.data?.(new TextEncoder().encode(`${JSON.stringify({ v: 1, id, ok: true, value })}\n`))
  }
  reject(id: string, code = "unbind-failed", outcome: NativeDockProtocol.Outcome = "not-dispatched",
    result?: NativeDockProtocol.JSONValue, message = "Synthetic /private/cleanup failure") {
    this.held.delete(id)
    this.data?.(new TextEncoder().encode(`${JSON.stringify({ v: 1, id, ok: false,
      error: { code, message, outcome, ...(result === undefined ? {} : { result }) } })}\n`))
  }
  async terminate() {
    this.terminations++
    this.termination.resolve()
    if (this.holdReap) await this.reap.promise
    this.reaped = true
  }
}

class Viewer {
  readonly removed = new Set<(identity: Readonly<{ senderID: number; tabID: string; generation: number }>) => void>()
  placement: NativeWorkspacePlacement | undefined = { runtimeID: "runtime", runtimeEpoch: "epoch", ready: true }
  profileID = "profile"
  tabs: ReturnType<AppDockAPI["list"]> = [{ tabID: "workspace", generation: 1, active: true,
    title: "Workspace", url: "https://viewer.invalid", loading: false, audible: false }]
  browserReads = 0
  activations = 0
  list() { return this.tabs }
  nativeWorkspace(_senderID: number, tabID: string) { return tabID === "workspace" ? this.placement : undefined }
  onTabRemoved(listener: (identity: Readonly<{ senderID: number; tabID: string; generation: number }>) => void) {
    this.removed.add(listener)
    return () => { this.removed.delete(listener) }
  }
  close(senderID: number, _win: unknown, tabID?: string) {
    const tab = this.tabs.find((tab) => tab.tabID === tabID)
    if (!tab) return
    this.tabs = this.tabs.filter((item) => item !== tab)
    this.removed.forEach((listener) => listener({ senderID, tabID: tab.tabID, generation: tab.generation }))
  }
  activate() { this.activations++ }
  async read(_senderID: number, tabID: string) { this.browserReads++; return { backend: "browser", tabID } }
}

class Window extends EventEmitter {
  readonly webContents = { id: 1 }
  destroyed = false
  isDestroyed() { return this.destroyed }
  destroy() { this.destroyed = true; this.emit("closed") }
}

function observe<T>(promise: Promise<T>) {
  const state = { settled: false }
  const result = promise.then((value) => { state.settled = true; return value })
  result.catch(() => {})
  return { state, result }
}

function fixture(timeoutMs = 15000) {
  const rpc = new AppDockRPC()
  const native = Reflect.get(rpc, "native") as NativeDock
  const viewer = new Viewer()
  const win = new Window()
  const clients: Array<{ client: NativeDockClient; wire: Wire }> = []
  const gates: Array<() => void> = []
  const calls: Array<{ identity: NativeDockProtocol.Identity; placement: NativeWorkspacePlacement; signal: AbortSignal }> = []
  const preparations: Promise<Awaited<ReturnType<WorkspacePreparation>>>[] = []
  const listeners = new Set<(event: { data: unknown }) => void>()
  const sent: unknown[] = []
  const replies: unknown[] = []
  const hooks = createAppDockHooks({
    postMessage(message) {
      sent.push(message)
      rpc.handleDockRPC(message, (data) => { replies.push(data); listeners.forEach((listener) => listener({ data })) })
    },
    on(_event, listener) { listeners.add(listener) },
  }, { timeoutMs })
  const context = { ask: async () => {}, abort: new AbortController().signal } as unknown as ToolContext
  const configure = () => {
    rpc.setAppDock(viewer as unknown as AppDockAPI)
    rpc.setWindow(win as unknown as Parameters<AppDockRPC["setWindow"]>[0])
    rpc.setProfileResolver(() => ({ profileID: viewer.profileID, storageKey: "storage" }))
  }
  configure()
  cleanups.add(async () => {
    gates.forEach((release) => release())
    await Promise.allSettled(preparations)
    clients.forEach(({ wire }) => {
      wire.holdUnbind = false
      wire.reap.resolve()
      wire.held.forEach((id) => wire.reply(id, { unbound: true }))
    })
    await Promise.allSettled([rpc.reset(), ...clients.map(({ client }) => client.close())])
  })
  const tool = async (name: string, args: Record<string, unknown> = {}, changes: Partial<ToolContext> = {}) =>
    String(await hooks.tool![name]!.execute(args, { ...context, ...changes }))
  return {
    rpc, native, viewer, win, configure, clients, calls, sent, replies, tool,
    json: async (name: string, args: Record<string, unknown> = {}, changes: Partial<ToolContext> = {}): Promise<unknown> =>
      JSON.parse(await tool(name, args, changes)),
    gate: () => { const gate = Promise.withResolvers<void>(); gates.push(() => gate.resolve()); return gate },
    acquire: async (proof = target()) => {
      const wire = new Wire(`helper-${clients.length}`)
      const client = await NativeDockClient.create(wire)
      clients.push({ client, wire })
      return { target: proof, client, confirm }
    },
    prepare: (prepare: WorkspacePreparation) => rpc.setWorkspacePreparation((identity, placement, signal) => {
      calls.push({ identity, placement, signal })
      const work = prepare(identity, placement, signal)
      preparations.push(work)
      return work
    }),
  }
}

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
