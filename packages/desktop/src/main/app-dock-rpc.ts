import type { BrowserWindow } from "electron"
import type { AppDock, DockBounds } from "./app-dock"
import type { NativeWorkspacePlacement } from "./app-dock-api"
import { AppDockNative } from "./app-dock-native"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import type { SnapshotFormat, SnapshotMode } from "./app-dock-browser"

export type DockRPCReply = (message: unknown) => void

export type WorkspacePreparation = (identity: NativeDockProtocol.Identity, placement: NativeWorkspacePlacement,
  signal: AbortSignal) => Promise<{ target: NativeDockProtocol.Target; client: NativeDockProtocol.Client; confirm: NativeDockProtocol.Confirm }>

type RequestWork = {
  controller: AbortController
  target?: Readonly<AppDockNative.DockIdentity>
  workspace?: Readonly<NativeDockProtocol.Identity>
}

type Preparation = {
  epoch: string
  request: RequestWork
  completion: Promise<void>
  waiters: Set<RequestWork>
  work: Promise<Readonly<AppDockNative.DockIdentity>>
}

type WorkspaceScope = Readonly<{
  identity: Readonly<NativeDockProtocol.Identity>
  placement: NativeWorkspacePlacement
  dock: AppDock
  win: BrowserWindow
}>

type DockRPCRequest = Readonly<{
  type: "dock.rpc"
  id: string
  op: string
  args: Record<string, unknown>
}>

type DockRPCResult =
  | Readonly<{ type: "dock.rpc.result"; id: string; ok: true; value: unknown }>
  | Readonly<{ type: "dock.rpc.result"; id: string; ok: false; error: Readonly<{
    message: string; backend?: "linux-atspi"; code?: string; outcome?: NativeDockProtocol.Outcome; result?: NativeDockProtocol.JSONValue
    cleanup?: NativeDockProtocol.NativeError["cleanup"]
  }> }>

const sendResult = (reply: DockRPCReply, result: DockRPCResult) => reply(result)

const errorResult = (id: string, error: unknown): DockRPCResult =>
  Object.freeze({ type: "dock.rpc.result", id, ok: false, error: Object.freeze(error instanceof NativeDockProtocol.NativeError
    ? { message: error.message, backend: error.backend, code: error.code, outcome: error.outcome,
      ...(error.result === undefined ? {} : { result: error.result }),
      ...(error.cleanup === undefined ? {} : { cleanup: cleanupEvidence(error.cleanup?.code) }) }
    : { message: error instanceof Error ? error.message : String(error) }) })

const isDockRPCRequest = (value: unknown): value is DockRPCRequest => {
  if (!value || typeof value !== "object") return false
  const request = value as Partial<DockRPCRequest>
  if (request.type !== "dock.rpc") return false
  if (typeof request.id !== "string" || request.id.length === 0 || request.id.length > 256) return false
  if (typeof request.op !== "string" || !NativeDockProtocol.object(request.args)) return false
  return true
}

const dockString = (value: unknown, name: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid App Dock ${name}`)
  return value
}

const dockStringArrayArg = (args: Record<string, unknown>, name: string, defaultValue: string[] = []) => {
  const value = args[name]
  if (Array.isArray(value)) return value
  if (typeof value === "string" && value.length > 0) return [value]
  return defaultValue
}

const dockNumber = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid App Dock ${name}`)
  return Math.max(min, Math.min(max, Math.round(value)))
}

const dockEnum = (value: unknown, name: string, allowed: string[]) => {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Invalid App Dock ${name}`)
  return value
}

const dockBoolean = (value: unknown, name: string) => {
  if (typeof value !== "boolean") throw new Error(`Invalid App Dock ${name}`)
  return value
}

const browserReadShape = ["mode", "format", "actionable", "visible"]

const dockRef = (value: unknown, name: string) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid App Dock ${name}`)
  return value
}

export class AppDockRPC {
  private readonly native = new AppDockNative.NativeDock()
  private readonly nativeTargets = new Map<string, Readonly<AppDockNative.DockIdentity>>()
  // Classification belongs to the viewer generation, independent of helper/reset lifetime.
  private readonly workspaceIntents = new WeakMap<AppDock, Map<string, Readonly<{ senderID: number; generation: number }>>>()
  private readonly requests = new Map<string, RequestWork>()
  private readonly preparations = new Map<string, Preparation>()
  private readonly cancelled = new Map<string, ReturnType<typeof setTimeout>>()
  private offRemoval?: () => void
  private appDock: AppDock | undefined
  private dockWindow: BrowserWindow | undefined
  private dockDestroyHooks = new Set<number>()
  private workspacePreparation?: WorkspacePreparation
  private profileResolver: (senderID: number) => { profileID: string; storageKey: string } = (senderID: number) => ({
    profileID: "default",
    storageKey: `dock-bridge-${senderID}-default`,
  })

  setAppDock(instance: AppDock) {
    this.offRemoval?.()
    this.appDock = instance
    this.offRemoval = instance.onTabRemoved?.((identity) => {
      const key = JSON.stringify([identity.senderID, identity.tabID])
      const intents = this.workspaceIntents.get(instance)
      if (intents?.get(key)?.generation === identity.generation) intents.delete(key)
      this.abortTab(identity.senderID, identity.tabID, identity.generation)
      const target = this.nativeTargets.get(key)
      if (target?.generation !== identity.generation) return
      void this.closeNativeTab(identity.senderID, identity.tabID, identity.generation).catch(() => {})
    })
  }

  setWindow(win: BrowserWindow) {
    if (this.dockWindow && !this.dockWindow.isDestroyed()) return
    this.dockWindow = win
    const dock = this.appDock
    const senderID = win.webContents.id
    win.once("closed", () => {
      if (this.dockWindow === win) this.dockWindow = undefined
      ;[dock, this.appDock].forEach((instance) => {
        const intents = instance && this.workspaceIntents.get(instance)
        intents?.forEach((intent, key) => { if (intent.senderID === senderID) intents.delete(key) })
      })
      this.requests.forEach((request) => {
        if ((request.workspace ?? request.target)?.senderID === senderID) request.controller.abort()
      })
      this.nativeTargets.forEach((identity) => {
        if (identity.senderID === senderID) void this.closeNativeTab(senderID, identity.tabID).catch(() => {})
      })
    })
  }

  setProfileResolver(resolver: (senderID: number) => { profileID: string; storageKey: string }) {
    this.profileResolver = resolver
  }

  setWorkspacePreparation(prepare: WorkspacePreparation) {
    this.workspacePreparation = prepare
  }

  reset() {
    this.offRemoval?.()
    this.offRemoval = undefined
    this.nativeTargets.clear()
    this.cancelled.forEach(clearTimeout)
    this.cancelled.clear()
    this.appDock = undefined
    this.dockWindow = undefined
    this.dockDestroyHooks.clear()
    this.workspacePreparation = undefined
    this.profileResolver = (senderID: number) => ({
      profileID: "default",
      storageKey: `dock-bridge-${senderID}-default`,
    })
    // Unsettled requests retain their UUID and capacity until their own finally.
    this.requests.forEach((request) => request.controller.abort())
    return this.native.reset()
  }

  async registerNative(identity: AppDockNative.DockIdentity, target: NativeDockProtocol.Target,
    client: NativeDockProtocol.Client, confirm: NativeDockProtocol.Confirm) {
    return this.bindNative(Object.freeze({ ...identity }), target, client, confirm)
  }

  private async bindNative(captured: Readonly<AppDockNative.DockIdentity>, target: NativeDockProtocol.Target,
    client: NativeDockProtocol.Client, confirm: NativeDockProtocol.Confirm, refresh = false, signal?: AbortSignal) {
    this.requireNativeTab(captured)
    const key = JSON.stringify([captured.senderID, captured.tabID])
    const prior = this.nativeTargets.get(key)
    if (!refresh && prior && this.native.has(prior)) throw new NativeDockProtocol.NativeError("duplicate-bind", "Native tab is already registered")
    if (!prior && this.nativeTargets.size >= 8) throw new NativeDockProtocol.NativeError("capacity", "Native tab registration capacity exhausted")
    this.nativeTargets.set(key, captured)
    const binding = await (refresh ? this.native.rebindWorkspace(captured, target, client, confirm, signal)
      : this.native.bind(captured, target, client, confirm)).catch((error: unknown) => {
      // NativeDock cleans its own pending slot; a rejected preflight still owns the old slot.
      if (refresh && prior && this.nativeTargets.get(key) === captured) this.nativeTargets.set(key, prior)
      throw error
    })
    try {
      this.requireNativeTab(captured)
      if (this.nativeTargets.get(key) !== captured)
        throw new NativeDockProtocol.NativeError("wrong-scope", "Native tab was removed during binding")
      return binding
    } catch (error) {
      if (this.nativeTargets.get(key) === captured)
        await this.native.unbind(captured).catch((cleanup: unknown) => { throw AppDockNative.withCleanup(error, cleanup) })
      // The viewer remains a native tab even when its helper/app is unavailable.
      // A later default read must not silently return the visual viewer's DOM.
      throw error
    }
  }

  private requireNativeTab(identity: AppDockNative.DockIdentity) {
    if (!this.appDock?.list(identity.senderID).some((tab) => tab.tabID === identity.tabID && tab.generation === identity.generation)
        || this.profileResolver(identity.senderID).profileID !== identity.profileID)
      throw new NativeDockProtocol.NativeError("wrong-scope", "Native registration requires a current Dock tab and profile")
  }

  private abortTab(senderID: number, tabID: string, generation?: number, except?: RequestWork) {
    this.requests.forEach((request) => {
      const identity = request.workspace ?? request.target
      if (request !== except && identity?.senderID === senderID && identity.tabID === tabID
          && (generation === undefined || identity.generation === generation)) request.controller.abort()
    })
  }

  private closeNativeTab(senderID: number, tabID: string, generation?: number) {
    this.abortTab(senderID, tabID, generation)
    const key = JSON.stringify([senderID, tabID])
    const target = this.nativeTargets.get(key)
    if (generation !== undefined && target && target.generation !== generation) return Promise.resolve()
    this.nativeTargets.delete(key)
    return this.native.closeTab(senderID, tabID)
  }

  unregisterNative(senderID: number, tabID: string, except?: RequestWork) {
    this.abortTab(senderID, tabID, undefined, except)
    return this.native.closeTab(senderID, tabID)
  }

  private classifyWorkspace(dock: AppDock, senderID: number, tab: Pick<NativeDockProtocol.Identity, "tabID" | "generation">,
    placement: NativeWorkspacePlacement | undefined) {
    const key = JSON.stringify([senderID, tab.tabID])
    const intents = this.workspaceIntents.get(dock)
    if (placement) {
      const current = intents ?? new Map<string, Readonly<{ senderID: number; generation: number }>>()
      current.set(key, Object.freeze({ senderID, generation: tab.generation }))
      this.workspaceIntents.set(dock, current)
      return true
    }
    if (intents?.get(key)?.generation === tab.generation) return true
    intents?.delete(key)
    return false
  }

  private workspaceCurrent(scope: WorkspaceScope) {
    const placement = scope.dock.nativeWorkspace?.(scope.identity.senderID, scope.identity.tabID)
    return this.appDock === scope.dock && this.dockWindow === scope.win && !scope.win.isDestroyed()
      && scope.dock.list(scope.identity.senderID).some((tab) => tab.tabID === scope.identity.tabID && tab.generation === scope.identity.generation)
      && this.profileResolver(scope.identity.senderID).profileID === scope.identity.profileID
      && placement?.runtimeID === scope.placement.runtimeID && placement.runtimeEpoch === scope.placement.runtimeEpoch
      && placement.ready === scope.placement.ready
  }

  private requireWorkspace(scope: WorkspaceScope, request: RequestWork,
    outcome: NativeDockProtocol.Outcome = "not-dispatched", result?: NativeDockProtocol.JSONValue) {
    if (request.controller.signal.aborted)
      throw new NativeDockProtocol.NativeError("cancelled", "Native workspace request cancelled", outcome, result)
    try {
      if (!this.workspaceCurrent(scope))
        throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace changed during request", outcome, result)
    } catch (error) {
      throw requestError(error, result)
    }
  }

  private requirePreparation(scope: WorkspaceScope, request: RequestWork, admission: AppDockNative.ClientAdmission) {
    if (admission.signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native workspace preparation cancelled")
    this.requireWorkspace(scope, request)
  }

  private workspaceTarget(identity: NativeDockProtocol.Identity, placement: NativeWorkspacePlacement) {
    const target = this.nativeTargets.get(JSON.stringify([identity.senderID, identity.tabID]))
    return target?.scopeKind === "workspace" && target.generation === identity.generation && target.profileID === identity.profileID
      && target.runtimeID === placement.runtimeID && target.runtimeEpoch === placement.runtimeEpoch ? target : undefined
  }

  // Preparing a cold helper can take longer than one call's deadline on a loaded machine, and restarting it for
  // every call would never finish. One preparation per tab and workspace epoch therefore outlives a call that only
  // timed out, up to PREPARATION_CAP_MS, and later calls join it. Cancellation keeps its old meaning: when the last
  // waiting call is aborted, the tab closes, the workspace changes or the bridge resets, the preparation is
  // aborted and callers settle after its cleanup or its watchdog, as before.
  private prepareWorkspace(scope: WorkspaceScope, request: RequestWork) {
    const key = JSON.stringify([scope.identity.senderID, scope.identity.tabID])
    const epoch = JSON.stringify([scope.identity.generation, scope.identity.profileID, scope.placement.runtimeID,
      scope.placement.runtimeEpoch])
    const running = this.preparations.get(key)
    // Only a preparation every caller has left (they timed out) is joined; overlapping calls still fence their
    // predecessor and discover again, so a read never answers from an older census than it asked for.
    if (running?.epoch === epoch && running.waiters.size === 0 && !running.request.controller.signal.aborted) {
      this.requireWorkspace(scope, request)
      return waitPreparation(running, request)
    }
    const prior = this.nativeTargets.get(key)
    // Fence old callers before cancellation can settle during the read-only census.
    // This retains the real old binding until validated rebind takes ownership.
    if (prior?.scopeKind === "workspace") this.nativeTargets.set(key, Object.freeze({ ...prior }))
    this.abortTab(scope.identity.senderID, scope.identity.tabID, undefined, request)
    this.requireWorkspace(scope, request)
    const prepare = this.workspacePreparation
    if (!prepare) throw new NativeDockProtocol.NativeError("not-ready", "Native workspace preparation is unavailable")
    const preparation: RequestWork = { controller: new AbortController(), workspace: scope.identity }
    const id = `preparation:${key}`
    this.requests.set(id, preparation)
    const admission = this.native.reserveClient(preparation.controller.signal, { capMs: PREPARATION_CAP_MS })
    const entry = { epoch, request: preparation, completion: admission.completion, waiters: new Set<RequestWork>(),
      work: this.prepareOnce(scope, preparation, prepare, admission) }
    this.preparations.set(key, entry)
    void entry.work.finally(() => {
      if (this.requests.get(id) === preparation) this.requests.delete(id)
      if (this.preparations.get(key) === entry) this.preparations.delete(key)
    }).catch(() => {})
    return waitPreparation(entry, request)
  }

  private prepareOnce(scope: WorkspaceScope, request: RequestWork, prepare: WorkspacePreparation,
    admission: AppDockNative.ClientAdmission) {
    const work = Promise.resolve().then(async () => {
      this.requirePreparation(scope, request, admission)
      const prepared = await prepare(scope.identity, scope.placement, admission.signal)
      admission.adopt(prepared.client)
      const state: { target?: Readonly<AppDockNative.DockIdentity> } = {}
      try {
        this.requirePreparation(scope, request, admission)
        const proof = prepared.target
        if (!NativeDockProtocol.object(proof) || !NativeDockProtocol.object(proof.runtime)
            || proof.scopeKind !== "workspace" || proof.appID !== "workspace" || proof.launchEpoch !== proof.runtime.accessibilitySessionID
            || proof.runtime.runtimeID !== scope.placement.runtimeID || proof.runtime.runtimeEpoch !== scope.placement.runtimeEpoch)
          throw new NativeDockProtocol.NativeError("wrong-scope", "Prepared target does not match captured workspace")
        const captured = Object.freeze({ ...scope.identity, runtimeID: proof.runtime.runtimeID, runtimeEpoch: proof.runtime.runtimeEpoch,
          accessibilitySessionID: proof.runtime.accessibilitySessionID, scopeKind: "workspace" as const,
          appID: proof.appID, launchEpoch: proof.launchEpoch, ownershipRevision: proof.ownershipRevision })
        state.target = captured
        await this.bindNative(captured, proof, prepared.client, async (proposal) => {
          this.requirePreparation(scope, request, admission)
          const roots = await prepared.confirm(proposal)
          this.requirePreparation(scope, request, admission)
          return roots
        }, true, admission.signal)
        this.requirePreparation(scope, request, admission)
        if (this.nativeTargets.get(JSON.stringify([captured.senderID, captured.tabID])) !== captured)
          throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace registration was replaced")
        admission.complete()
        return captured
      } catch (error) {
        const primary = preparationError(error)
        try {
          try {
            if (state.target && this.nativeTargets.get(JSON.stringify([state.target.senderID, state.target.tabID])) === state.target)
              await this.native.unbind(state.target)
          } finally {
            await this.native.releaseUnused(prepared.client)
          }
          admission.complete()
        } catch (cleanup) {
          throw AppDockNative.withCleanup(primary, cleanup)
        }
        throw primary
      }
    }).catch((error: unknown) => {
      admission.fail(error)
      throw preparationError(error)
    })
    return work
  }

  private async dispatchWorkspace(scope: WorkspaceScope, request: RequestWork, op: string, args: Record<string, unknown>, admitted: () => void) {
    if (!scope.placement.ready) throw new NativeDockProtocol.NativeError("not-ready", "Native workspace is not ready")
    const target = op === "read" && args.rootRef === undefined && args.cursor === undefined
      ? await this.prepareWorkspace(scope, request) : this.workspaceTarget(scope.identity, scope.placement)
    try {
      this.requireWorkspace(scope, request)
      if (!target || !this.native.has(target)) throw new NativeDockProtocol.NativeError("not-ready", "Native workspace is not bound")
      request.target = target
      admitted()
      this.requireWorkspace(scope, request)
      if (this.nativeTargets.get(JSON.stringify([target.senderID, target.tabID])) !== target)
        throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace registration was replaced")
      const value = await this.native.dispatch(op, target, args, request.controller.signal)
      this.requireWorkspace(scope, request, "unknown", value)
      return value
    } catch (error) {
      const primary = requestError(error)
      try {
        if (target && this.nativeTargets.get(JSON.stringify([target.senderID, target.tabID])) === target
            && (request.controller.signal.aborted || !this.workspaceCurrent(scope))) await this.native.unbind(target)
      } catch (cleanup) {
        throw new NativeDockProtocol.NativeError(primary.code, primary.message, primary.outcome, primary.result,
          cleanupEvidence(cleanup instanceof NativeDockProtocol.NativeError ? cleanup.code : undefined))
      }
      throw primary
    }
  }

  private dockSender(): { senderID: number; win: BrowserWindow } {
    const win = this.dockWindow
    if (!win || win.isDestroyed()) throw new Error("No window is available for App Dock")
    return { senderID: win.webContents.id, win }
  }

  handleDockRPC(message: unknown, reply: DockRPCReply): boolean {
    if (NativeDockProtocol.object(message) && message.type === "dock.rpc.cancel" && typeof message.id === "string"
        && message.id.length > 0 && message.id.length <= 256) {
      const request = this.requests.get(message.id)
      if (request) request.controller.abort()
      if (!request && this.cancelled.size < 32 && !this.cancelled.has(message.id)) {
        const id = message.id
        this.cancelled.set(id, setTimeout(() => this.cancelled.delete(id), 15000))
      }
      return true
    }
    if (!isDockRPCRequest(message)) return false
    const { id, op, args } = message
    if (this.requests.has(id) || this.requests.size >= 32) {
      sendResult(reply, errorResult(id, new NativeDockProtocol.NativeError("busy", "Dock request ID/capacity unavailable")))
      return true
    }
    const request: RequestWork = { controller: new AbortController() }
    if (this.cancelled.has(id)) {
      clearTimeout(this.cancelled.get(id))
      this.cancelled.delete(id)
      request.controller.abort()
    }
    this.requests.set(id, request)
    const promise = this.dispatch(op, args, request, () => reply(Object.freeze({ type: "dock.rpc.native-admitted",
      id, backend: "linux-atspi", target: request.target })), () => reply(Object.freeze({ type: "dock.rpc.native-pending",
      id, backend: "linux-atspi", scopeKind: "workspace" })))
      .then((value) => sendResult(reply, Object.freeze({ type: "dock.rpc.result", id, ok: true, value })))
      .catch((error) => sendResult(reply, errorResult(id, error)))
      .finally(() => {
        if (this.requests.get(id) === request) this.requests.delete(id)
      })
    promise.catch(() => {})
    return true
  }

  private async dispatch(op: string, args: Record<string, unknown>, request: RequestWork,
    admitted: () => void, pending: () => void): Promise<unknown> {
    if (!this.appDock) throw new Error("App Dock bridge is not initialized")
    const dock = this.appDock
    const { senderID, win } = this.dockSender()

    const targetOps = ["activate", "read", "click", "type", "navigate", "go", "close", "scroll", "hover", "drag",
      "clickAt", "scrollTo", "storage", "evaluate", "network", "wait", "screenshot", "keyboard", "action", "pointer"]
    const world = args.world === undefined ? undefined : dockEnum(args.world, "world", ["browser", "linux"]) as "browser" | "linux"
    if (targetOps.includes(op) && !(op === "close" && args.tabID === undefined && dock.list(senderID).length === 0)) {
      const tabID = op === "activate" ? dockString(args.tabID, "tabID") : this.resolveTabID(dock, senderID, args, world)
      const placement = dock.nativeWorkspace?.(senderID, tabID)
      const tab = dock.list(senderID).find((tab) => tab.tabID === tabID)
      if (placement && !tab) throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace viewer is not current")
      const workspace = tab && this.classifyWorkspace(dock, senderID, tab, placement)
      if (world === "browser" && workspace)
        throw new NativeDockProtocol.NativeError("wrong-scope", "dock_* tools operate browser tabs; apps in the Linux workspace are operated by the linux agent")
      if (world === "linux" && !workspace)
        throw new NativeDockProtocol.NativeError("wrong-scope", "Linux workspace tools only address the Linux workspace")
      const stored = this.nativeTargets.get(JSON.stringify([senderID, tabID]))
      const target = stored?.generation === tab?.generation ? stored : undefined
      // Browser snapshot shape has no AT-SPI equivalent; never drop it silently.
      if ((workspace || target) && op === "read" && browserReadShape.some((key) => args[key] !== undefined))
        throw new NativeDockProtocol.NativeError("unsupported-operation", "mode, format, actionable and visible apply to browser pages only; omit them when reading the Linux workspace")
      if (workspace && tab) {
        request.workspace = Object.freeze({ senderID, tabID, generation: tab.generation, profileID: this.profileResolver(senderID).profileID })
        pending()
        if (request.controller.signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native workspace request cancelled")
        if (!placement && !["close", "activate"].includes(op))
          throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace authority is unavailable")
        if (placement) {
          const scope: WorkspaceScope = { identity: request.workspace, placement: Object.freeze({ runtimeID: placement.runtimeID,
            runtimeEpoch: placement.runtimeEpoch, ready: placement.ready }), dock, win }
          this.requireWorkspace(scope, request)
          if (!["close", "activate"].includes(op)) return this.dispatchWorkspace(scope, request, op, { ...args, tabID }, admitted)
        }
      }
      if (target && !workspace) {
        request.target = target
        admitted()
        this.requireNativeTab(target)
        if (request.controller.signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native request cancelled before dispatch")
        if (!["close", "activate"].includes(op)) {
          if (target.scopeKind === "workspace")
            throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace authority is unavailable")
          if (!this.native.has(target)) throw new NativeDockProtocol.NativeError("not-ready", "Native tab is not bound")
          return this.native.dispatch(op, target, args, request.controller.signal)
        }
      }
      if (!target && !workspace && nativeIntent(op, args))
        throw new NativeDockProtocol.NativeError("wrong-scope", "Native selectors require a registered native tab")
      if (!target && !workspace && op === "read" && ["rootRef", "cursor", "textOffset"].some((key) => args[key] !== undefined))
        throw new NativeDockProtocol.NativeError("unsupported-operation", "Native read selectors cannot address a browser")
      // Preserve the target captured at admission, including browser/default-active requests.
      args = { ...args, tabID }
    }

    switch (op) {
      case "list": {
        const tabs = dock.list(senderID).map((tab) => {
          const placement = dock.nativeWorkspace?.(senderID, tab.tabID)
          if (this.classifyWorkspace(dock, senderID, tab, placement)) {
            const target = placement && this.workspaceTarget({ senderID, tabID: tab.tabID, generation: tab.generation,
              profileID: this.profileResolver(senderID).profileID }, placement)
            return { ...tab, ...(target && placement?.ready ? this.native.metadata(target)
              : { backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "unbound" }) }
          }
          const identity = this.nativeTargets.get(JSON.stringify([senderID, tab.tabID]))
          if (identity?.generation !== tab.generation) return tab
          if (identity?.scopeKind === "workspace")
            return { ...tab, backend: "linux-atspi", scopeKind: "workspace", nativeReadiness: "unbound" }
          return identity ? { ...tab, ...this.native.metadata(identity) } : tab
        })
        // A scoped caller lists only its own world: the browser side never sees the Linux workspace tab.
        if (world === undefined) return tabs
        return tabs.filter((tab) => ("scopeKind" in tab && tab.scopeKind === "workspace") === (world === "linux"))
      }
      case "activate": {
        const tabID = dockString(args.tabID, "tabID")
        dock.activate(senderID, win, tabID)
        return dock.list(senderID)
      }
      case "read": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const budget = args.budget === undefined ? 100 : dockNumber(args.budget, "budget", 1, 500)
        const maxText = args.maxText === undefined ? 1500 : dockNumber(args.maxText, "maxText", 0, 20000)
        if (browserReadShape.every((key) => args[key] === undefined))
          return dock.read(senderID, tabID, budget, maxText)
        return dock.read(senderID, tabID, budget, maxText, {
          ...(args.mode === undefined ? {} : { mode: dockEnum(args.mode, "read mode", ["full", "a11y", "skeleton"]) as SnapshotMode }),
          ...(args.format === undefined ? {} : { format: dockEnum(args.format, "read format", ["json", "tree", "csv"]) as SnapshotFormat }),
          ...(args.actionable === undefined ? {} : { actionable: dockBoolean(args.actionable, "read actionable") }),
          ...(args.visible === undefined ? {} : { visible: dockBoolean(args.visible, "read visible") }),
        })
      }
      case "click": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const ref = dockRef(args.ref, "element ref")
        return dock.click(senderID, tabID, ref)
      }
      case "type": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const ref = dockRef(args.ref, "element ref")
        const text = dockString(args.text, "text")
        return dock.type(senderID, tabID, ref, text)
      }
      case "navigate": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const address = dockString(args.address, "address")
        return dock.navigate(senderID, tabID, address)
      }
      case "go": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const command = dockString(args.command, "command")
        if (command !== "back" && command !== "forward" && command !== "reload")
          throw new Error("Invalid App Dock command")
        return dock.command(senderID, tabID, command)
      }
      case "open": {
        const address = dockString(args.address, "address")
        const profile = this.profileResolver(senderID)
        const tab = await dock.open(
          senderID,
          win,
          address,
          dockBounds(win, args.bounds),
          (event) => {
            if (!win.isDestroyed()) win.webContents.send("app-dock-event", event)
          },
          { storageKey: profile.storageKey },
        )
        if (!this.dockDestroyHooks.has(senderID)) {
          this.dockDestroyHooks.add(senderID)
          win.webContents.once("destroyed", () => {
            this.dockDestroyHooks.delete(senderID)
            this.appDock?.closeAll(senderID, win)
          })
        }
        win.webContents.send("app-dock-event", { type: "tab-opened", payload: tab })
        return tab
      }
      case "close": {
        const tabID = args.tabID === undefined ? undefined : dockString(args.tabID, "tabID")
        // Viewer removal emits synchronously; join the teardown we started first.
        const closing = tabID ? this.closeNativeTab(senderID, tabID, request.workspace?.generation ?? request.target?.generation) : undefined
        try {
          dock.close(senderID, win, tabID)
        } finally {
          await closing
        }
        return dock.list(senderID)
      }
      case "scroll": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const direction = dockString(args.direction, "direction")
        if (direction !== "up" && direction !== "down" && direction !== "top" && direction !== "bottom")
          throw new Error("Invalid App Dock direction")
        const amount = args.amount === undefined ? undefined : dockNumber(args.amount, "amount", 1, 10000)
        if (amount !== undefined && (direction === "top" || direction === "bottom"))
          throw new Error("Invalid App Dock amount for scroll to edge")
        return dock.scroll(senderID, tabID, direction, amount)
      }
      case "hover": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const ref = dockRef(args.ref, "element ref")
        return dock.hover(senderID, tabID, ref)
      }
      case "drag": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const fromRef = dockRef(args.fromRef, "from ref")
        const toRef = dockRef(args.toRef, "to ref")
        return dock.drag(senderID, tabID, fromRef, toRef)
      }
      case "clickAt": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const x = dockNumber(args.x, "x", 0, 10000)
        const y = dockNumber(args.y, "y", 0, 10000)
        return dock.clickAt(senderID, tabID, x, y)
      }
      case "scrollTo": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const x = dockNumber(args.x, "x", 0, 10000)
        const y = dockNumber(args.y, "y", 0, 10000)
        return dock.scrollTo(senderID, tabID, x, y)
      }
      case "storage": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const storage = dockString(args.storage, "storage")
        if (storage !== "local" && storage !== "session") throw new Error("Invalid App Dock storage")
        const key = dockString(args.key, "key")
        return dock.storage(senderID, tabID, storage, key)
      }
      case "evaluate": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const script = dockString(args.script, "script")
        return dock.evaluate(senderID, tabID, script)
      }
      case "network": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const blockUrls = dockStringArrayArg(args, "blockUrls")
        const allowedOrigins = dockStringArrayArg(args, "allowedOrigins")
        const blockMethods = dockStringArrayArg(args, "blockMethods")
        const probeUrl = args.probeUrl === undefined ? undefined : dockString(args.probeUrl, "probeUrl")
        const probeMethod = args.probeMethod === undefined ? undefined : dockString(args.probeMethod, "probeMethod")
        const config = { blockUrls, allowedOrigins, blockMethods, probeUrl, probeMethod }
        return dock.network(senderID, tabID, config)
      }
      case "wait": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const milliseconds = args.milliseconds === undefined ? 100 : args.milliseconds
        if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 10_000)
          throw new Error("Invalid App Dock milliseconds")
        return dock.wait(senderID, tabID, milliseconds)
      }
      case "screenshot": {
        const tabID = this.resolveTabID(dock, senderID, args)
        return dock.screenshot(senderID, tabID)
      }
      case "keyboard": {
        const tabID = this.resolveTabID(dock, senderID, args)
        const type = dockString(args.type, "type")
        if (type !== "keyDown" && type !== "keyUp") throw new Error("Invalid App Dock keyboard type")
        const key = dockString(args.key, "key")
        return dock.keyboard(senderID, tabID, type, key)
      }
      default:
        throw new Error(`Unknown App Dock operation: ${op}`)
    }
  }

  private resolveTabID(dock: AppDock, senderID: number, args: Record<string, unknown>, world?: "browser" | "linux") {
    if (args.tabID !== undefined) return dockString(args.tabID, "tabID")
    // A scoped caller addresses its own world whether or not that tab is the one shown.
    const all = dock.list(senderID)
    const linux = (tab: (typeof all)[number]) => dock.nativeWorkspace?.(senderID, tab.tabID) !== undefined
    if (world === "linux") {
      const workspace = all.find(linux)
      if (!workspace) throw new NativeDockProtocol.NativeError("not-ready",
        "The Linux workspace is not open in the App Dock; report back that the user must open Apps > Linux workspace")
      return workspace.tabID
    }
    const tabs = world === "browser" ? all.filter((tab) => !linux(tab)) : all
    const active = tabs.find((tab) => typeof tab === "object" && tab !== null && "active" in tab && tab.active === true)
    const target = active ?? tabs[0]
    if (!target && world === "browser" && all.length)
      throw new Error("App Dock has no open browser tabs; apps in the Linux workspace are operated by the linux agent")
    if (!target) throw new Error("App Dock has no open tabs")
    return target.tabID
  }
}

function dockBounds(win: BrowserWindow, value: unknown): DockBounds {
  if (value === undefined) {
    const bounds = win.getContentBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }
  if (!value || typeof value !== "object") throw new Error("Invalid App Dock bounds")
  const bounds = value as Partial<{ x: number; y: number; width: number; height: number }>
  const x = bounds.x ?? NaN
  const y = bounds.y ?? NaN
  const width = bounds.width ?? NaN
  const height = bounds.height ?? NaN
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Invalid App Dock bounds")
  return { x, y, width, height }
}

const rpc = new AppDockRPC()

export function registerAppDockBridge(instance: AppDock) {
  rpc.setAppDock(instance)
}

export function registerAppDockWindow(win: BrowserWindow) {
  rpc.setWindow(win)
}

export function registerAppDockProfileResolver(resolver: () => { profileID: string; storageKey: string }) {
  rpc.setProfileResolver(resolver)
}

export function registerAppDockWorkspacePreparation(prepare: WorkspacePreparation) {
  rpc.setWorkspacePreparation(prepare)
}

export function resetAppDockRPC() {
  return rpc.reset()
}

export function registerAppDockNativeBinding(identity: AppDockNative.DockIdentity, target: NativeDockProtocol.Target,
  client: NativeDockProtocol.Client, confirm: NativeDockProtocol.Confirm) {
  return rpc.registerNative(identity, target, client, confirm)
}

export function unregisterAppDockNativeBinding(senderID: number, tabID: string) {
  return rpc.unregisterNative(senderID, tabID)
}

export function handleDockRPC(message: unknown, reply: DockRPCReply): boolean {
  return rpc.handleDockRPC(message, reply)
}

function nativeIntent(op: string, args: Record<string, unknown>) {
  return op === "action" || [args.ref, args.fromRef, args.toRef, args.rootRef].some((ref) => typeof ref === "string")
    || args.cursor !== undefined || args.textOffset !== undefined || (op !== "read" && args.mode !== undefined)
}

function preparationError(error: unknown) {
  return error instanceof NativeDockProtocol.NativeError ? error
    : new NativeDockProtocol.NativeError("not-ready", "Native workspace preparation failed")
}

function requestError(error: unknown, result?: NativeDockProtocol.JSONValue) {
  return error instanceof NativeDockProtocol.NativeError ? error
    : new NativeDockProtocol.NativeError("transport-error", "Native workspace request failed", "unknown", result)
}

function cleanupEvidence(code: unknown) {
  return Object.freeze({ code: typeof code === "string" && code.length > 0 && code.length <= 256 && !/[^A-Za-z0-9_-]/.test(code)
    ? code : "native-cleanup-failed", outcome: "unknown" as const })
}

const PREPARATION_CAP_MS = 60_000

// A call waits for a shared preparation up to its own deadline and then leaves it running. The last waiting call
// to be aborted cancels it and, like a lone call before, settles after its cleanup or its watchdog.
function waitPreparation(entry: Preparation, request: RequestWork) {
  const settled = Promise.withResolvers<Readonly<AppDockNative.DockIdentity>>()
  entry.waiters.add(request)
  const leave = () => {
    clearTimeout(timer)
    request.controller.signal.removeEventListener("abort", abort)
    entry.waiters.delete(request)
  }
  const timer = setTimeout(() => {
    leave()
    settled.reject(new NativeDockProtocol.NativeError("native-preparation-timeout",
      "The Linux workspace is still starting its accessibility helper; try again in a few seconds", "unknown"))
  }, NativeDockProtocol.limits.timeoutMs)
  function abort() {
    leave()
    if (entry.waiters.size > 0)
      return settled.reject(new NativeDockProtocol.NativeError("cancelled", "Native workspace request cancelled"))
    entry.request.controller.abort()
    settled.resolve(Promise.race([entry.work,
      entry.completion.then(() => entry.work, (error: unknown) => { throw preparationError(error) })]))
  }
  request.controller.signal.addEventListener("abort", abort, { once: true })
  if (request.controller.signal.aborted) abort()
  entry.work.then((value) => { leave(); settled.resolve(value) }, (error: unknown) => { leave(); settled.reject(error) })
  return settled.promise
}
