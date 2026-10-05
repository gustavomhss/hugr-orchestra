import { NativeDockProtocol } from "./app-dock-native-protocol"

export type DockIdentity = NativeDockProtocol.Identity & NativeDockProtocol.RuntimeIdentity &
  Pick<NativeDockProtocol.Target, "scopeKind" | "appID" | "launchEpoch" | "ownershipRevision">

type Slot = {
  identity: Readonly<DockIdentity>
  target: NativeDockProtocol.Target
  client: NativeDockProtocol.Client
  helperEpoch: string
  controller: AbortController
  work: Set<AbortController>
  binding?: Readonly<NativeDockProtocol.Binding>
  cleanup?: Promise<void>
  before?: Promise<void>
}

type Reset = {
  pending: Set<Promise<void>>
  completion: PromiseWithResolvers<void>
  failure?: { error: unknown }
}

export type ClientAdmission = Readonly<{
  signal: AbortSignal
  completion: Promise<void>
  adopt(client: NativeDockProtocol.Client): void
  complete(): void
  fail(error: unknown): void
}>

type Reservation = {
  controller: AbortController
  completion: PromiseWithResolvers<void>
  client?: NativeDockProtocol.Client
  finished: boolean
  timer?: ReturnType<typeof setTimeout>
  watchdog?: ReturnType<typeof setTimeout>
}

const scopeFields = [
  "senderID", "tabID", "generation", "profileID", "runtimeID", "runtimeEpoch",
  "accessibilitySessionID", "appID", "launchEpoch", "ownershipRevision", "scopeKind",
] as const

export class NativeDock {
  private readonly slots = new Map<string, Slot>()
  private readonly bindingWork = new Set<Slot>()
  private readonly clients = new Set<NativeDockProtocol.Client>()
  private readonly retiring = new Map<NativeDockProtocol.Client, Promise<void>>()
  private readonly controls = new Map<NativeDockProtocol.Client, Set<Promise<void>>>()
  private readonly cleanups = new Set<Promise<void>>()
  private readonly reservations = new Set<Reservation>()
  private resetting?: Reset
  private closing?: Promise<void>

  // With capMs the preparation may outlive one call: its watchdog still settles completion (and so reset and
  // aborting callers) at limits.timeoutMs, but it aborts the work only at capMs. A late client still enters the
  // same bounded cleanup either way.
  reserveClient(signal?: AbortSignal, options: { capMs?: number } = {}): ClientAdmission {
    if (this.closing) throw new NativeDockProtocol.NativeError("closed", "Native dock is closed")
    if (signal?.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native preparation cancelled before acquisition")
    if (this.clientOccupancy() >= NativeDockProtocol.limits.pending || this.reservations.size >= NativeDockProtocol.limits.pending)
      throw new NativeDockProtocol.NativeError("capacity", "Native client cleanup capacity exhausted")
    const reservation: Reservation = { controller: new AbortController(), completion: Promise.withResolvers<void>(), finished: false }
    const deadline = performance.now() + (options.capMs ?? NativeDockProtocol.limits.timeoutMs)
    const abort = () => reservation.controller.abort()
    const detach = () => {
      clearTimeout(reservation.timer)
      clearTimeout(reservation.watchdog)
      reservation.timer = undefined
      signal?.removeEventListener("abort", abort)
    }
    const fail = (error: unknown) => {
      if (reservation.finished) return
      detach()
      // An adopted client's failed reap is retained in clients/retiring. Before
      // adoption, only explicit no-dispatch evidence can release uncertainty.
      if (reservation.client || (error instanceof NativeDockProtocol.NativeError && error.outcome === "not-dispatched" && error.cleanup === undefined)) {
        reservation.finished = true
        this.reservations.delete(reservation)
      }
      reservation.completion.reject(error)
      abort()
    }
    const timeout = () => {
      detach()
      reservation.completion.reject(new NativeDockProtocol.NativeError("native-preparation-timeout", "Native preparation deadline expired", "unknown"))
      abort()
    }
    const expired = () => {
      if (reservation.timer !== undefined && performance.now() >= deadline) timeout()
    }
    reservation.timer = setTimeout(timeout, options.capMs ?? NativeDockProtocol.limits.timeoutMs)
    if (options.capMs !== undefined)
      reservation.watchdog = setTimeout(() => reservation.completion.reject(new NativeDockProtocol.NativeError(
        "native-preparation-timeout", "Native preparation deadline expired", "unknown")), NativeDockProtocol.limits.timeoutMs)
    this.reservations.add(reservation)
    reservation.completion.promise.catch(() => {})
    signal?.addEventListener("abort", abort, { once: true })
    return Object.freeze({
      get signal() { expired(); return reservation.controller.signal },
      completion: reservation.completion.promise,
      adopt: (client: NativeDockProtocol.Client) => {
        expired()
        if (reservation.finished || (reservation.client && reservation.client !== client))
          throw new NativeDockProtocol.NativeError("wrong-scope", "Native client reservation is no longer available")
        if (!NativeDockProtocol.object(client) || typeof client.request !== "function" || typeof client.close !== "function")
          throw new NativeDockProtocol.NativeError("ownership-unresolved", "Invalid prepared native client", "unknown")
        // The reserved unit becomes client occupancy atomically, even after a
        // timeout: late resources still enter the same bounded cleanup owner.
        reservation.client = client
        this.clients.add(client)
      },
      complete: () => {
        if (reservation.finished) return
        if (!reservation.client) throw new NativeDockProtocol.NativeError("ownership-unresolved", "Native reservation has no adopted client")
        detach()
        reservation.finished = true
        this.reservations.delete(reservation)
        reservation.completion.resolve()
      },
      fail,
    })
  }

  releaseUnused(client: NativeDockProtocol.Client): Promise<void> {
    // Adoption belongs to reserveClient/bind; already retired clients need no ledger.
    return this.retireUnused(client)
  }

  private clientOccupancy() {
    return this.clients.size + [...this.reservations].filter((reservation) => !reservation.client).length
  }

  bind(identity: DockIdentity, target: NativeDockProtocol.Target, client: NativeDockProtocol.Client, confirm: NativeDockProtocol.Confirm) {
    return this.bindTarget(identity, target, client, confirm, false)
  }

  rebindWorkspace(identity: DockIdentity, target: NativeDockProtocol.Target, client: NativeDockProtocol.Client,
    confirm: NativeDockProtocol.Confirm, signal?: AbortSignal) {
    return this.bindTarget(identity, target, client, confirm, true, signal)
  }

  private async bindTarget(identity: DockIdentity, target: NativeDockProtocol.Target, client: NativeDockProtocol.Client,
    confirm: NativeDockProtocol.Confirm, replace: boolean, signal?: AbortSignal) {
    if (this.closing) throw new NativeDockProtocol.NativeError("closed", "Native dock is closed")
    const captured = captureIdentity(identity)
    const existing = this.slots.get(key(captured))
    if (existing && !replace) {
      this.requireScope(existing, captured)
      throw new NativeDockProtocol.NativeError("duplicate-bind", "Native tab already has a registration")
    }
    if (replace && (captured.scopeKind !== "workspace" || (existing && existing.identity.scopeKind !== "workspace")))
      throw new NativeDockProtocol.NativeError("wrong-scope", "Workspace rebind requires workspace registrations")
    if (this.retiring.has(client)) throw new NativeDockProtocol.NativeError("client-retiring", "Native client is retiring")
    if ((!existing && this.slots.size >= 8) || this.bindingWork.size >= NativeDockProtocol.limits.pending)
      throw new NativeDockProtocol.NativeError("capacity", "Native binding capacity exhausted")
    if (!this.clients.has(client) && this.clientOccupancy() >= NativeDockProtocol.limits.pending)
      throw new NativeDockProtocol.NativeError("capacity", "Native client cleanup capacity exhausted")
    if (typeof confirm !== "function") throw new NativeDockProtocol.NativeError("ownership-unresolved", "Runtime root confirmation is required")
    const proof = captureTarget(target, captured)
    if (!NativeDockProtocol.object(client) || typeof client.request !== "function" || typeof client.close !== "function")
      throw new NativeDockProtocol.NativeError("protocol-error", "Invalid native client")
    const hello = NativeDockProtocol.hello(client.hello)
    if (!word(hello.helperEpoch) || hello.sessionID !== captured.accessibilitySessionID)
      throw new NativeDockProtocol.NativeError("wrong-scope", "Native helper belongs to another accessibility session")
    if (captured.scopeKind === "workspace" && !hello.scopeKinds?.includes("workspace"))
      throw new NativeDockProtocol.NativeError("unsupported-scope", "Native helper does not support workspace scope")
    if (signal?.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native registration cancelled before dispatch")
    const before = existing ? Promise.withResolvers<void>() : undefined
    const slot: Slot = {
      identity: captured, target: proof, client, helperEpoch: hello.helperEpoch,
      controller: new AbortController(), work: new Set(), before: before?.promise,
    }
    // Ownership transfers before old abort handlers or release can observe an unused client.
    this.slots.set(key(captured), slot)
    this.clients.add(client)
    this.bindingWork.add(slot)
    const abort = () => slot.controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
    try {
      if (existing && before) {
        this.remove(existing)
        this.release(existing).then(before.resolve, before.reject)
        await before.promise
        slot.before = undefined
      }
      if (slot.controller.signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native registration cancelled before discovery")
      this.requireCurrent(slot)
      const proposal = requireProposal(await client.request({ op: "bind", args: {
        phase: "discover", identity: dockIdentity(captured), target: proof,
      } }, slot.controller.signal))
      this.requireCurrent(slot)
      // A proposal is evidence to confirm, never permission inferred from a title or PID.
      const roots = requireRoots(await cancellable(
        () => confirm(structuredClone(proposal)), slot.controller.signal, "not-dispatched", 10000,
      ), proposal, proof)
      this.requireCurrent(slot)
      const reply = await client.request({ op: "bind", args: {
        phase: "confirm", proposalID: proposal.proposalID, roots, ownershipRevision: proof.ownershipRevision,
      } }, slot.controller.signal)
      const binding = await Promise.resolve().then(() => requireBinding(reply)).catch(async (error) => {
        if (NativeDockProtocol.object(reply) && word(reply.bindingID) && word(reply.bindingEpoch))
          await this.release({ ...slot, binding: { bindingID: reply.bindingID, bindingEpoch: reply.bindingEpoch,
            appID: proof.appID, launchEpoch: proof.launchEpoch } }).catch((cleanup: unknown) => { throw withCleanup(error, cleanup) })
        throw error
      })
      if (this.slots.get(key(captured)) !== slot || slot.controller.signal.aborted
          || binding.appID !== proof.appID || binding.launchEpoch !== proof.launchEpoch
          || client.hello.helperEpoch !== slot.helperEpoch || client.hello.sessionID !== captured.accessibilitySessionID) {
        const error = new NativeDockProtocol.NativeError("wrong-scope", "Native registration changed during confirmation")
        await this.release({ ...slot, binding }).catch((cleanup: unknown) => { throw withCleanup(error, cleanup) })
        throw error
      }
      slot.binding = Object.freeze(binding)
      return slot.binding
    } catch (error) {
      if (this.slots.get(key(captured)) === slot) this.remove(slot)
      const results = await Promise.allSettled([...new Set([client, ...(existing ? [existing.client] : [])])]
        .map((owned) => this.retireUnused(owned)))
      const failure = results.find((result) => result.status === "rejected")
      if (failure?.status === "rejected") throw withCleanup(error, failure.reason)
      throw error
    } finally {
      signal?.removeEventListener("abort", abort)
      this.bindingWork.delete(slot)
    }
  }

  has(identity: DockIdentity): boolean {
    const slot = this.slots.get(key(identity))
    if (!slot) return false
    this.requireScope(slot, identity)
    return true
  }

  async unbind(identity: DockIdentity): Promise<void> {
    const slot = this.slots.get(key(identity))
    if (!slot) return
    this.requireScope(slot, identity)
    this.remove(slot)
    await this.release(slot)
  }

  async closeTab(senderID: number, tabID: string): Promise<void> {
    const slot = this.slots.get(key({ senderID, tabID }))
    if (!slot) return
    this.remove(slot)
    await this.release(slot)
  }

  async dispatch(op: string, identity: DockIdentity, args: Record<string, unknown>, signal?: AbortSignal): Promise<NativeDockProtocol.JSONValue> {
    const slot = this.slots.get(key(identity))
    if (!slot) throw new NativeDockProtocol.NativeError("ownership-unresolved", "Native tab has no registration")
    this.requireScope(slot, identity)
    const binding = slot.binding
    if (!binding) throw new NativeDockProtocol.NativeError("ownership-unresolved", "Native roots have not been confirmed")
    const call = operation(op, args)
    if (slot.work.size >= NativeDockProtocol.limits.pending)
      throw new NativeDockProtocol.NativeError("capacity", "Native request capacity exhausted")
    const controller = new AbortController()
    const dispatched = { value: false }
    const abort = () => controller.abort()
    slot.work.add(controller)
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) controller.abort()
    try {
      const value = call.op === "wait"
        ? await cancellable(() => new Promise<NativeDockProtocol.JSONValue>((resolve) => {
          const timer = setTimeout(() => resolve({ backend: "linux-atspi", milliseconds: call.milliseconds,
            readiness: "delay-only", postcondition: "unverified" }), call.milliseconds)
          controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true })
        }), controller.signal, "not-dispatched")
        : await Promise.resolve().then(() => {
          if (controller.signal.aborted)
            throw new NativeDockProtocol.NativeError("cancelled", "Native operation cancelled; no automatic retry")
          this.requireCurrent(slot)
          dispatched.value = true
          // The client owns cancellation and terminal evidence; a facade abort must not race away an ACK.
          return slot.client.request({ ...call, bindingID: binding.bindingID,
            bindingEpoch: binding.bindingEpoch }, controller.signal)
        }).then((value) => {
          const result = boundedResult(value)
          if (result === undefined)
            throw new NativeDockProtocol.NativeError("protocol-error", "Invalid native operation result", "unknown")
          return result
        })
      this.requireCurrent(slot, dispatched.value ? "unknown" : "not-dispatched", dispatched.value ? value : undefined)
      return value
    } finally {
      slot.work.delete(controller)
      signal?.removeEventListener("abort", abort)
      controller.abort()
    }
  }

  metadata(identity: DockIdentity) {
    const kind = scopeKind(identity.scopeKind)
    const slot = this.slots.get(key(identity))
    if (!slot) return { backend: "linux-atspi" as const, scopeKind: kind, nativeReadiness: "unbound" as const }
    this.requireScope(slot, identity)
    return { backend: "linux-atspi" as const, scopeKind: kind, nativeReadiness: slot.binding ? "bound" as const : "binding" as const,
      helperEpoch: slot.helperEpoch, sessionID: slot.identity.accessibilitySessionID }
  }

  reset(): Promise<void> {
    return this.closing ?? this.releaseAll()
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    const completion = Promise.withResolvers<void>()
    this.closing = completion.promise
    this.releaseAll().then(completion.resolve, completion.reject)
    return this.closing
  }

  private releaseAll(): Promise<void> {
    const reset: Reset = this.resetting ?? { pending: new Set(), completion: Promise.withResolvers<void>() }
    this.resetting = reset
    const finish = () => {
      if (reset.pending.size) return
      if (this.resetting === reset) this.resetting = undefined
      if (reset.failure) {
        reset.completion.reject(reset.failure.error)
        return
      }
      reset.completion.resolve()
    }
    const slots = [...this.slots.values()]
    const reservations = [...this.reservations]
    // Reserve all retirements before cancellation can reenter registration.
    slots.forEach((slot) => this.slots.delete(key(slot.identity)))
    const work = [...slots.map((slot) => this.release(slot)),
      ...[...this.clients].map((client) => this.retireUnused(client)), ...this.cleanups,
      ...[...this.controls.values()].flatMap((controls) => [...controls]), ...reservations.map((reservation) => reservation.completion.promise)]
    work.forEach((promise) => {
      if (reset.pending.has(promise)) return
      reset.pending.add(promise)
      const settled = () => {
        reset.pending.delete(promise)
        finish()
      }
      void promise.then(settled, (error: unknown) => {
        reset.failure ??= { error }
        settled()
      })
    })
    // Repeated resets join one bounded pending set, including prior unbinds.
    // Fresh slots admitted after this snapshot are not part of this removal.
    slots.forEach((slot) => this.remove(slot))
    reservations.forEach((reservation) => reservation.controller.abort())
    finish()
    return reset.completion.promise
  }

  private requireScope(slot: Slot, identity: DockIdentity, outcome: NativeDockProtocol.Outcome = "not-dispatched", result?: NativeDockProtocol.JSONValue) {
    if (!scopeFields.every((field) => slot.identity[field] === (field === "scopeKind" ? scopeKind(identity.scopeKind) : identity[field]))
        || slot.client.hello.helperEpoch !== slot.helperEpoch
        || slot.client.hello.sessionID !== slot.identity.accessibilitySessionID)
      throw new NativeDockProtocol.NativeError("wrong-scope", "Native registration belongs to another scope", outcome, boundedResult(result))
  }

  private requireCurrent(slot: Slot, outcome: NativeDockProtocol.Outcome = "not-dispatched", result?: NativeDockProtocol.JSONValue) {
    if (this.slots.get(key(slot.identity)) !== slot || slot.controller.signal.aborted)
      throw new NativeDockProtocol.NativeError("wrong-scope", "Native registration is no longer current", outcome, boundedResult(result))
    this.requireScope(slot, slot.identity, outcome, result)
  }

  private remove(slot: Slot) {
    if (this.slots.get(key(slot.identity)) === slot) this.slots.delete(key(slot.identity))
    slot.controller.abort()
    slot.work.forEach((controller) => controller.abort())
  }

  private release(slot: Slot): Promise<void> {
    const binding = slot.binding
    if (!binding) {
      const retirement = this.retireUnused(slot.client)
      if (!slot.before) return retirement
      // Replacing a pending replacement must also join its predecessor's teardown.
      return Promise.allSettled([slot.before, retirement]).then((results) => {
        const failure = results.find((result) => result.status === "rejected")
        if (failure?.status === "rejected") throw failure.reason
      })
    }
    if (slot.cleanup) return slot.cleanup
    const controls = this.controls.get(slot.client) ?? new Set<Promise<void>>()
    const control = controls.size >= NativeDockProtocol.limits.pending
      ? Promise.reject<void>(new NativeDockProtocol.NativeError("capacity", "Native cleanup control capacity exhausted"))
      : Promise.resolve().then(() => slot.client.request({ op: "unbind", args: {},
        bindingID: binding.bindingID, bindingEpoch: binding.bindingEpoch })).then(() => {})
    if (controls.size < NativeDockProtocol.limits.pending) {
      controls.add(control)
      this.controls.set(slot.client, controls)
      const remove = () => {
        controls.delete(control)
        if (!controls.size && this.controls.get(slot.client) === controls) this.controls.delete(slot.client)
      }
      void control.then(remove, remove)
    }
    slot.cleanup = control.finally(() => this.retireUnused(slot.client))
    // Reserve retirement before the guest control settles so a removed client cannot be reused.
    void this.retireUnused(slot.client)
    return slot.cleanup
  }

  private retireUnused(client: NativeDockProtocol.Client): Promise<void> {
    const existing = this.retiring.get(client)
    if (existing) return existing
    if ([...this.slots.values()].some((slot) => slot.client === client) || !this.clients.has(client)) return Promise.resolve()
    const retirement = Promise.resolve().then(async () => {
      await Promise.allSettled([...(this.controls.get(client) ?? [])])
      await client.close()
      // Failed reaping keeps bounded occupancy and its error; it is not evidence of termination.
      this.clients.delete(client)
      this.retiring.delete(client)
    })
    this.retiring.set(client, retirement)
    this.cleanups.add(retirement)
    const remove = () => this.cleanups.delete(retirement)
    void retirement.then(remove, remove)
    return retirement
  }
}

export function withCleanup(error: unknown, cleanup: unknown) {
  if (!(error instanceof NativeDockProtocol.NativeError)) return cleanup
  const code = error.cleanup?.code ?? (cleanup instanceof NativeDockProtocol.NativeError ? cleanup.code : undefined)
  return new NativeDockProtocol.NativeError(error.code, error.message, error.outcome, error.result,
    Object.freeze({ code: typeof code === "string" && code.length > 0 && code.length <= 256 && !/[^A-Za-z0-9_-]/.test(code)
      ? code : "native-cleanup-failed", outcome: "unknown" as const }))
}

function key(identity: Pick<NativeDockProtocol.Identity, "senderID" | "tabID">) {
  return JSON.stringify([identity.senderID, identity.tabID])
}

function word(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
}

function captureIdentity(identity: DockIdentity): Readonly<DockIdentity> {
  if (!NativeDockProtocol.object(identity) || !integer(identity.senderID, 1) || !integer(identity.generation, 0)
      || !integer(identity.ownershipRevision, 0)
      || !scopeFields.filter((field) => !["senderID", "generation", "ownershipRevision", "scopeKind"].includes(field)).every((field) => word(identity[field])))
    throw new NativeDockProtocol.NativeError("wrong-scope", "Invalid native dock identity")
  return Object.freeze({ senderID: identity.senderID, tabID: identity.tabID, generation: identity.generation,
    profileID: identity.profileID, runtimeID: identity.runtimeID, runtimeEpoch: identity.runtimeEpoch,
    accessibilitySessionID: identity.accessibilitySessionID, appID: identity.appID,
    launchEpoch: identity.launchEpoch, ownershipRevision: identity.ownershipRevision, scopeKind: scopeKind(identity.scopeKind) })
}

function scopeKind(value: unknown): NativeDockProtocol.ScopeKind {
  if (value === undefined) return "application"
  if (value === "application" || value === "workspace") return value
  throw new NativeDockProtocol.NativeError("wrong-scope", "Invalid native scope kind")
}

function dockIdentity(identity: DockIdentity): NativeDockProtocol.Identity {
  return Object.freeze({ senderID: identity.senderID, tabID: identity.tabID, generation: identity.generation, profileID: identity.profileID })
}

function handle(value: unknown): value is NativeDockProtocol.Handle {
  return NativeDockProtocol.object(value) && word(value.owner) && /^:\d+\.\d+$/.test(value.owner)
    && word(value.path) && /^\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+$/.test(value.path)
    && !["/org/a11y/atspi/accessible/root", "/org/a11y/atspi/null"].includes(value.path)
}

function sameHandle(left: NativeDockProtocol.Handle, right: NativeDockProtocol.Handle) {
  return left.owner === right.owner && left.path === right.path
}

function captureTarget(target: NativeDockProtocol.Target, identity: DockIdentity): NativeDockProtocol.Target {
  if (!NativeDockProtocol.object(target) || !NativeDockProtocol.object(target.runtime)
      || target.runtime.runtimeID !== identity.runtimeID || target.runtime.runtimeEpoch !== identity.runtimeEpoch
      || target.runtime.accessibilitySessionID !== identity.accessibilitySessionID
      || target.appID !== identity.appID || target.launchEpoch !== identity.launchEpoch || target.ownershipRevision !== identity.ownershipRevision)
    throw new NativeDockProtocol.NativeError("wrong-scope", "Runtime ownership proof belongs to another scope")
  const kind = scopeKind(target.scopeKind)
  if (kind !== scopeKind(identity.scopeKind))
    throw new NativeDockProtocol.NativeError("wrong-scope", "Native target scope kind does not match Dock identity")
  if (!Array.isArray(target.processIdentities) || target.processIdentities.length < 1 || target.processIdentities.length > 128
      || !target.processIdentities.every((process) => NativeDockProtocol.object(process)
        && integer(process.pid, 1) && integer(process.startTicks, 1) && word(process.bootID)
        && word(process.pidNamespace) && word(process.mountNamespace))
      || new Set(target.processIdentities.map((process) => process.pid)).size !== target.processIdentities.length
      || (target.roots !== undefined && (!Array.isArray(target.roots) || target.roots.length < 1 || target.roots.length > 32
        || !target.roots.every(handle))))
    throw new NativeDockProtocol.NativeError("ownership-unresolved", "Complete runtime process and root evidence is required")
  if (kind === "workspace") {
    // The runtime supplies workspace authority; this only checks realm consistency.
    const realm = target.processIdentities[0]!
    if (target.appID !== "workspace" || target.launchEpoch !== target.runtime.accessibilitySessionID
        || !target.processIdentities.every((process) => process.bootID === realm.bootID
          && process.pidNamespace === realm.pidNamespace && process.mountNamespace === realm.mountNamespace))
      throw new NativeDockProtocol.NativeError("wrong-scope", "Workspace ownership proof belongs to another realm")
  }
  const proof = { scopeKind: kind, runtime: Object.freeze({ runtimeID: target.runtime.runtimeID, runtimeEpoch: target.runtime.runtimeEpoch,
    accessibilitySessionID: target.runtime.accessibilitySessionID }), appID: target.appID, launchEpoch: target.launchEpoch,
    ownershipRevision: target.ownershipRevision, processIdentities: target.processIdentities.map((process) => Object.freeze({
      pid: process.pid, startTicks: process.startTicks, bootID: process.bootID,
      pidNamespace: process.pidNamespace, mountNamespace: process.mountNamespace,
    })),
    ...(target.roots === undefined ? {} : { roots: target.roots.map((root) => Object.freeze({ owner: root.owner, path: root.path })) }) }
  Object.freeze(proof.processIdentities)
  if (proof.roots) Object.freeze(proof.roots)
  return Object.freeze(proof)
}

function requireProposal(value: NativeDockProtocol.JSONValue): NativeDockProtocol.Proposal {
  const roots = NativeDockProtocol.object(value) ? value.roots : undefined
  if (!NativeDockProtocol.object(value) || value.status !== "proposal" || !word(value.proposalID)
      || !Array.isArray(roots) || roots.length < 1 || roots.length > 32
      || !roots.every((root): root is NativeDockProtocol.Proposal["roots"][number] => NativeDockProtocol.object(root)
        && typeof root.name === "string" && root.name.length <= 256 && integer(root.role, 0)
        && [16, 23, 69].includes(root.role) && handle(root))
      || roots.some((root, index) => roots.slice(0, index).some((prior) => sameHandle(prior, root))))
    throw new NativeDockProtocol.NativeError("protocol-error", "Invalid native root proposal")
  return { status: "proposal", proposalID: value.proposalID, roots: roots.map((root) => ({
    owner: root.owner, path: root.path, name: root.name, role: root.role,
  })) }
}

function requireRoots(value: NativeDockProtocol.Handle[], proposal: NativeDockProtocol.Proposal, target: NativeDockProtocol.Target) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32 || !value.every(handle)
      || value.some((root, index) => value.slice(0, index).some((prior) => sameHandle(prior, root))))
    throw new NativeDockProtocol.NativeError("ownership-unresolved", "Runtime must confirm nonempty concrete roots")
  if (!value.every((root) => proposal.roots.some((proposed) => sameHandle(root, proposed)))
      || (target.roots && !value.every((root) => target.roots!.some((expected) => sameHandle(root, expected)))))
    throw new NativeDockProtocol.NativeError("wrong-scope", "Runtime confirmed roots outside the proposed owned target")
  return Object.freeze(value.map((root) => Object.freeze({ owner: root.owner, path: root.path }))) as NativeDockProtocol.Handle[]
}

function requireBinding(value: NativeDockProtocol.JSONValue): NativeDockProtocol.Binding {
  if (!NativeDockProtocol.object(value) || !word(value.bindingID) || !word(value.bindingEpoch) || !word(value.appID) || !word(value.launchEpoch))
    throw new NativeDockProtocol.NativeError("protocol-error", "Invalid native binding reply")
  return { bindingID: value.bindingID, bindingEpoch: value.bindingEpoch, appID: value.appID, launchEpoch: value.launchEpoch }
}

function operation(op: string, args: Record<string, unknown>): NativeDockProtocol.Call | { op: "wait"; milliseconds: number } {
  if (!NativeDockProtocol.object(args)) throw new NativeDockProtocol.NativeError("invalid-argument", "Native arguments must be an object")
  if (op === "wait") {
    const milliseconds = args.milliseconds === undefined ? 100 : args.milliseconds
    if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 10000)
      throw new NativeDockProtocol.NativeError("invalid-argument", "Invalid native wait duration")
    return { op, milliseconds }
  }
  if (op === "read") {
    if ((args.budget !== undefined && !integer(args.budget, 1, 500)) || (args.maxText !== undefined && !integer(args.maxText, 0, 20000))
        || (args.rootRef !== undefined && !NativeDockProtocol.isNativeRef(args.rootRef))
        || (args.cursor !== undefined && !word(args.cursor)) || (args.textOffset !== undefined && !integer(args.textOffset, 0)))
      throw new NativeDockProtocol.NativeError("invalid-argument", "Invalid native read query")
    return { op, args: Object.fromEntries(["budget", "maxText", "rootRef", "cursor", "textOffset"]
      .filter((field) => args[field] !== undefined).map((field) => [field, args[field]])) as NativeDockProtocol.JSONObject }
  }
  if (!["click", "action", "type", "keyboard"].includes(op))
    throw new NativeDockProtocol.NativeError("unsupported-operation", `Native dock does not support ${op}`)
  if (!NativeDockProtocol.isNativeRef(args.ref))
    throw new NativeDockProtocol.NativeError("wrong-scope", "Native operations require an opaque native ref")
  // A native key combination goes to the owned window holding ref; the helper parses and refuses unsafe ones.
  if (op === "keyboard") {
    if (typeof args.keys !== "string" || args.keys.length < 1 || args.keys.length > 64)
      throw new NativeDockProtocol.NativeError("invalid-argument", "Native keyboard requires keys such as ctrl+comma")
    return { op: "key", args: { ref: args.ref, keys: args.keys } }
  }
  if (op !== "type") {
    if (op === "action" && !word(args.actionID))
      throw new NativeDockProtocol.NativeError("invalid-argument", "Native action requires an actionID")
    if (op === "action" && args.mode !== undefined && args.mode !== "stable" && args.mode !== "observed")
      throw new NativeDockProtocol.NativeError("invalid-argument", "Invalid native action identity mode")
    return { op: "action", args: { ref: args.ref, ...(op === "action" ? { actionID: args.actionID as string,
      ...(args.mode === undefined ? {} : { mode: args.mode as string }) } : {}) } }
  }
  if (typeof args.text !== "string" || args.text.length > 20000 || (args.mode !== undefined && args.mode !== "editable" && args.mode !== "keyboard"))
    throw new NativeDockProtocol.NativeError("invalid-argument", "Invalid native text or input mode")
  return { op: "type", args: { ref: args.ref, text: args.text, mode: args.mode ?? "editable" } }
}

function boundedResult(value: unknown): NativeDockProtocol.JSONValue | undefined {
  if (!NativeDockProtocol.json(value)) return
  if (Buffer.byteLength(JSON.stringify(value)) > NativeDockProtocol.limits.frameBytes) return
  return structuredClone(value)
}

function cancellable<T>(run: () => Promise<T>, signal: AbortSignal, outcome: NativeDockProtocol.Outcome, timeoutMs?: number): Promise<T> {
  if (signal.aborted) return Promise.reject(new NativeDockProtocol.NativeError("cancelled", "Native operation cancelled; no automatic retry"))
  return new Promise((resolve, reject) => {
    const cancelled = () => new NativeDockProtocol.NativeError("cancelled", "Native operation cancelled; no automatic retry", outcome)
    const abort = () => settle(() => reject(cancelled()))
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => settle(() => reject(
      new NativeDockProtocol.NativeError("timeout", "Runtime root confirmation expired"),
    )), timeoutMs)
    const settle = (finish: () => void) => {
      signal.removeEventListener("abort", abort)
      clearTimeout(timer)
      finish()
    }
    signal.addEventListener("abort", abort, { once: true })
    Promise.resolve().then(() => {
      if (signal.aborted) throw cancelled()
      return run()
    }).then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    )
  })
}

export * as AppDockNative from "./app-dock-native"
