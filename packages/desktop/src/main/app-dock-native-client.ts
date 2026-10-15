import { NativeDockProtocol } from "./app-dock-native-protocol"

type Work = {
  call: NativeDockProtocol.Call
  deadline: number
  promise: Promise<NativeDockProtocol.JSONValue>
  resolve: (value: NativeDockProtocol.JSONValue) => void
  reject: (error: NativeDockProtocol.NativeError) => void
  done: boolean
  id?: string
  timer?: ReturnType<typeof setTimeout>
  grace?: ReturnType<typeof setTimeout>
  off?: () => void
  target?: Work
}

export class NativeDockClient implements NativeDockProtocol.Client {
  private greeting?: NativeDockProtocol.Hello
  private startupMs: number = NativeDockProtocol.limits.startupMs
  private timeoutMs: number = NativeDockProtocol.limits.timeoutMs
  private graceMs: number = NativeDockProtocol.limits.cancelGraceMs
  private reapMs: number = NativeDockProtocol.limits.cancelGraceMs
  private startup?: ReturnType<typeof setTimeout>
  private startupDeadline = 0
  private readonly started = Promise.withResolvers<void>()
  private readonly off: Array<() => void> = []
  private frame = new Uint8Array(NativeDockProtocol.limits.frameBytes - 1)
  private used = 0
  private sequence = 0
  private readonly bindings = new Map<string, string>()
  private readonly queue: Work[] = []
  private readonly controls: Work[] = []
  private readonly pending = new Map<string, Work>()
  private active?: Work
  private writing = false
  private closing = false
  private failure?: NativeDockProtocol.NativeError
  private teardown?: Promise<void>
  private shutdown?: Promise<NativeDockProtocol.JSONValue>
  private closed?: Promise<void>

  private constructor(
    private readonly channel: NativeDockProtocol.Channel,
    private readonly config: NativeDockProtocol.ClientConfig,
  ) {}

  get hello(): NativeDockProtocol.Hello {
    if (!this.greeting) throw new NativeDockProtocol.NativeError("protocol-error", "Native helper has not started")
    return this.greeting
  }

  static async create(channel: NativeDockProtocol.Channel, config: NativeDockProtocol.ClientConfig = {}) {
    const client = new NativeDockClient(channel, { ...config })
    client.started.promise.catch(() => {})
    try {
      client.start()
      await client.started.promise
      if (client.failure) throw client.failure
      if (performance.now() >= client.startupDeadline)
        throw new NativeDockProtocol.NativeError("startup-timeout", "Native helper startup deadline expired")
      return client
    } catch (error) {
      const failure = nativeError(error)
      await client.retire(failure)
      throw failure
    }
  }

  private start() {
    this.startupMs = duration(this.config.startupMs, this.startupMs)
    this.timeoutMs = duration(this.config.timeoutMs, this.timeoutMs)
    this.graceMs = duration(this.config.cancelGraceMs, this.graceMs)
    this.reapMs = duration(this.config.reapMs, this.graceMs, 60_000)
    this.startupDeadline = performance.now() + this.startupMs
    this.startup = setTimeout(() => this.fail(new NativeDockProtocol.NativeError(
      "startup-timeout", "Native helper startup deadline expired",
    )), this.startupMs)
    const data = this.channel.onData((chunk) => this.read(chunk))
    if (this.failure) data()
    if (!this.failure) this.off.push(data)
    if (this.failure) return
    const exit = this.channel.onExit((event) => this.fail(new NativeDockProtocol.NativeError(
      event.reason ?? "helper-exited", "Native helper exited",
    )))
    if (this.failure) exit()
    if (!this.failure) this.off.push(exit)
  }

  request(call: NativeDockProtocol.Call, signal?: AbortSignal): Promise<NativeDockProtocol.JSONValue> {
    const admitted = performance.now()
    try {
      if (this.failure || this.closing) throw new NativeDockProtocol.NativeError(
        this.failure?.code ?? "client-closed", this.failure?.message ?? "Native client is closed",
      )
      if (signal?.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native request cancelled before dispatch")
      if (!NativeDockProtocol.object(call.args) || !NativeDockProtocol.json(call.args))
        throw new NativeDockProtocol.NativeError("invalid-request", "Invalid native request arguments")
      const args = JSON.stringify(call.args)
      if (new TextEncoder().encode(args).byteLength > NativeDockProtocol.limits.frameBytes - 1)
        throw new NativeDockProtocol.NativeError("invalid-request", "Native arguments exceed byte limit")
      const snapshot = {
        op: call.op, bindingID: call.bindingID, bindingEpoch: call.bindingEpoch,
        timeoutMs: call.timeoutMs, args: JSON.parse(args) as NativeDockProtocol.JSONObject,
      }
      this.scope(snapshot)
      const control = isControl(snapshot.op)
      const count = control
        ? this.controls.length + [...this.pending.values()].filter((work) => isControl(work.call.op)).length
        : this.queue.length + Number(!!this.active)
      if (count >= NativeDockProtocol.limits.pending)
        throw new NativeDockProtocol.NativeError("pending-limit", "Native request capacity exhausted")
      const result = this.enqueue(snapshot, duration(snapshot.timeoutMs, this.timeoutMs,
        snapshot.op === "cancel" || snapshot.op === "shutdown" ? this.graceMs : NativeDockProtocol.limits.timeoutMs,
      ), signal, undefined, admitted)
      if (snapshot.op !== "shutdown") return result
      this.shutdown = result
      this.closing = true
      this.queue.slice().forEach((work) => this.cancel(work, "client-closed"))
      if (this.active) this.settle(this.active, new NativeDockProtocol.NativeError(
        "client-closed", "Native client is closing", "unknown",
      ))
      return result
    } catch (error) {
      return Promise.reject(nativeError(error, "invalid-request"))
    }
  }

  private scope(call: NativeDockProtocol.Call) {
    if (!["bind", "read", "action", "type", "key", "pointer", "unbind", "cancel", "shutdown"].includes(call.op))
      throw new NativeDockProtocol.NativeError("unsupported-operation", "Unsupported native operation")
    if (["read", "action", "type", "key", "pointer", "unbind"].includes(call.op)) {
      if (!call.bindingID || !call.bindingEpoch || this.bindings.get(call.bindingID) !== call.bindingEpoch)
        throw new NativeDockProtocol.NativeError("stale-binding", "Native binding is not current")
      return
    }
    if (call.bindingID !== undefined || call.bindingEpoch !== undefined)
      throw new NativeDockProtocol.NativeError("wrong-scope", "Operation does not accept a native binding")
    if (call.op === "bind" && call.args.phase !== "discover" && call.args.phase !== "confirm")
      throw new NativeDockProtocol.NativeError("invalid-request", "Invalid native bind phase")
    if (call.op === "cancel" && (!this.active?.id || call.args.requestID !== this.active.id))
      throw new NativeDockProtocol.NativeError("wrong-scope", "Cancel must identify the active native request")
  }

  private enqueue(
    call: NativeDockProtocol.Call, timeoutMs: number, signal?: AbortSignal, target?: Work, admitted = performance.now(),
  ) {
    const deferred = Promise.withResolvers<NativeDockProtocol.JSONValue>()
    const work: Work = { call, deadline: admitted + timeoutMs, ...deferred, done: false, target }
    const lane = isControl(call.op) ? this.controls : this.queue
    lane.push(work)
    work.timer = setTimeout(() => this.cancel(work, "timeout"), Math.max(0, work.deadline - performance.now()))
    if (signal) {
      const abort = () => this.cancel(work, "cancelled")
      work.off = () => signal.removeEventListener("abort", abort)
      signal.addEventListener("abort", abort, { once: true })
      if (signal.aborted) abort()
    }
    this.pump()
    return work.promise
  }

  private pump() {
    if (this.writing || this.failure || !this.greeting) return
    const work = this.controls.shift() ?? (!this.active ? this.queue.shift() : undefined)
    if (!work) return
    if (work.done || (work.target && this.active !== work.target)) {
      this.settle(work, new NativeDockProtocol.NativeError("cancelled", "Original native request already terminated"))
      this.pump()
      return
    }
    try {
      this.scope(work.call)
      const remaining = Math.ceil(work.deadline - performance.now())
      if (remaining <= 0) {
        this.cancel(work, "timeout")
        this.pump()
        return
      }
      if (!Number.isSafeInteger(this.sequence + 1))
        throw new NativeDockProtocol.NativeError("protocol-error", "Native request sequence exhausted")
      const sequence = this.sequence + 1
      const id = `${this.hello.helperEpoch}:${sequence}`
      const bytes = new TextEncoder().encode(NativeDockProtocol.encode({
        ...work.call, v: 1, id, sequence, helperEpoch: this.hello.helperEpoch, timeoutMs: remaining,
      }))
      this.sequence = sequence
      work.id = id
      this.pending.set(id, work)
      if (!isControl(work.call.op)) this.active = work
      if (work.call.op === "unbind") this.bindings.delete(work.call.bindingID!)
      if (work.call.op === "cancel" && this.active) this.armGrace(this.active)
      // Install correlation and reserve the semantic slot before a synchronous write callback.
      this.writing = true
      Promise.resolve(this.channel.write(bytes)).then(() => {
        this.writing = false
        this.pump()
      }, () => this.fail(new NativeDockProtocol.NativeError("helper-exited", "Native channel write failed")))
    } catch (error) {
      if (work.id) {
        this.fail(nativeError(error, "helper-exited"))
        return
      }
      // Only the frozen encoder's local size boundary is a caller error, not a helper fault.
      const failure = error instanceof NativeDockProtocol.NativeError && error.code === "protocol-error"
        && error.message === "Native request exceeds byte limit"
        ? new NativeDockProtocol.NativeError("invalid-request", error.message)
        : nativeError(error, "invalid-request")
      this.settle(work, failure)
      if (failure.code === "protocol-error") this.fail(failure)
      this.pump()
    }
  }

  private cancel(work: Work, code: string) {
    if (work.done) return
    this.settle(work, new NativeDockProtocol.NativeError(
      code, code === "timeout" ? "Native request deadline expired" : "Native request cancelled or closed",
      work.id ? "unknown" : "not-dispatched",
    ))
    if (!work.id) {
      const lane = isControl(work.call.op) ? this.controls : this.queue
      const index = lane.indexOf(work)
      if (index !== -1) lane.splice(index, 1)
      if (work.call.op === "shutdown") this.fail(new NativeDockProtocol.NativeError(code, "Native shutdown was not dispatched"))
      return
    }
    if (isControl(work.call.op)) {
      this.fail(new NativeDockProtocol.NativeError(code, "Native control did not terminate"))
      return
    }
    this.armGrace(work)
    if (this.controls.length + [...this.pending.values()].filter((item) => isControl(item.call.op)).length >= NativeDockProtocol.limits.pending) {
      this.fail(new NativeDockProtocol.NativeError("pending-limit", "Native cancellation lane exhausted"))
      return
    }
    this.enqueue({ op: "cancel", args: { requestID: work.id } }, this.graceMs, undefined, work).catch(() => {})
  }

  private armGrace(work: Work) {
    if (work.grace) return
    work.grace = setTimeout(() => this.fail(new NativeDockProtocol.NativeError(
      "helper-unresponsive", "Native request did not terminate after cancellation",
    )), this.graceMs)
  }

  private settle(work: Work, error?: NativeDockProtocol.NativeError, value: NativeDockProtocol.JSONValue = null) {
    if (work.done) return
    work.done = true
    clearTimeout(work.timer)
    work.off?.()
    work.off = undefined
    if (error) work.reject(error)
    if (!error) work.resolve(value)
  }

  private read(chunk: Uint8Array) {
    if (this.failure) return
    try {
      for (let offset = 0; offset < chunk.length;) {
        const newline = chunk.indexOf(10, offset)
        const end = newline === -1 ? chunk.length : newline
        // Reserve the LF byte even while an unterminated payload is being accumulated.
        if (this.used + end - offset > NativeDockProtocol.limits.frameBytes - 1)
          throw new NativeDockProtocol.NativeError("protocol-error", "Native frame exceeds byte limit")
        this.frame.set(chunk.subarray(offset, end), this.used)
        this.used += end - offset
        if (newline === -1) return
        const line = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(this.frame.subarray(0, this.used))
        this.used = 0
        this.reply(NativeDockProtocol.decode(line))
        if (this.failure) return
        offset = newline + 1
      }
    } catch (error) {
      this.fail(nativeError(error))
    }
  }

  private reply(reply: NativeDockProtocol.Reply) {
    if (!this.greeting) {
      if (performance.now() >= this.startupDeadline)
        throw new NativeDockProtocol.NativeError("startup-timeout", "Native helper startup deadline expired")
      if (reply.id !== "hello" || !reply.ok) throw new NativeDockProtocol.NativeError("protocol-error", "Expected initial native hello")
      const greeting = NativeDockProtocol.hello(reply.value)
      if (greeting.helperEpoch.length > 239 || (this.config.sessionID !== undefined && greeting.sessionID !== this.config.sessionID))
        throw new NativeDockProtocol.NativeError("protocol-error", "Native helper identity mismatch")
      Object.freeze(greeting.limits)
      Object.freeze(greeting.operations)
      this.greeting = Object.freeze(greeting)
      clearTimeout(this.startup)
      this.started.resolve()
      return
    }
    const work = this.pending.get(reply.id)
    if (!work) throw new NativeDockProtocol.NativeError("protocol-error", "Unexpected or replayed native reply")
    // A terminal can beat a delayed timer callback, but cannot extend the admitted deadline.
    if (!work.done && performance.now() >= work.deadline)
      this.settle(work, new NativeDockProtocol.NativeError("timeout", "Native request deadline expired", "unknown"))
    if (reply.ok && work.call.op === "bind" && work.call.args.phase === "confirm") {
      const value = reply.value
      if (!NativeDockProtocol.object(value) || !["bindingID", "bindingEpoch", "appID", "launchEpoch"].every((key) =>
        typeof value[key] === "string" && value[key].length > 0 && value[key].length <= 256,
      ))
        throw new NativeDockProtocol.NativeError("protocol-error", "Invalid native binding reply")
      if (work.done) {
        // The guest may have installed a binding the cancelled caller never saw.
        // Retiring the helper releases it without replaying any app operation.
        this.fail(new NativeDockProtocol.NativeError("cancelled", "Native confirmation completed after cancellation; helper retired", "unknown"))
        return
      }
      if (!work.done && !this.bindings.has(value.bindingID as string) && this.bindings.size >= 8)
        throw new NativeDockProtocol.NativeError("protocol-error", "Native helper exceeded binding capacity")
      if (!work.done) this.bindings.set(value.bindingID as string, value.bindingEpoch as string)
    }
    this.pending.delete(reply.id)
    clearTimeout(work.grace)
    if (this.active === work) {
      this.active = undefined
      this.controls.filter((control) => control.target === work).forEach((control) => this.cancel(control, "cancelled"))
    }
    this.settle(work, reply.ok ? undefined : new NativeDockProtocol.NativeError(
      reply.error.code, reply.error.message, reply.error.outcome, reply.error.result,
    ), reply.ok ? reply.value : null)
    if (!reply.ok && reply.error.code === "protocol-error")
      this.fail(new NativeDockProtocol.NativeError(reply.error.code, reply.error.message))
    if (work.call.op === "shutdown") this.fail(new NativeDockProtocol.NativeError("client-closed", "Native helper shut down"))
    this.pump()
  }

  private fail(error: NativeDockProtocol.NativeError) {
    this.retire(error).catch(() => {})
  }

  private retire(error: NativeDockProtocol.NativeError) {
    if (this.teardown) return this.teardown
    const deferred = Promise.withResolvers<void>()
    this.teardown = deferred.promise
    this.teardown.catch(() => {})
    this.failure = error
    this.closing = true
    clearTimeout(this.startup)
    this.started.reject(error)
    this.off.splice(0).forEach((off) => { try { off() } catch {} })
    const work = new Set([...this.queue, ...this.controls, ...this.pending.values()])
    work.forEach((item) => {
      clearTimeout(item.grace)
      this.settle(item, new NativeDockProtocol.NativeError(
        error.code, error.message, item.id ? "unknown" : "not-dispatched", error.result,
      ))
    })
    this.queue.length = 0
    this.controls.length = 0
    this.pending.clear()
    this.bindings.clear()
    // Keep only bounded occupancy state until terminate confirms reaping.
    if (this.active) this.active.call = { op: this.active.call.op, args: {} }
    this.frame = new Uint8Array(0)
    this.used = 0
    const watchdog = setTimeout(() => deferred.reject(new NativeDockProtocol.NativeError(
      "helper-termination-timeout", "Native helper reaping deadline expired", "unknown",
    )), this.reapMs)
    try {
      Promise.resolve(this.channel.terminate()).then(() => {
        clearTimeout(watchdog)
        this.active = undefined
        deferred.resolve()
      }, () => {
        clearTimeout(watchdog)
        deferred.reject(new NativeDockProtocol.NativeError("helper-termination-failed", "Native helper could not be reaped", "unknown"))
      })
    } catch {
      clearTimeout(watchdog)
      deferred.reject(new NativeDockProtocol.NativeError("helper-termination-failed", "Native helper could not be reaped", "unknown"))
    }
    return this.teardown
  }

  close(): Promise<void> {
    if (this.closed) return this.closed
    const deferred = Promise.withResolvers<void>()
    this.closed = deferred.promise
    const close = async () => {
      if (!this.failure)
        await (this.shutdown ?? this.request({ op: "shutdown", args: {}, timeoutMs: this.graceMs })).catch(() => {})
      await this.retire(new NativeDockProtocol.NativeError("client-closed", "Native client is closed"))
    }
    close().then(deferred.resolve, deferred.reject)
    return this.closed
  }
}

function isControl(op: NativeDockProtocol.Operation) {
  return op === "cancel" || op === "unbind" || op === "shutdown"
}

function duration(value: number | undefined, fallback: number, maximum = fallback) {
  if (value === undefined) return Math.min(fallback, maximum)
  if (!Number.isSafeInteger(value) || value < 1)
    throw new NativeDockProtocol.NativeError("invalid-request", "Native deadline must be a positive safe integer")
  return Math.min(value, maximum)
}

function nativeError(error: unknown, code = "protocol-error") {
  return error instanceof NativeDockProtocol.NativeError ? error : new NativeDockProtocol.NativeError(code, "Native channel or frame failed")
}
