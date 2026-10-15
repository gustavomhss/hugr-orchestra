import { NativeDock, type DockIdentity } from "./app-dock-native"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { NativeDockClient } from "./app-dock-native-client"

export const identity = (): DockIdentity => ({ senderID: 1, tabID: "native", generation: 1, profileID: "profile",
  runtimeID: "runtime", runtimeEpoch: "runtime-epoch", accessibilitySessionID: "session",
  appID: "app", launchEpoch: "launch", ownershipRevision: 1 })
export const root = () => ({ owner: ":1.42", path: "/org/a11y/atspi/accessible/1" })
export const target = (): NativeDockProtocol.Target => ({ runtime: { runtimeID: "runtime", runtimeEpoch: "runtime-epoch",
  accessibilitySessionID: "session" }, appID: "app", launchEpoch: "launch", ownershipRevision: 1,
  processIdentities: [{ pid: 42, startTicks: 123, bootID: "boot", pidNamespace: "pid:[1]", mountNamespace: "mnt:[2]" }] })
export const confirm: NativeDockProtocol.Confirm = async (proposal) => proposal.roots.map((item) => ({ owner: item.owner, path: item.path }))
export const workspaceIdentity = (): DockIdentity => ({ ...identity(), scopeKind: "workspace", appID: "workspace", launchEpoch: "session" })
export const workspaceTarget = (): NativeDockProtocol.Target => ({ ...target(), scopeKind: "workspace", appID: "workspace", launchEpoch: "session",
  processIdentities: [target().processIdentities[0]!, { ...target().processIdentities[0]!, pid: 43, startTicks: 456 }] })

export function deferred<T>() {
  const state: { resolve?: (value: T) => void; reject?: (error: Error) => void } = {}
  const promise = new Promise<T>((resolve, reject) => { state.resolve = resolve; state.reject = reject })
  return { promise, resolve: (value: T) => state.resolve!(value), reject: (error: Error) => state.reject!(error) }
}

// Deterministic Protocol.Client boundary only: no helper, runtime, or application claims.
export class BoundaryClient implements NativeDockProtocol.Client {
  hello: NativeDockProtocol.Hello = { backend: "linux-atspi", helperEpoch: "helper", sessionID: "session",
    limits: { ...NativeDockProtocol.limits }, operations: ["bind", "read", "action", "type", "key", "unbind", "cancel", "shutdown"] }
  readonly calls: NativeDockProtocol.Call[] = []
  readonly signals: Array<AbortSignal | undefined> = []
  private readonly inflight = new Set<(error: NativeDockProtocol.NativeError) => void>()
  closed = 0
  reply?: (call: NativeDockProtocol.Call, signal?: AbortSignal) => Promise<NativeDockProtocol.JSONValue>

  request(call: NativeDockProtocol.Call, signal?: AbortSignal): Promise<NativeDockProtocol.JSONValue> {
    if (this.closed) return Promise.reject(new NativeDockProtocol.NativeError("client-closed", "Native client is closed"))
    if (signal?.aborted) return Promise.reject(new NativeDockProtocol.NativeError("cancelled", "Native request cancelled before dispatch"))
    this.calls.push(call)
    this.signals.push(signal)
    return new Promise((resolve, reject) => {
      const state = { done: false }
      const finish = (error?: NativeDockProtocol.NativeError, value?: NativeDockProtocol.JSONValue) => {
        if (state.done) return
        state.done = true
        this.inflight.delete(fail)
        signal?.removeEventListener("abort", abort)
        if (error) reject(error)
        if (!error) resolve(value!)
      }
      const fail = (error: NativeDockProtocol.NativeError) => finish(error)
      const abort = () => fail(new NativeDockProtocol.NativeError("cancelled", "Native request cancelled", "unknown"))
      this.inflight.add(fail)
      signal?.addEventListener("abort", abort, { once: true })
      Promise.resolve().then(() => this.reply ? this.reply(call, signal) : this.defaultReply(call)).then(
        (value) => finish(undefined, value), fail,
      )
    })
  }

  defaultReply(call: NativeDockProtocol.Call): NativeDockProtocol.JSONValue {
    if (call.op === "bind" && call.args.phase === "discover") return {
      status: "proposal", proposalID: `proposal-${this.calls.length}`, roots: [{ ...root(), name: "Window", role: 23 }],
    }
    if (call.op === "bind") return { bindingID: `binding-${call.args.proposalID}`, bindingEpoch: "binding-epoch", appID: "app", launchEpoch: "launch" }
    return { backend: "linux-atspi", ok: true }
  }

  async close() {
    if (this.closed) return
    this.closed++
    this.inflight.forEach((fail) => fail(new NativeDockProtocol.NativeError("client-closed", "Native client is closed", "unknown")))
  }
}

export const docks = new Set<NativeDock>()
export async function closeDocks() {
  const closing = [...docks]
  docks.clear()
  const results = await Promise.allSettled(closing.map((dock) => dock.close()))
  const failure = results.find((result) => result.status === "rejected")
  if (failure?.status === "rejected") throw failure.reason
}
export function fixture() {
  const dock = new NativeDock()
  docks.add(dock)
  return { dock, client: new BoundaryClient() }
}
export function workspaceFixture(scopeKinds: NativeDockProtocol.ScopeKind[] | undefined) {
  const f = fixture()
  f.client.hello = { ...f.client.hello, ...(scopeKinds === undefined ? {} : { scopeKinds }) }
  f.client.reply = async (call) => call.op === "bind" && call.args.phase === "confirm"
    ? { bindingID: "workspace-binding", bindingEpoch: "workspace-epoch", appID: "workspace", launchEpoch: "session" }
    : f.client.defaultReply(call)
  return f
}
export const turn = () => new Promise((resolve) => setTimeout(resolve, 0))

// Synthetic wire only. Production NativeDockClient owns framing, correlation, cancellation and reaping.
export class WireChannel implements NativeDockProtocol.Channel {
  private data?: (data: Uint8Array) => void
  private exit?: (exit: NativeDockProtocol.Exit) => void
  readonly requests: NativeDockProtocol.Request[] = []
  readonly reap = Promise.withResolvers<void>()
  readonly terminationStarted = Promise.withResolvers<void>()
  readonly actionStarted = Promise.withResolvers<NativeDockProtocol.Request>()
  holdReap = false
  holdAction = false
  holdDiscovery = false
  holdConfirmation = false
  holdUnbind = false
  terminating = 0
  terminated = false
  scopeKinds?: NativeDockProtocol.ScopeKind[]
  appID = "app"
  launchEpoch = "launch"
  confirmationError?: NativeDockProtocol.NativeError

  onData(listener: (data: Uint8Array) => void) {
    this.data = listener
    queueMicrotask(() => this.send("hello", { backend: "linux-atspi", helperEpoch: "helper", sessionID: "session",
      limits: { ...NativeDockProtocol.limits }, operations: ["bind", "read", "action", "type", "key", "unbind", "cancel", "shutdown"],
      processIdentity: target().processIdentities[0], ...(this.scopeKinds === undefined ? {} : { scopeKinds: this.scopeKinds }) }))
    return () => { this.data = undefined }
  }

  onExit(listener: (exit: NativeDockProtocol.Exit) => void) {
    this.exit = listener
    return () => { this.exit = undefined }
  }

  async write(bytes: Uint8Array) {
    const request: NativeDockProtocol.Request = JSON.parse(new TextDecoder().decode(bytes))
    this.requests.push(request)
    if (request.op === "action") {
      this.actionStarted.resolve(request)
      if (this.holdAction) return
    }
    if (request.op === "bind" && request.args.phase === "discover" && this.holdDiscovery) return
    if (request.op === "bind" && request.args.phase === "confirm" && this.holdConfirmation) return
    if (request.op === "unbind" && this.holdUnbind) return
    if (request.op === "cancel") {
      this.data?.(new TextEncoder().encode(`${JSON.stringify({ v: 1, id: request.args.requestID, ok: false,
        error: { code: "cancelled", message: "Wire cancellation", outcome: "unknown" } })}\n`))
      this.send(request.id, { backend: "linux-atspi", cancelled: true })
      return
    }
    if (request.op === "bind" && request.args.phase === "discover") {
      this.send(request.id, { status: "proposal", proposalID: `proposal-${request.id}`, roots: [{ ...root(), name: "Window", role: 23 }] })
      return
    }
    if (request.op === "bind") {
      if (this.confirmationError) {
        this.data?.(new TextEncoder().encode(`${JSON.stringify({ v: 1, id: request.id, ok: false,
          error: { code: this.confirmationError.code, message: this.confirmationError.message,
            outcome: this.confirmationError.outcome, result: this.confirmationError.result } })}\n`))
        return
      }
      this.send(request.id, { bindingID: `binding-${request.id}`, bindingEpoch: "binding-epoch", appID: this.appID, launchEpoch: this.launchEpoch })
      return
    }
    this.send(request.id, { backend: "linux-atspi", ok: true })
  }

  send(id: string, value: NativeDockProtocol.JSONValue) {
    this.data?.(new TextEncoder().encode(`${JSON.stringify({ v: 1, id, ok: true, value })}\n`))
  }

  async terminate() {
    this.terminating++
    this.terminationStarted.resolve()
    if (this.holdReap) await this.reap.promise
    this.terminated = true
  }
}

export async function wireFixture(config: NativeDockProtocol.ClientConfig = {}, channel = new WireChannel()) {
  const dock = new NativeDock()
  docks.add(dock)
  return { dock, channel, client: await NativeDockClient.create(channel, config) }
}


export function occupancy(dock: NativeDock) {
  const controls = Reflect.get(dock, "controls") as Map<NativeDockProtocol.Client, Set<Promise<void>>>
  return { slots: (Reflect.get(dock, "slots") as Map<string, unknown>).size,
    clients: (Reflect.get(dock, "clients") as Set<NativeDockProtocol.Client>).size,
    retiring: (Reflect.get(dock, "retiring") as Map<NativeDockProtocol.Client, Promise<void>>).size,
    cleanups: (Reflect.get(dock, "cleanups") as Set<Promise<void>>).size,
    controlClients: controls.size, maxControls: Math.max(0, ...[...controls.values()].map((pending) => pending.size)) }
}
