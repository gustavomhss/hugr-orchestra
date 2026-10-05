export * as AppDockNativeChannel from "./app-dock-native-channel"

import { Socket } from "node:net"
import { NativeDockProtocol } from "./app-dock-native-protocol"

export type Options = {
  endpoint: string
  containerID: string
  start: () => Promise<void>
  stop: () => Promise<NativeDockProtocol.Exit>
}

type Write = {
  bytes: Buffer
  deadline: number
  sent: boolean
  timer: ReturnType<typeof setTimeout>
  resolve: () => void
  reject: (error: NativeDockProtocol.NativeError) => void
}

export function create(options: Options): NativeDockProtocol.Channel {
  const captured = { ...options }
  const data = new Set<{ listener: (bytes: Uint8Array) => void }>()
  const exits = new Set<{ listener: (exit: NativeDockProtocol.Exit) => void }>()
  const writes: Write[] = []
  const deadline = performance.now() + NativeDockProtocol.limits.startupMs
  const state = {
    socket: undefined as Socket | undefined,
    header: Buffer.alloc(16384),
    used: 0,
    stderr: Buffer.alloc(65536),
    stderrOffset: 0,
    selector: 0,
    remaining: 0,
    attached: false,
    ready: false,
    reading: false,
    reread: false,
    ended: false,
    queuedBytes: 0,
    writing: false,
    offDrain: undefined as (() => void) | undefined,
    starting: undefined as Promise<void> | undefined,
    stopping: undefined as Promise<void> | undefined,
    failure: undefined as NativeDockProtocol.NativeError | undefined,
    exit: undefined as NativeDockProtocol.Exit | undefined,
  }
  const startup = setTimeout(() => fail(new NativeDockProtocol.NativeError(
    "startup-timeout", "Native attach/start deadline expired",
  )), NativeDockProtocol.limits.startupMs)

  function fail(error: NativeDockProtocol.NativeError) {
    state.failure ??= error
    terminate().catch(() => {})
  }

  function terminate(): Promise<void> {
    if (state.stopping) return state.stopping
    const stopped = Promise.withResolvers<void>()
    state.stopping = stopped.promise
    state.stopping.catch(() => {})
    state.failure ??= new NativeDockProtocol.NativeError("client-closed", "Native channel is closed")
    clearTimeout(startup)
    state.offDrain?.()
    state.offDrain = undefined
    state.socket?.destroy()
    data.clear()
    state.header = Buffer.alloc(0)
    state.stderr = Buffer.alloc(0)
    writes.splice(0).forEach((work) => {
      clearTimeout(work.timer)
      work.bytes = Buffer.alloc(0)
      work.reject(new NativeDockProtocol.NativeError(
        state.failure!.code, state.failure!.message, work.sent ? "unknown" : "not-dispatched",
      ))
    })
    state.queuedBytes = 0
    const cleanupDeadline = performance.now() + 5000
    const watchdog = setTimeout(() => stopped.reject(new NativeDockProtocol.NativeError(
      "helper-termination-timeout", "Native helper cleanup deadline expired", "unknown",
    )), 5000)
    // A timeout cannot cancel a runtime callback. Late settlement still cleans up,
    // but cannot change the rejected termination promise into successful reaping.
    // In particular, stop must never overtake an in-flight start mutation.
    Promise.resolve(state.starting).catch(() => {}).then(() => captured.stop()).then((exit) => {
      clearTimeout(watchdog)
      if (performance.now() >= cleanupDeadline) stopped.reject(new NativeDockProtocol.NativeError(
        "helper-termination-timeout", "Native helper cleanup deadline expired", "unknown",
      ))
      state.exit = Object.freeze({ ...exit })
      const listeners = [...exits]
      exits.clear()
      listeners.forEach((entry) => notifyExit(entry.listener, state.exit!))
      stopped.resolve()
    }).catch(() => {
      clearTimeout(watchdog)
      stopped.reject(new NativeDockProtocol.NativeError(
        "helper-termination-failed", "Native helper cleanup failed", "unknown",
      ))
    })
    return state.stopping
  }

  function start() {
    state.starting = Promise.resolve().then(() => {
      if (state.stopping) return
      if (performance.now() >= deadline) throw new Error("startup-timeout")
      return captured.start()
    })
    state.starting.then(() => {
      if (state.stopping) return
      if (performance.now() >= deadline) {
        fail(new NativeDockProtocol.NativeError("startup-timeout", "Native attach/start deadline expired"))
        return
      }
      state.ready = true
      clearTimeout(startup)
      pumpWrites()
    }, () => fail(new NativeDockProtocol.NativeError("transport-error", "Native helper start failed")))
  }

  function eof() {
    fail(new NativeDockProtocol.NativeError(
      !state.attached || state.remaining ? "protocol-error" : "transport-error",
      "Native attach stream ended",
    ))
  }

  function read() {
    const socket = state.socket
    if (!socket || state.stopping) return
    // Read-side aggregate retention is bounded independently of the write queue.
    // There is no whole-frame accumulator, only one delivered chunk, a header,
    // the socket's bounded readable buffer, and a 64 KiB stderr ring.
    if (socket.readableLength + state.header.length + state.stderr.length + 16384 > NativeDockProtocol.limits.frameBytes) {
      fail(new NativeDockProtocol.NativeError("protocol-error", "Native attach retention limit exceeded"))
      return
    }
    if (state.reading) {
      state.reread = true
      return
    }
    state.reading = true
    const consume = async () => {
      while (!state.stopping) {
        if (!state.attached) {
          const byte: Buffer | null = socket.read(1)
          if (!byte) return
          state.header[state.used++] = byte[0]!
          if (state.used >= 4 && state.header.readUInt32BE(state.used - 4) === 0x0d0a0d0a) {
            if (!upgrade(state.header.subarray(0, state.used).toString("latin1"))) {
              fail(new NativeDockProtocol.NativeError("protocol-error", "Native attach upgrade response is invalid"))
              return
            }
            state.attached = true
            state.header = Buffer.alloc(0)
            start()
            continue
          }
          if (state.used === 16384) {
            fail(new NativeDockProtocol.NativeError("protocol-error", "Native attach header exceeds byte limit"))
            return
          }
          continue
        }
        if (!state.remaining) {
          const header: Buffer | null = socket.read(8)
          if (!header) return
          if (header.length !== 8 || (header[0] !== 1 && header[0] !== 2)
            || header[1] !== 0 || header[2] !== 0 || header[3] !== 0
            || header.readUInt32BE(4) > NativeDockProtocol.limits.frameBytes) {
            fail(new NativeDockProtocol.NativeError("protocol-error", "Native attach multiplex frame is invalid"))
            return
          }
          state.selector = header[0]!
          state.remaining = header.readUInt32BE(4)
          if (!state.remaining) continue
        }
        // No pre-listener stdout spool. Readable mode stops the socket at its HWM.
        if (state.selector === 1 && !data.size) return
        const size = Math.min(state.remaining, socket.readableLength, 16384)
        if (!size) return
        const chunk: Buffer | null = socket.read(size)
        if (!chunk) return
        state.remaining -= chunk.length
        if (state.selector === 2) {
          const end = Math.min(chunk.length, state.stderr.length - state.stderrOffset)
          state.stderr.set(chunk.subarray(0, end), state.stderrOffset)
          state.stderr.set(chunk.subarray(end), 0)
          state.stderrOffset = (state.stderrOffset + chunk.length) % state.stderr.length
          continue
        }
        // Void listeners normally finish synchronously. Await returned promises
        // too, so an async subscriber cannot create an unbounded delivery queue.
        for (const entry of [...data]) {
          if (state.stopping) return
          if (!data.has(entry)) continue
          await entry.listener(chunk)
        }
      }
    }
    consume().catch(() => fail(new NativeDockProtocol.NativeError(
      "transport-error", "Native attach delivery failed",
    ))).finally(() => {
      state.reading = false
      if (state.ended && !state.stopping) eof()
      // A subscription/readable event can arrive between consume's return and
      // this microtask, when the socket need not emit another readable event.
      if (state.reread) {
        state.reread = false
        read()
      }
    })
  }

  function pumpWrites() {
    const socket = state.socket
    if (!socket || !state.ready || state.stopping || state.writing) return
    const work = writes[0]
    if (!work) return
    if (performance.now() >= work.deadline) {
      fail(new NativeDockProtocol.NativeError("write-timeout", "Native channel write deadline expired"))
      return
    }
    if (!socket.writable || socket.destroyed) {
      fail(new NativeDockProtocol.NativeError("transport-error", "Native attach socket is not writable"))
      return
    }
    state.writing = true
    const completion = { returned: false, flushed: false, drained: false }
    const finish = () => {
      if (state.stopping || !completion.returned || !completion.flushed || !completion.drained) return
      if (performance.now() >= work.deadline) {
        fail(new NativeDockProtocol.NativeError("write-timeout", "Native channel write deadline expired"))
        return
      }
      state.offDrain?.()
      state.offDrain = undefined
      clearTimeout(work.timer)
      writes.shift()
      state.queuedBytes -= work.bytes.length
      work.bytes = Buffer.alloc(0)
      state.writing = false
      work.resolve()
      pumpWrites()
    }
    const drain = () => { completion.drained = true; finish() }
    socket.once("drain", drain)
    state.offDrain = () => socket.off("drain", drain)
    work.sent = true
    try {
      const writable = socket.write(work.bytes, (error) => {
        if (error) {
          fail(new NativeDockProtocol.NativeError("transport-error", "Native attach socket write failed"))
          return
        }
        completion.flushed = true
        finish()
      })
      completion.returned = true
      if (writable) completion.drained = true
      finish()
    } catch {
      fail(new NativeDockProtocol.NativeError("transport-error", "Native attach socket write failed"))
    }
  }

  // Installers such as NativeDockClient get both subscriptions before any I/O.
  queueMicrotask(() => {
    if (state.stopping) return
    try {
      if (!/^[a-f0-9]{64}$/.test(captured.containerID)) throw new Error("invalid-container-id")
      const path = socketPath(captured.endpoint)
      const socket = new Socket({ allowHalfOpen: true })
      state.socket = socket
      socket.on("readable", read)
      socket.once("error", () => fail(new NativeDockProtocol.NativeError("transport-error", "Native attach socket failed")))
      socket.once("end", () => { state.ended = true; if (!state.reading) eof() })
      socket.once("close", () => {
        if (!state.stopping) fail(new NativeDockProtocol.NativeError("transport-error", "Native attach socket closed"))
      })
      socket.once("connect", () => {
        if (state.stopping) return
        socket.write(`POST /v1.51/containers/${captured.containerID}/attach?stream=1&stdin=1&stdout=1&stderr=1 HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 0\r\n\r\n`)
      })
      socket.connect({ path })
    } catch {
      fail(new NativeDockProtocol.NativeError("transport-error", "Native attach endpoint or identity is invalid"))
    }
  })

  return {
    write(bytes) {
      if (state.failure) return Promise.reject(state.failure)
      if (bytes.byteLength > NativeDockProtocol.limits.frameBytes)
        return Promise.reject(new NativeDockProtocol.NativeError("protocol-error", "Native channel write exceeds byte limit"))
      if (writes.length >= NativeDockProtocol.limits.pending || state.queuedBytes + bytes.byteLength > NativeDockProtocol.limits.frameBytes)
        return Promise.reject(new NativeDockProtocol.NativeError("pending-limit", "Native channel write capacity exhausted"))
      const result = Promise.withResolvers<void>()
      result.promise.catch(() => {})
      writes.push({
        bytes: Buffer.from(bytes), deadline: performance.now() + 1000, sent: false,
        timer: setTimeout(() => fail(new NativeDockProtocol.NativeError(
          "write-timeout", "Native channel write deadline expired",
        )), 1000),
        resolve: result.resolve, reject: result.reject,
      })
      state.queuedBytes += bytes.byteLength
      pumpWrites()
      return result.promise
    },
    onData(listener) {
      if (state.failure) throw state.failure
      if (data.size + exits.size >= NativeDockProtocol.limits.pending)
        throw new NativeDockProtocol.NativeError("pending-limit", "Native channel subscription capacity exhausted")
      const entry = { listener }
      data.add(entry)
      read()
      return () => { data.delete(entry) }
    },
    onExit(listener) {
      if (state.exit) {
        notifyExit(listener, state.exit)
        return () => {}
      }
      if (data.size + exits.size >= NativeDockProtocol.limits.pending)
        throw new NativeDockProtocol.NativeError("pending-limit", "Native channel subscription capacity exhausted")
      const entry = { listener }
      exits.add(entry)
      return () => { exits.delete(entry) }
    },
    terminate,
  }
}

function socketPath(endpoint: string) {
  if (process.platform === "win32" && /^npipe:\/\/\/\/\.\/pipe\/[\w.-]+$/.test(endpoint))
    return endpoint.slice("npipe://".length).replaceAll("/", "\\")
  if (process.platform === "win32" || !endpoint.startsWith("unix:///")) throw new Error("invalid-local-endpoint")
  const url = new URL(endpoint)
  const path = decodeURIComponent(url.pathname)
  if (url.host || url.username || url.password || url.search || url.hash || !path.startsWith("/")
    || path.length > 4096 || /[\x00-\x1f\x7f]/.test(path)) throw new Error("invalid-local-endpoint")
  return path
}

function upgrade(header: string) {
  const lines = header.slice(0, -4).split("\r\n")
  if (!/^HTTP\/1\.1 101(?: [\x20-\x7e]*)?$/.test(lines.shift() ?? "")) return false
  const values = new Map<string, string>()
  for (const line of lines) {
    const field = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[\t ]*([\t\x20-\x7e]*)$/.exec(line)
    if (!field) return false
    const name = field[1]!.toLowerCase()
    if (values.has(name)) return false
    values.set(name, field[2]!.trim().toLowerCase())
  }
  return values.get("upgrade") === "tcp"
    && !!values.get("connection")?.split(",").some((token) => token.trim() === "upgrade")
    && !values.has("transfer-encoding")
    && (!values.has("content-length") || values.get("content-length") === "0")
}

function notifyExit(listener: (exit: NativeDockProtocol.Exit) => void, exit: NativeDockProtocol.Exit) {
  try {
    Promise.resolve(listener(exit)).catch(() => {})
  } catch {
    // A subscriber cannot invalidate runtime evidence or starve other subscribers.
  }
}
