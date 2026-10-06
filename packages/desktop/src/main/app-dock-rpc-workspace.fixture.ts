import { EventEmitter } from "node:events"
import type { ToolContext } from "@opencode-ai/plugin"
import { createAppDockHooks } from "../../../opencode/src/plugin/app-dock"
import type { AppDockAPI, NativeWorkspacePlacement } from "./app-dock-api"
import { AppDockRPC, type WorkspacePreparation } from "./app-dock-rpc"
import type { NativeDock } from "./app-dock-native"
import { NativeDockClient } from "./app-dock-native-client"
import { NativeDockProtocol } from "./app-dock-native-protocol"

export const target = (): NativeDockProtocol.Target => ({ scopeKind: "workspace", appID: "workspace", launchEpoch: "session", ownershipRevision: 0,
  runtime: { runtimeID: "runtime", runtimeEpoch: "epoch", accessibilitySessionID: "session" },
  processIdentities: [{ pid: 42, startTicks: 123, bootID: "boot", pidNamespace: "pid:[1]", mountNamespace: "mnt:[2]" }] })
export const identity = () => ({ senderID: 1, tabID: "workspace", generation: 1, profileID: "profile" })
export const confirm: NativeDockProtocol.Confirm = async (proposal) => proposal.roots
export const turn = () => Bun.sleep(0)
export const cleanups = new Set<() => Promise<void>>()
export async function closeFixtures() {
  const pending = [...cleanups]
  cleanups.clear()
  await Promise.all(pending.map((cleanup) => cleanup()))
}

// Controlled viewer/provider boundaries; production local RPC, plugin, facade,
// client and protocol own admission, routing, cancellation and resource cleanup.
export class Wire implements NativeDockProtocol.Channel {
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

export class Viewer {
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

export class Window extends EventEmitter {
  readonly webContents = { id: 1 }
  destroyed = false
  isDestroyed() { return this.destroyed }
  destroy() { this.destroyed = true; this.emit("closed") }
}

export function observe<T>(promise: Promise<T>) {
  const state = { settled: false }
  const result = promise.then((value) => { state.settled = true; return value })
  result.catch(() => {})
  return { state, result }
}

export function fixture(timeoutMs = 15000) {
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
