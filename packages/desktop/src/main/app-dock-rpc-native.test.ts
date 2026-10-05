import { afterEach, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin"
import { createAppDockHooks } from "../../../opencode/src/plugin/app-dock"
import type { AppDockAPI } from "./app-dock-api"
import { AppDockRPC } from "./app-dock-rpc"
import { NativeDock } from "./app-dock-native"
import { NativeDockClient } from "./app-dock-native-client"
import { NativeDockProtocol } from "./app-dock-native-protocol"

const target: NativeDockProtocol.Target = {
  runtime: { runtimeID: "runtime", runtimeEpoch: "epoch", accessibilitySessionID: "session" },
  appID: "app", launchEpoch: "launch", ownershipRevision: 1,
  processIdentities: [{ pid: 42, startTicks: 123, bootID: "boot", pidNamespace: "pid:[1]", mountNamespace: "mnt:[2]" }],
}
const confirm: NativeDockProtocol.Confirm = async (proposal) => proposal.roots
const turn = () => Bun.sleep(0)
const cleanups = new Set<() => Promise<unknown>>()
afterEach(async () => {
  await Promise.all([...cleanups].map((cleanup) => cleanup()))
  cleanups.clear()
})

// Only the viewer and provider wire are synthetic. The local production plugin,
// RPC, NativeDock and NativeDockClient own routing, lifecycle and correlation.
class Wire implements NativeDockProtocol.Channel {
  private data?: (bytes: Uint8Array) => void
  readonly unbindStarted = Promise.withResolvers<NativeDockProtocol.Request>()
  readonly terminationStarted = Promise.withResolvers<void>()
  readonly reap = Promise.withResolvers<void>()
  readonly requests: NativeDockProtocol.Request[] = []
  readonly held = new Map<string, NativeDockProtocol.Request>()
  holdUnbind = false
  holdReap = false
  reaped = false

  constructor(readonly epoch: string) {}

  onData(listener: (bytes: Uint8Array) => void) {
    this.data = listener
    queueMicrotask(() => this.reply("hello", {
      backend: "linux-atspi", helperEpoch: this.epoch, sessionID: "session",
      limits: { ...NativeDockProtocol.limits },
      operations: ["bind", "read", "action", "type", "key", "unbind", "cancel", "shutdown"],
    }))
    return () => { this.data = undefined }
  }

  onExit(_listener: (exit: NativeDockProtocol.Exit) => void) { return () => {} }

  async write(bytes: Uint8Array) {
    const request = JSON.parse(new TextDecoder().decode(bytes)) as NativeDockProtocol.Request
    this.requests.push(request)
    if (request.op === "unbind") {
      this.unbindStarted.resolve(request)
      if (this.holdUnbind) {
        this.held.set(request.id, request)
        return
      }
    }
    if (request.op === "bind" && request.args.phase === "discover") {
      this.reply(request.id, { status: "proposal", proposalID: request.id,
        roots: [{ owner: ":1.42", path: "/window", name: "Window", role: 23 }] })
      return
    }
    if (request.op === "bind") {
      this.reply(request.id, { bindingID: request.id, bindingEpoch: request.id, appID: "app", launchEpoch: "launch" })
      return
    }
    this.reply(request.id, { backend: "linux-atspi", bindingID: request.bindingID ?? "control" })
  }

  reply(id: string, value: NativeDockProtocol.JSONValue) {
    this.held.delete(id)
    this.data?.(new TextEncoder().encode(`${JSON.stringify({ v: 1, id, ok: true, value })}\n`))
  }

  reject(id: string) {
    this.held.delete(id)
    this.data?.(new TextEncoder().encode(`${JSON.stringify({ v: 1, id, ok: false,
      error: { code: "provider-unavailable", message: "Unbind failed", outcome: "unknown" } })}\n`))
  }

  release() {
    this.holdUnbind = false
    this.held.forEach((request) => this.reply(request.id, { unbound: true }))
    this.reap.resolve()
  }

  async terminate() {
    this.terminationStarted.resolve()
    if (this.holdReap) await this.reap.promise
    this.reaped = true
  }
}

type Removal = Readonly<{ senderID: number; tabID: string; generation: number }>

class Viewer {
  readonly listeners = new Set<(identity: Removal) => void>()
  readonly readGate = Promise.withResolvers<unknown>()
  tabs: ReturnType<AppDockAPI["list"]> = []
  profileID = "profile"
  browserReads = 0
  activations = 0
  removals = 0
  holdRead = false

  install(generation = 1) {
    this.tabs = [{ tabID: "native", generation, active: true, title: "Viewer", url: "https://viewer.invalid",
      loading: false, audible: false, canGoBack: false, canGoForward: false }]
  }

  list() { return this.tabs }
  onTabRemoved(listener: (identity: Removal) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  emit(identity: Removal) { this.listeners.forEach((listener) => listener(identity)) }
  activate() { this.activations++ }
  close(senderID: number, _win: unknown, tabID?: string) {
    const tab = this.tabs.find((tab) => tab.tabID === tabID)
    if (!tab) throw new Error("Expected a resolved viewer target")
    this.tabs = this.tabs.filter((item) => item !== tab)
    this.removals++
    this.emit({ senderID, tabID: tab.tabID, generation: tab.generation })
  }
  async read() {
    this.browserReads++
    return this.holdRead ? this.readGate.promise : { browser: true }
  }
}

function observe<T>(promise: Promise<T>) {
  const state = { settled: false }
  const result = promise.then(
    (value) => { state.settled = true; return { ok: true as const, value } },
    (error: unknown) => { state.settled = true; return { ok: false as const, error } },
  )
  return { state, result }
}

function fixture() {
  const rpc = new AppDockRPC()
  const viewer = new Viewer()
  viewer.install()
  const win = { isDestroyed: () => false, once: () => {}, webContents: { id: 1 } } as unknown as Parameters<AppDockRPC["setWindow"]>[0]
  const wires: Wire[] = []
  const clients: NativeDockClient[] = []
  const listeners = new Set<(event: { data: unknown }) => void>()
  const context = { ask: async () => {}, abort: new AbortController().signal } as unknown as ToolContext
  const hooks = createAppDockHooks({
    postMessage(message) { rpc.handleDockRPC(message, (data) => listeners.forEach((listener) => listener({ data }))) },
    on(_event, listener) { listeners.add(listener) },
  })
  const configure = () => {
    rpc.setAppDock(viewer as unknown as AppDockAPI)
    rpc.setWindow(win)
    rpc.setProfileResolver(() => ({ profileID: viewer.profileID, storageKey: "storage" }))
  }
  configure()
  cleanups.add(async () => {
    viewer.readGate.resolve({ browser: true })
    wires.forEach((wire) => wire.release())
    await Promise.allSettled([rpc.reset(), ...clients.map((client) => client.close())])
  })
  return {
    rpc, viewer, configure,
    identity: () => ({ senderID: 1, tabID: "native", generation: viewer.tabs[0]!.generation, profileID: "profile",
      ...target.runtime, appID: target.appID, launchEpoch: target.launchEpoch, ownershipRevision: target.ownershipRevision }),
    client: async () => {
      const wire = new Wire(`helper-${wires.length}`)
      wires.push(wire)
      const client = await NativeDockClient.create(wire)
      clients.push(client)
      return { wire, client }
    },
    tool: async (name: string, args: Record<string, unknown> = {}, abort = context.abort): Promise<unknown> =>
      JSON.parse(String(await hooks.tool![name]!.execute(args, { ...context, abort }))),
    request: (id: string, op: string, args: Record<string, unknown> = {}) => new Promise<unknown>((resolve) => {
      rpc.handleDockRPC({ type: "dock.rpc", id, op, args }, (reply) => {
        if (NativeDockProtocol.object(reply) && reply.type === "dock.rpc.result") resolve(reply)
      })
    }),
  }
}

test("reset reserves old client retirement before rebind and fresh replacement survives old ACK/reap", async () => {
  const f = fixture()
  const old = await f.client()
  await f.rpc.registerNative(f.identity(), target, old.client, confirm)
  old.wire.holdUnbind = true
  old.wire.holdReap = true
  const resetting = observe(f.rpc.reset())
  const joining = observe(f.rpc.reset())
  f.viewer.install(2)
  f.configure()
  await expect(f.rpc.registerNative(f.identity(), target, old.client, confirm)).rejects.toMatchObject({ code: "client-retiring" })
  expect(old.wire.requests.filter((request) => request.op === "bind")).toHaveLength(2)
  const fresh = await f.client()
  const binding = await f.rpc.registerNative(f.identity(), target, fresh.client, confirm)
  expect(await f.tool("dock_read")).toEqual({ backend: "linux-atspi", bindingID: binding.bindingID })
  const unbind = await old.wire.unbindStarted.promise
  await turn()
  expect([resetting.state.settled, joining.state.settled]).toEqual([false, false])
  old.wire.reply(unbind.id, { unbound: true })
  await old.wire.terminationStarted.promise
  await turn()
  expect([resetting.state.settled, joining.state.settled]).toEqual([false, false])
  old.wire.reap.resolve()
  expect(await resetting.result).toEqual({ ok: true, value: undefined })
  expect(await joining.result).toEqual({ ok: true, value: undefined })
  expect(old.wire.reaped).toBe(true)
  expect(await f.tool("dock_read")).toEqual({ backend: "linux-atspi", bindingID: binding.bindingID })
  expect(fresh.wire.reaped).toBe(false)
})

test("reset preserves failed retirement occupancy and rejects the next client before discovery", async () => {
  const f = fixture()
  for (const generation of Array.from({ length: NativeDockProtocol.limits.pending }, (_, index) => index + 1)) {
    f.viewer.install(generation)
    f.configure()
    const old = await f.client()
    await f.rpc.registerNative(f.identity(), target, old.client, confirm)
    old.wire.holdReap = true
    const resetting = observe(f.rpc.reset())
    await old.wire.terminationStarted.promise
    old.wire.reap.reject(new Error("Synthetic reap failure"))
    expect(await resetting.result).toMatchObject({ ok: false, error: { code: "helper-termination-failed" } })
  }
  f.viewer.install(33)
  f.configure()
  const extra = await f.client()
  await expect(f.rpc.registerNative(f.identity(), target, extra.client, confirm)).rejects.toMatchObject({ code: "capacity" })
  expect(extra.wire.requests).toEqual([])
  await expect(f.rpc.reset()).rejects.toMatchObject({ code: "helper-termination-failed" })
})

test("reset joins an already outstanding unbind and preserves its failure", async () => {
  const f = fixture()
  const old = await f.client()
  await f.rpc.registerNative(f.identity(), target, old.client, confirm)
  old.wire.holdUnbind = true
  old.wire.holdReap = true
  const removal = observe(f.rpc.unregisterNative(1, "native"))
  const unbind = await old.wire.unbindStarted.promise
  const resetting = observe(f.rpc.reset())
  old.wire.reject(unbind.id)
  await old.wire.terminationStarted.promise
  await turn()
  expect(resetting.state.settled).toBe(false)
  old.wire.reap.resolve()
  expect(await removal.result).toMatchObject({ ok: false, error: { code: "provider-unavailable" } })
  expect(await resetting.result).toMatchObject({ ok: false, error: { code: "provider-unavailable" } })
})

test("cancelled old confirmation cannot remove a replacement after reset", async () => {
  const f = fixture()
  const old = await f.client()
  old.wire.holdReap = true
  const approval = Promise.withResolvers<NativeDockProtocol.Handle[]>()
  const entered = Promise.withResolvers<void>()
  const binding = observe(f.rpc.registerNative(f.identity(), target, old.client, () => {
    entered.resolve()
    return approval.promise
  }))
  await entered.promise
  const resetting = observe(f.rpc.reset())
  f.viewer.install(2)
  f.configure()
  const fresh = await f.client()
  const replacement = await f.rpc.registerNative(f.identity(), target, fresh.client, confirm)
  await old.wire.terminationStarted.promise
  approval.reject(new Error("Late host rejection"))
  old.wire.reap.resolve()
  expect(await binding.result).toMatchObject({ ok: false, error: { code: "cancelled" } })
  expect(await resetting.result).toEqual({ ok: true, value: undefined })
  expect(await f.tool("dock_read")).toEqual({ backend: "linux-atspi", bindingID: replacement.bindingID })
  expect(fresh.wire.requests.filter((request) => request.op === "unbind")).toEqual([])
})

test.each(["explicit", "default"])("%s close joins original teardown before synchronous removal callback", async (mode) => {
  const f = fixture()
  const old = await f.client()
  await f.rpc.registerNative(f.identity(), target, old.client, confirm)
  old.wire.holdUnbind = true
  old.wire.holdReap = true
  const closing = observe(f.tool("dock_close", mode === "explicit" ? { tabID: "native" } : {}))
  const unbind = await old.wire.unbindStarted.promise
  await turn()
  expect(f.viewer.removals).toBe(1)
  expect(f.viewer.tabs).toEqual([])
  expect(closing.state.settled).toBe(false)
  old.wire.reply(unbind.id, { unbound: true })
  await old.wire.terminationStarted.promise
  await turn()
  expect(closing.state.settled).toBe(false)
  old.wire.reap.resolve()
  expect(await closing.result).toEqual({ ok: true, value: [] })
  expect(old.wire.reaped).toBe(true)
})

test.each(["unbind", "reap"])("explicit close reports %s failure through production plugin", async (fault) => {
  const f = fixture()
  const old = await f.client()
  const identity = f.identity()
  await f.rpc.registerNative(identity, target, old.client, confirm)
  old.wire.holdUnbind = true
  old.wire.holdReap = true
  const closing = observe(f.tool("dock_close", { tabID: "native" }))
  const unbind = await old.wire.unbindStarted.promise
  if (fault === "unbind") old.wire.reject(unbind.id)
  if (fault === "reap") old.wire.reply(unbind.id, { unbound: true })
  await old.wire.terminationStarted.promise
  if (fault === "reap") old.wire.reap.reject(new Error("Synthetic reap failure"))
  if (fault === "unbind") old.wire.reap.resolve()
  expect(await closing.result).toMatchObject({ ok: true, value: { backend: "linux-atspi", outcome: "unknown",
    code: fault === "reap" ? "helper-termination-failed" : "provider-unavailable", target: identity } })
})

test.each(["unregistered", "failed-bind"])("%s native tombstone supports viewer lifecycle without browser fallback", async (mode) => {
  const f = fixture()
  const old = await f.client()
  if (mode === "unregistered") {
    await f.rpc.registerNative(f.identity(), target, old.client, confirm)
    await f.rpc.unregisterNative(1, "native")
  }
  if (mode === "failed-bind")
    await expect(f.rpc.registerNative(f.identity(), target, old.client, async () => [])).rejects.toMatchObject({ code: "ownership-unresolved" })
  expect(await f.tool("dock_read")).toMatchObject({ code: "not-ready", backend: "linux-atspi" })
  f.viewer.profileID = "other"
  expect(await f.tool("dock_activate", { tabID: "native" })).toMatchObject({ code: "wrong-scope" })
  f.viewer.profileID = "profile"
  const abort = new AbortController()
  abort.abort()
  expect(await f.tool("dock_close", {}, abort.signal)).toMatchObject({ code: "cancelled" })
  expect(f.viewer.removals).toBe(0)
  expect(await f.tool("dock_activate", { tabID: "native" })).toMatchObject([{ tabID: "native" }])
  expect(f.viewer.activations).toBe(1)
  expect(await f.tool("dock_close")).toEqual([])
  expect(f.viewer.removals).toBe(1)
  expect(f.viewer.browserReads).toBe(0)
})

test("stale-generation removal cannot retire the current replacement", async () => {
  const f = fixture()
  const old = await f.client()
  await f.rpc.registerNative(f.identity(), target, old.client, confirm)
  f.viewer.close(1, undefined, "native")
  await old.wire.terminationStarted.promise
  f.viewer.install(2)
  const fresh = await f.client()
  const binding = await f.rpc.registerNative(f.identity(), target, fresh.client, confirm)
  f.viewer.emit({ senderID: 1, tabID: "native", generation: 1 })
  expect(await f.tool("dock_read")).toEqual({ backend: "linux-atspi", bindingID: binding.bindingID })
  expect(f.viewer.browserReads).toBe(0)
  expect(fresh.wire.reaped).toBe(false)
  f.viewer.close(1, undefined, "native")
  await fresh.wire.terminationStarted.promise
  await turn()
  expect(fresh.wire.reaped).toBe(true)
})

test("reset retains unresolved RPC capacity and UUID occupancy until the original finally", async () => {
  const f = fixture()
  f.viewer.holdRead = true
  const pending = Array.from({ length: 32 }, (_, index) => f.request(`old-${index}`, "read"))
  expect(f.viewer.browserReads).toBe(32)
  await f.rpc.reset()
  f.configure()
  const duplicate = observe(f.request("old-0", "read"))
  await turn()
  expect(duplicate.state.settled).toBe(true)
  expect(await duplicate.result).toMatchObject({ ok: true, value: { ok: false, error: { code: "busy" } } })
  expect(await f.request("overflow", "read")).toMatchObject({ ok: false, error: { code: "busy" } })
  expect(f.viewer.browserReads).toBe(32)
  await f.rpc.reset()
  f.configure()
  expect(await f.request("still-full", "read")).toMatchObject({ ok: false, error: { code: "busy" } })
  f.viewer.readGate.resolve({ browser: true })
  await Promise.all(pending)
  await turn()
  expect(await f.request("old-0", "read")).toMatchObject({ ok: true, value: { browser: true } })
})

test("NativeDock reset is reusable, repeated joins share pending work, and close stays terminal", async () => {
  const f = fixture()
  const native = new NativeDock()
  cleanups.add(() => native.close().catch(() => {}))
  const old = await f.client()
  await native.bind(f.identity(), target, old.client, confirm)
  old.wire.holdReap = true
  const resetting = native.reset()
  expect(native.reset()).toBe(resetting)
  await old.wire.terminationStarted.promise
  const second = await f.client()
  f.viewer.install(2)
  await native.bind(f.identity(), target, second.client, confirm)
  second.wire.holdReap = true
  expect(native.reset()).toBe(resetting)
  const joined = observe(resetting)
  await second.wire.terminationStarted.promise
  second.wire.reap.resolve()
  await turn()
  expect(joined.state.settled).toBe(false)
  const fresh = await f.client()
  f.viewer.install(3)
  const binding = await native.bind(f.identity(), target, fresh.client, confirm)
  old.wire.reap.resolve()
  await resetting
  expect(await native.dispatch("read", f.identity(), {})).toEqual({ backend: "linux-atspi", bindingID: binding.bindingID })
  const closing = native.close()
  expect(native.close()).toBe(closing)
  expect(native.reset()).toBe(closing)
  await closing
  await expect(native.bind(f.identity(), target, fresh.client, confirm)).rejects.toMatchObject({ code: "closed" })
})

test("browser read shape reaches the browser and invalid shape is rejected", async () => {
  const f = fixture()
  expect(await f.request("shape-ok", "read", { mode: "a11y", format: "tree", actionable: true, visible: false }))
    .toMatchObject({ ok: true, value: { browser: true } })
  expect(f.viewer.browserReads).toBe(1)
  expect(await f.request("shape-bad", "read", { mode: "native" })).toMatchObject({ ok: false })
  expect(f.viewer.browserReads).toBe(1)
})

test("browser read shape is rejected on a native binding without reaching the helper", async () => {
  const f = fixture()
  const { wire, client } = await f.client()
  await f.rpc.registerNative(f.identity(), target, client, confirm)
  const before = wire.requests.length
  for (const args of [{ mode: "skeleton" }, { format: "csv" }, { actionable: true }, { visible: true }])
    expect(await f.request(`native-${Object.keys(args)[0]}`, "read", args))
      .toMatchObject({ ok: false, error: { code: "unsupported-operation" } })
  expect(wire.requests.slice(before).filter((request) => request.op === "read")).toHaveLength(0)
  expect(f.viewer.browserReads).toBe(0)
})
