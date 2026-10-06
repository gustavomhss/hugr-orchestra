import { afterEach, describe, expect, test } from "bun:test"
import { getEventListeners } from "node:events"
import { NativeDockClient } from "./app-dock-native-client"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { bind, block, clients, closeClients, discover, encoder, failure, goldens, invalid, memory, MemoryChannel, read, StdioChannel, until } from "./app-dock-native-client.fixture"

afterEach(closeClients)

test("startup absolute deadline rejects delayed hello and delayed subscription readiness", async () => {
  for (const stage of ["hello", "subscription"]) {
    const channel = new MemoryChannel()
    channel.initial = undefined
    const install = channel.onExit.bind(channel)
    channel.onExit = (listener) => {
      const off = install(listener)
      if (stage === "subscription") channel.emit(goldens[0])
      const until = performance.now() + 25
      while (performance.now() < until) {}
      if (stage === "hello") channel.emit(goldens[0])
      return off
    }
    await expect(NativeDockClient.create(channel, { startupMs: 5 })).rejects.toMatchObject({ code: "startup-timeout" })
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  }
  const valid = await memory({ startupMs: 1000 })
  expect(valid.client.hello.sessionID).toBe("session")
})


describe("native channel framing and shared contract", () => {
  test("real stdio consumes all goldens with split UTF-8 and no retry", async () => {
    const channel = new StdioChannel()
    const client = await NativeDockClient.create(channel, { sessionID: "session" })
    clients.push(client)
    expect(client.hello).toEqual(NativeDockProtocol.hello(goldens[0]!.ok ? goldens[0]!.value : null))
    expect(Object.isFrozen(client.hello)).toBe(true)
    expect(await client.request(discover)).toEqual(goldens[1]!.ok ? goldens[1]!.value : null)
    expect(channel.chunks.some((chunk) => chunk.at(-1) === 0xc3)).toBe(true)
    expect(channel.chunks.some((chunk) => chunk.at(-1) === 0xf0)).toBe(true)
    const error = await failure(client.request(discover))
    expect(error).toMatchObject({ code: "cancelled", message: "No automatic retry", outcome: "unknown" })
    expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2"])
    await client.close()
    expect(channel.ended).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("real stdio backpressure serializes large requests", async () => {
    const channel = new StdioChannel("backpressure")
    const client = await NativeDockClient.create(channel)
    clients.push(client)
    const first = client.request({ op: "bind", args: { phase: "discover", payload: "x".repeat(240000) } })
    const second = failure(client.request(discover))
    expect(channel.writes.length).toBe(1)
    await first
    await second
    expect(channel.backpressure).toBeGreaterThan(0)
    expect(channel.writes.map((request) => request.sequence)).toEqual([1, 2])
  })

  test("real stdio coalesces control ACK and original terminal without freeing slot on ACK", async () => {
    const channel = new StdioChannel("coalesced")
    const client = await NativeDockClient.create(channel)
    clients.push(client)
    const abort = new AbortController()
    const first = failure(client.request({ op: "bind", args: { phase: "discover", hold: true } }, abort.signal))
    const next = client.request(discover)
    abort.abort()
    expect(await first).toMatchObject({ code: "cancelled", outcome: "unknown" })
    await next
    expect(channel.writes.map((request) => request.op)).toEqual(["bind", "cancel", "bind"])
    expect(channel.writes[1]!.args.requestID).toBe(channel.writes[0]!.id)
    expect(channel.chunks.some((chunk) => new TextDecoder().decode(chunk).split("\n").length >= 3)).toBe(true)
  })

  test.each(invalid.map((value, index) => [index, value] as const))("invalid shared fixture %i retires sent work", async (_, value) => {
    const { channel, client } = await memory()
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    channel.emit(value)
    expect(await sent).toMatchObject({ code: "protocol-error", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    await client.close()
    expect(channel.terminations).toBe(1)
    expect(channel.writes.length).toBe(1)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test.each(["malformed", "utf8", "oversized", "correlation", "replay-hello"])("fatal %s invalidates queued work", async (kind) => {
    const { channel, client } = await memory()
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    if (kind === "malformed") channel.bytes(encoder.encode("{\n"))
    if (kind === "utf8") channel.bytes(new Uint8Array([
      ...encoder.encode(`{"v":1,"id":"${channel.last.id}","ok":true,"value":"`), 0xc3, 0x28, ...encoder.encode('"}\n'),
    ]))
    if (kind === "oversized") {
      channel.bytes(new Uint8Array(NativeDockProtocol.limits.frameBytes - 1).fill(32))
      expect(channel.terminations).toBe(0)
      channel.bytes(new Uint8Array([32]))
      expect(channel.terminations).toBe(1)
    }
    if (kind === "correlation") channel.emit({ v: 1, id: "other:1", ok: true, value: null })
    if (kind === "replay-hello") channel.emit(goldens[0])
    expect(await sent).toMatchObject({ code: "protocol-error", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(await failure(client.request(discover))).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(1)
  })

  // On Windows the parent sees the eof child's closed stdout only when its 5 s exit timer fires (measured 5.05 s),
  // which the default 5 s test timeout cannot hold.
  test.each(["crash", "eof", "utf8"])("real process %s retires and reaps", async (mode) => {
    const channel = new StdioChannel(mode)
    const client = await NativeDockClient.create(channel)
    clients.push(client)
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    expect(await sent).toMatchObject({ code: mode === "utf8" ? "protocol-error" : "helper-exited", outcome: "unknown" })
    expect(await queued).toMatchObject({ outcome: "not-dispatched" })
    await client.close()
    expect(channel.ended).toBe(true)
    expect(channel.writes.length).toBe(1)
    if (mode === "eof") expect(channel.eofBeforeExit).toBe(true)
  }, 10_000)
})

describe("startup and retirement", () => {
  test.each(["version", "id", "session", "limits", "ops", "epoch"])("startup %s mismatch cleans synchronous listeners", async (kind) => {
    const channel = new MemoryChannel()
    const initial = JSON.parse(JSON.stringify(goldens[0]))
    if (kind === "version") initial.v = 2
    if (kind === "id") initial.id = "golden:0"
    if (kind === "session") initial.value.sessionID = "foreign"
    if (kind === "limits") initial.value.limits.pending = 33
    if (kind === "ops") initial.value.operations = ["bind"]
    if (kind === "epoch") initial.value.helperEpoch = "x".repeat(240)
    channel.initial = initial
    expect(await failure(NativeDockClient.create(channel, { sessionID: "session" }))).toMatchObject({ code: "protocol-error" })
    expect(channel.data.size + channel.exits.size).toBe(0)
    expect(channel.terminations).toBe(1)
    expect(channel.reaped).toBe(true)
    expect(channel.writes.length).toBe(0)
  })

  test("startup deadline terminates silent helper and ignores late hello", async () => {
    const channel = new MemoryChannel()
    channel.initial = undefined
    expect(await failure(NativeDockClient.create(channel, { startupMs: 10, cancelGraceMs: 50 }))).toMatchObject({ code: "startup-timeout" })
    channel.emit(goldens[0])
    expect(channel.data.size + channel.exits.size).toBe(0)
    expect(channel.reaped).toBe(true)
  })

  test("startup snapshots configured session identity", async () => {
    const channel = new MemoryChannel()
    channel.initial = undefined
    const config = { sessionID: "expected" }
    const started = failure(NativeDockClient.create(channel, config))
    config.sessionID = "session"
    channel.emit(goldens[0])
    expect(await started).toMatchObject({ code: "protocol-error" })
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("EOF before hello and thrown subscription retire startup", async () => {
    const channel = new MemoryChannel()
    channel.initial = undefined
    channel.atExit = () => channel.exit()
    expect(await failure(NativeDockClient.create(channel))).toMatchObject({ code: "helper-exited" })
    expect(channel.data.size + channel.exits.size).toBe(0)
    const broken = new MemoryChannel()
    broken.onData = () => { throw new Error("subscribe fault") }
    expect(await failure(NativeDockClient.create(broken))).toMatchObject({ code: "protocol-error" })
    expect(broken.reaped).toBe(true)
  })

  test("synchronous exit during listener install and terminate reentrancy", async () => {
    const channel = new MemoryChannel()
    channel.atExit = () => channel.exit({ code: null, reason: "helper-resource-exit" })
    channel.onTerminate = () => channel.exit()
    expect(await failure(NativeDockClient.create(channel))).toMatchObject({ code: "helper-resource-exit" })
    expect(channel.terminations).toBe(1)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("resource exit preserves sent uncertainty and never retries", async () => {
    const { channel, client } = await memory()
    expect(channel.data.size).toBe(1)
    expect(channel.exits.size).toBe(1)
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    channel.bytes(encoder.encode("{\"v\":"))
    channel.exit({ code: 137, reason: "helper-resource-exit" })
    expect(await sent).toMatchObject({ code: "helper-resource-exit", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "helper-resource-exit", outcome: "not-dispatched" })
    await client.close()
    channel.emit(goldens[1])
    expect(channel.writes.length).toBe(1)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test.each(["throw", "reject"])("%s from write retires before another operation", async (kind) => {
    const { channel, client } = await memory()
    channel.onWrite = () => {
      if (kind === "throw") throw new Error("write fault")
      return Promise.reject(new Error("backpressure fault"))
    }
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    expect(await sent).toMatchObject({ code: "helper-exited", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "helper-exited", outcome: "not-dispatched" })
    await client.close()
    expect(channel.writes.length).toBe(1)
  })

  test.each(["throw", "reject"])("synchronous terminal then EOF then write %s cannot dispatch queued work", async (kind) => {
    const { channel, client } = await memory()
    const queued: Promise<NativeDockProtocol.NativeError>[] = []
    channel.onWrite = (request) => {
      queued.push(failure(client.request(discover)))
      channel.ack(request, "terminal evidence")
      channel.exit({ code: 137, reason: "helper-resource-exit" })
      if (kind === "throw") throw new Error("post-terminal write fault")
      return Promise.reject(new Error("post-terminal backpressure fault"))
    }
    expect(await client.request(discover)).toBe("terminal evidence")
    expect(await queued[0]).toMatchObject({ code: "helper-resource-exit", outcome: "not-dispatched" })
    await client.close()
    expect(channel.writes.length).toBe(1)
    expect(channel.terminations).toBe(1)
  })

  test("teardown watchdog rejects close instead of claiming stuck helper reaped", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 15 })
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    channel.exit()
    expect(await failure(client.close())).toMatchObject({ code: "helper-termination-timeout", outcome: "unknown" })
    expect(channel.reaped).toBe(false)
    expect(channel.data.size + channel.exits.size).toBe(0)
    expect(await failure(client.request(discover))).toMatchObject({ code: "helper-exited", outcome: "not-dispatched" })
    reap.resolve()
    await until(() => channel.reaped)
    expect(await failure(client.close())).toMatchObject({ code: "helper-termination-timeout" })
  })

  test("reaping deadline outlasts cancel grace, so a slow but proven reap is not reported as failed", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 15, reapMs: 2000 })
    channel.onTerminate = () => Bun.sleep(60)
    channel.exit()
    await client.close()
    expect(channel.reaped).toBe(true)
    // A reap that never completes still fails, now at the reaping deadline.
    const stuck = await memory({ cancelGraceMs: 15, reapMs: 40 })
    stuck.channel.onTerminate = () => new Promise<void>(() => {})
    stuck.channel.exit()
    expect(await failure(stuck.client.close())).toMatchObject({ code: "helper-termination-timeout", outcome: "unknown" })
    expect(stuck.channel.reaped).toBe(false)
  })

  test("startup teardown watchdog exposes failed reaping", async () => {
    const channel = new MemoryChannel()
    channel.initial = { v: 2 }
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    expect(await failure(NativeDockClient.create(channel, { cancelGraceMs: 10 }))).toMatchObject({ code: "helper-termination-timeout" })
    expect(channel.reaped).toBe(false)
    expect(channel.data.size + channel.exits.size).toBe(0)
    reap.resolve()
  })

  test.each(["throw", "reject"])("terminate %s exposes failed reaping", async (kind) => {
    const { channel, client } = await memory()
    channel.onTerminate = () => {
      if (kind === "throw") throw new Error("terminate fault")
      return Promise.reject(new Error("reap fault"))
    }
    channel.exit()
    expect(await failure(client.close())).toMatchObject({ code: "helper-termination-failed", outcome: "unknown" })
    expect(channel.reaped).toBe(false)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })
})


describe("R2 boundary regressions", () => {
  test("local envelope overflow rejects only offender and consumes no sequence", async () => {
    const { channel, client } = await memory()
    const first = client.request(discover)
    const original = channel.last
    const args = { phase: "discover", payload: "x".repeat(NativeDockProtocol.limits.frameBytes - 40) }
    expect(encoder.encode(JSON.stringify(args)).byteLength).toBe(262137)
    const offender = failure(client.request({ op: "bind", args }))
    const healthy = client.request(discover)
    healthy.catch(() => {})
    expect(channel.writes.length).toBe(1)
    channel.ack(original, "first")
    expect(await first).toBe("first")
    expect(await offender).toMatchObject({
      code: "invalid-request", message: "Native request exceeds byte limit", outcome: "not-dispatched",
    })
    await until(() => channel.writes.length === 2)
    channel.ack(channel.last, "healthy")
    expect(await healthy).toBe("healthy")
    expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2"])
    expect(channel.writes.every((request) => request.args.payload === undefined)).toBe(true)
    expect(channel.terminations).toBe(0)
    await Bun.sleep(0)
    const remaining = client.request(discover)
    channel.ack(channel.last, "still healthy")
    expect(await remaining).toBe("still healthy")
    expect(channel.last.sequence).toBe(3)
    await client.close()
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("real sequence exhaustion stays fatal rather than local invalid-request", async () => {
    const { channel, client } = await memory()
    const first = client.request(discover)
    const original = channel.last
    // Reach the real arithmetic boundary without sending quadrillions of frames.
    Object.defineProperty(client, "sequence", { value: Number.MAX_SAFE_INTEGER, writable: true })
    const exhausted = failure(client.request(discover))
    const queued = failure(client.request(discover))
    channel.ack(original)
    await first
    expect(await exhausted).toMatchObject({
      code: "protocol-error", message: "Native request sequence exhausted", outcome: "not-dispatched",
    })
    expect(await queued).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(1)
    expect(channel.terminations).toBe(1)
    await client.close()
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test.each(
    [0, 1].flatMap((excess) => [false, true].flatMap((split) => [false, true].map((prefix) => ({ excess, split, prefix })))),
  )("wire cap counts delimiter: %j", async ({ excess, split, prefix }) => {
      const { channel, client } = await memory()
      const result = client.request(discover)
      result.catch(() => {})
      const original = channel.last
      const queued = client.request(discover)
      queued.catch(() => {})
      const control = prefix ? client.request({ op: "cancel", args: { requestID: original.id } }) : undefined
      if (control) await until(() => channel.last.op === "cancel")
      const preceding = prefix ? encoder.encode(`${JSON.stringify({ v: 1, id: channel.last.id, ok: true, value: "control" })}\n`) : new Uint8Array(0)
      const envelope = { v: 1, id: original.id, ok: true, value: "" }
      const value = "x".repeat(NativeDockProtocol.limits.frameBytes - encoder.encode(`${JSON.stringify(envelope)}\n`).byteLength + excess)
      const wire = encoder.encode(`${JSON.stringify({ ...envelope, value })}\n`)
      expect(wire.byteLength).toBe(NativeDockProtocol.limits.frameBytes + excess)
      const bytes = new Uint8Array(preceding.byteLength + wire.byteLength)
      bytes.set(preceding)
      bytes.set(wire, preceding.byteLength)
      if (split) {
        channel.bytes(bytes.subarray(0, bytes.length - 1))
        expect(channel.terminations).toBe(excess)
        channel.bytes(bytes.subarray(bytes.length - 1))
      }
      if (!split) channel.bytes(bytes)
      if (control) expect(await control).toBe("control")
      if (excess) {
        expect(await failure(result)).toMatchObject({ code: "protocol-error", outcome: "unknown" })
        expect(await failure(queued)).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
        expect(channel.writes.length).toBe(prefix ? 2 : 1)
      }
      if (!excess) {
        expect(await result).toBe(value)
        await until(() => channel.last.op === "bind" && channel.last.id !== original.id)
        channel.ack(channel.last, "healthy")
        expect(await queued).toBe("healthy")
        expect(channel.terminations).toBe(0)
      }
      await client.close()
      expect(channel.reaped).toBe(true)
      expect(channel.data.size + channel.exits.size).toBe(0)
    })

  test.each([
    { timeoutMs: 1000, blockMs: 1, late: false },
    { timeoutMs: 5, blockMs: 25, late: true },
  ])("absolute action deadline beats delayed timeout callback: %j", async ({ timeoutMs, blockMs, late }) => {
      const { channel, client } = await memory()
      await bind(client, channel)
      const queued: Promise<NativeDockProtocol.JSONValue>[] = []
      const elapsed: number[] = []
      const abort = new AbortController()
      channel.onWrite = (request) => {
        if (request.op !== "action") return
        queued.push(client.request(discover))
        queued[0]!.catch(() => {})
        const start = performance.now()
        block(blockMs)
        elapsed.push(performance.now() - start)
        channel.ack(request, { dispatch: "acknowledged", postcondition: "unverified" })
      }
      const result = client.request({ op: "action", args: { ref: "n:control" }, bindingID: "a", bindingEpoch: "e1", timeoutMs }, abort.signal)
      if (late) {
        expect(elapsed[0]).toBeGreaterThan(timeoutMs)
        expect(await failure(result)).toMatchObject({ code: "timeout", outcome: "unknown" })
      }
      if (!late) {
        expect(elapsed[0]).toBeLessThan(timeoutMs)
        expect(await result).toEqual({ dispatch: "acknowledged", postcondition: "unverified" })
      }
      expect(getEventListeners(abort.signal, "abort").length).toBe(0)
      await until(() => channel.last.op === "bind" && channel.last.sequence === 3)
      channel.ack(channel.last, "next")
      expect(await queued[0]).toBe("next")
      expect(channel.writes.map((request) => request.op)).toEqual(["bind", "action", "bind"])
      expect(channel.writes.map((request) => request.sequence)).toEqual([1, 2, 3])
      expect(channel.terminations).toBe(0)
      await client.close()
      expect(channel.data.size + channel.exits.size).toBe(0)
    })

  test.each(["cancel", "unbind"] as const)("late %s ACK times out only control, preserving original semantic slot", async (op) => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    await bind(client, channel)
    const original = client.request(read())
    original.catch(() => {})
    const request = channel.last
    const queued = client.request(discover)
    queued.catch(() => {})
    channel.onWrite = (control) => {
      if (control.op !== op) return
      block(25)
      channel.ack(control, "late ACK")
    }
    const call: NativeDockProtocol.Call = op === "cancel"
      ? { op, args: { requestID: request.id }, timeoutMs: 5 }
      : { op, args: {}, bindingID: "a", bindingEpoch: "e1", timeoutMs: 5 }
    expect(await failure(client.request(call))).toMatchObject({ code: "timeout", outcome: "unknown" })
    expect(channel.writes.map((request) => request.op)).toEqual(["bind", "read", op])
    channel.ack(request, "original terminal")
    expect(await original).toBe("original terminal")
    await until(() => channel.last.sequence === 4)
    channel.ack(channel.last, "next")
    expect(await queued).toBe("next")
    expect(channel.writes.map((request) => request.sequence)).toEqual([1, 2, 3, 4])
    expect(channel.terminations).toBe(0)
  })

  test("expired terminal after write flush releases slot without serializing cancellation", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    const abort = new AbortController()
    const result = failure(client.request({ op: "action", args: { ref: "n:control" }, bindingID: "a", bindingEpoch: "e1", timeoutMs: 5 }, abort.signal))
    const original = channel.last
    const queued = client.request(discover)
    queued.catch(() => {})
    // Flush write microtasks while keeping the request's timer callback pending.
    await Promise.resolve()
    expect(getEventListeners(abort.signal, "abort").length).toBe(1)
    block(25)
    channel.ack(original, "late terminal")
    expect(await result).toMatchObject({ code: "timeout", outcome: "unknown" })
    expect(channel.writes.map((request) => request.op)).toEqual(["bind", "action", "bind"])
    channel.ack(channel.last, "next")
    expect(await queued).toBe("next")
    expect(getEventListeners(abort.signal, "abort").length).toBe(0)
    expect(channel.terminations).toBe(0)
  })

  test("expired successful confirm retires orphan binding before queued dispatch", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    const queued: Promise<NativeDockProtocol.NativeError>[] = []
    channel.onWrite = (request) => {
      if (request.op !== "bind" || request.args.phase !== "confirm") return
      queued.push(failure(client.request(discover)))
      block(25)
      channel.ack(request, { bindingID: "orphan", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    }
    try {
      const result = failure(client.request({ op: "bind", args: { phase: "confirm" }, timeoutMs: 5 }))
      expect(channel.writes.length).toBe(1)
      expect(await result).toMatchObject({ code: "timeout", outcome: "unknown" })
      expect(channel.terminations).toBe(1)
      expect(await queued[0]).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
      expect(await failure(client.request(read("orphan", "e2")))).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
      expect(channel.reaped).toBe(false)
      expect(channel.data.size + channel.exits.size).toBe(0)
      reap.resolve()
      await client.close()
      expect(channel.reaped).toBe(true)
    } finally {
      reap.resolve()
    }
  })

  test.each(["abort-first", "terminal-first"])("expired action %s with EOF keeps settlement and never dispatches queued work", async (order) => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    await bind(client, channel)
    const abort = new AbortController()
    const queued: Promise<NativeDockProtocol.NativeError>[] = []
    channel.onWrite = (request) => {
      if (request.op !== "action") return
      queued.push(failure(client.request(discover)))
      block(25)
      if (order === "abort-first") abort.abort()
      channel.ack(request, "late terminal")
      if (order === "terminal-first") abort.abort()
      channel.exit({ code: 137, reason: "helper-resource-exit" })
      return Promise.reject(new Error("post-terminal backpressure fault"))
    }
    expect(await failure(client.request({ op: "action", args: { ref: "n:control" }, bindingID: "a", bindingEpoch: "e1", timeoutMs: 5 }, abort.signal)))
      .toMatchObject({ code: order === "abort-first" ? "cancelled" : "timeout", outcome: "unknown" })
    expect(await queued[0]).toMatchObject({ code: "helper-resource-exit", outcome: "not-dispatched" })
    expect(channel.writes.map((request) => request.op)).toEqual(["bind", "action"])
    expect(getEventListeners(abort.signal, "abort").length).toBe(0)
    await client.close()
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })
})
