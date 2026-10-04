import { afterEach, describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { getEventListeners } from "node:events"
import { Writable } from "node:stream"
import { NativeDockClient } from "./app-dock-native-client"
import { NativeDockProtocol } from "./app-dock-native-protocol"

const goldens: NativeDockProtocol.Reply[] = await Bun.file(new URL("../../test/native/contract/replies.json", import.meta.url)).json()
const invalid: unknown[] = await Bun.file(new URL("../../test/native/contract/invalid-replies.json", import.meta.url)).json()
const clients: NativeDockClient[] = []
const children: StdioChannel[] = []
const encoder = new TextEncoder()
const discover: NativeDockProtocol.Call = { op: "bind", args: { phase: "discover" } }
const read = (bindingID = "a", bindingEpoch = "e1"): NativeDockProtocol.Call => ({ op: "read", args: {}, bindingID, bindingEpoch })

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})))
  await Promise.all(children.splice(0).map((channel) => channel.terminate()))
})

// This channel injects exact reentrancy/ordering faults, not native application behavior.
class MemoryChannel implements NativeDockProtocol.Channel {
  readonly data = new Set<(data: Uint8Array) => void>()
  readonly exits = new Set<(exit: NativeDockProtocol.Exit) => void>()
  readonly writes: NativeDockProtocol.Request[] = []
  initial: unknown = goldens[0]
  atExit?: () => void
  onWrite?: (request: NativeDockProtocol.Request) => Promise<void> | void
  onTerminate?: () => Promise<void> | void
  terminations = 0
  reaped = false
  autoShutdown = true

  onData(listener: (data: Uint8Array) => void) {
    this.data.add(listener)
    if (this.initial !== undefined) this.emit(this.initial)
    return () => { this.data.delete(listener) }
  }

  onExit(listener: (exit: NativeDockProtocol.Exit) => void) {
    this.exits.add(listener)
    this.atExit?.()
    return () => { this.exits.delete(listener) }
  }

  write(bytes: Uint8Array) {
    const request: NativeDockProtocol.Request = JSON.parse(new TextDecoder().decode(bytes))
    this.writes.push(request)
    if (request.op === "shutdown" && this.autoShutdown) this.ack(request)
    return Promise.resolve(this.onWrite?.(request))
  }

  async terminate() {
    this.terminations++
    await this.onTerminate?.()
    this.reaped = true
  }

  emit(value: unknown) { this.bytes(encoder.encode(`${JSON.stringify(value)}\n`)) }
  bytes(value: Uint8Array) { this.data.forEach((listener) => listener(value)) }
  exit(event: NativeDockProtocol.Exit = { code: 1 }) { this.exits.forEach((listener) => listener(event)) }
  ack(request: NativeDockProtocol.Request, value: NativeDockProtocol.JSONValue = null) { this.emit({ v: 1, id: request.id, ok: true, value }) }
  get last() { return this.writes[this.writes.length - 1]! }
}

async function memory(config: NativeDockProtocol.ClientConfig = {}) {
  const channel = new MemoryChannel()
  const client = await NativeDockClient.create(channel, { sessionID: "session", ...config })
  clients.push(client)
  return { channel, client }
}

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

async function bind(client: NativeDockClient, channel: MemoryChannel, bindingID = "a", bindingEpoch = "e1") {
  const result = client.request({ op: "bind", args: { phase: "confirm", proposalID: "p", roots: [], ownershipRevision: 1 } })
  await until(() => channel.last?.op === "bind")
  channel.ack(channel.last, { bindingID, bindingEpoch, appID: "app", launchEpoch: "launch" })
  await result
  await Bun.sleep(0)
}

async function until(predicate: () => boolean) {
  const deadline = performance.now() + 1500
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("Harness condition not reached")
    await Bun.sleep(1)
  }
}

function failure(promise: Promise<unknown>) {
  return promise.then(() => { throw new Error("Expected request rejection") }, (error: unknown) => {
    expect(error).toBeInstanceOf(NativeDockProtocol.NativeError)
    return error as NativeDockProtocol.NativeError
  })
}

function block(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Real process pipes exercise framing, UTF-8, stream backpressure, EOF and reaping.
// The child speaks the contract fixtures; it is not an AT-SPI provider.
class StdioChannel implements NativeDockProtocol.Channel {
  readonly data = new Set<(data: Uint8Array) => void>()
  readonly exits = new Set<(exit: NativeDockProtocol.Exit) => void>()
  readonly chunks: Uint8Array[] = []
  readonly writes: NativeDockProtocol.Request[] = []
  readonly reaped = Promise.withResolvers<void>()
  readonly child
  readonly input: Writable
  backpressure = 0
  ended = false
  processExited = false
  eofBeforeExit = false

  constructor(mode = "golden") {
    this.child = spawn("node", ["--eval", `
      const replies = ${JSON.stringify(goldens)};
      const mode = ${JSON.stringify(mode)};
      const line = (value) => JSON.stringify(value) + "\\n";
      process.stdout.write(line(replies[0]));
      if (mode === "backpressure") {
        process.stdin.pause();
        setTimeout(() => process.stdin.resume(), 80);
      }
      let input = "", count = 0, held;
      async function handle(request) {
        if (request.op === "shutdown") { process.stdout.write(line({v:1,id:request.id,ok:true,value:null})); process.exit(0); return; }
        if (mode === "crash") { process.exit(23); return; }
        if (mode === "eof") { require("node:fs").closeSync(1); setTimeout(() => process.exit(0), 5000); return; }
        if (mode === "utf8") {
          process.stdout.write(Buffer.concat([Buffer.from('{"v":1,"id":"'+request.id+'","ok":true,"value":"'),Buffer.from([0xc3,0x28]),Buffer.from('"}\\n')])); return;
        }
        if (request.args.hold) { held = request; return; }
        if (request.op === "cancel") {
          process.stdout.write(line({v:1,id:request.id,ok:true,value:null}) + line({...replies[1],id:held.id})); return;
        }
        const reply = {...replies[++count === 2 ? 2 : 1], id:request.id};
        const bytes = Buffer.from(line(reply));
        if (mode !== "golden" || count !== 1) { process.stdout.write(bytes); return; }
        const cafe = bytes.indexOf(Buffer.from("é")), emoji = bytes.indexOf(Buffer.from("🧪"));
        process.stdout.write(bytes.subarray(0,cafe+1));
        await new Promise(resolve => setTimeout(resolve,20));
        process.stdout.write(bytes.subarray(cafe+1,emoji+1));
        await new Promise(resolve => setTimeout(resolve,20));
        process.stdout.write(bytes.subarray(emoji+1));
      }
      process.stdin.on("data", chunk => {
        input += chunk.toString();
        for (let end; (end = input.indexOf("\\n")) !== -1;) {
          const request = JSON.parse(input.slice(0,end)); input = input.slice(end+1); handle(request);
        }
      });
    `], { stdio: ["pipe", "pipe", "ignore"] })
    this.input = new Writable({ highWaterMark: 16384, write: (chunk, _, done) => { this.child.stdin.write(chunk, done) } })
    this.input.on("error", () => {})
    children.push(this)
    this.child.stdout.on("data", (chunk: Uint8Array) => {
      this.chunks.push(chunk.slice())
      this.data.forEach((listener) => listener(chunk))
    })
    this.child.stdout.on("end", () => {
      this.eofBeforeExit = !this.processExited
      this.exits.forEach((listener) => listener({ code: null, reason: "helper-exited" }))
    })
    this.child.stdin.on("error", () => {})
    this.child.on("close", (code, signal) => {
      this.ended = true
      this.exits.forEach((listener) => listener({ code, ...(signal ? { signal } : {}) }))
      this.reaped.resolve()
    })
    this.child.on("error", () => this.exits.forEach((listener) => listener({ code: null })))
    this.child.on("exit", () => { this.processExited = true })
  }

  onData(listener: (data: Uint8Array) => void) { this.data.add(listener); return () => { this.data.delete(listener) } }
  onExit(listener: (exit: NativeDockProtocol.Exit) => void) { this.exits.add(listener); return () => { this.exits.delete(listener) } }
  write(bytes: Uint8Array) {
    this.writes.push(JSON.parse(new TextDecoder().decode(bytes)))
    return new Promise<void>((resolve, reject) => {
      // Batch one turn through a bounded Writable, including runtimes whose raw pipe write is synchronous.
      this.input.cork()
      if (!this.input.write(bytes, (error) => error ? reject(error) : resolve())) this.backpressure++
      queueMicrotask(() => this.input.uncork())
    })
  }
  async terminate() {
    if (!this.ended) this.child.kill("SIGKILL")
    await this.reaped.promise
  }
}

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
  })
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

describe("semantic admission and control races", () => {
  test("FIFO across bindings and synchronous terminals respect write backpressure", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    await bind(client, channel, "b")
    const gate = Promise.withResolvers<void>()
    channel.onWrite = (request) => request.op === "read" && request.bindingID === "a" ? gate.promise : undefined
    const first = client.request(read())
    const original = channel.last
    const second = client.request(read("b"))
    const third = client.request(read())
    second.catch(() => {})
    third.catch(() => {})
    channel.ack(original, "first")
    expect(await first).toBe("first")
    expect(channel.writes.filter((request) => request.op === "read").length).toBe(1)
    gate.resolve()
    await until(() => channel.last.bindingID === "b")
    channel.ack(channel.last, "second")
    expect(await second).toBe("second")
    await until(() => channel.last.id !== original.id && channel.last.bindingID === "a")
    channel.ack(channel.last, "third")
    expect(await third).toBe("third")
    expect(channel.writes.filter((request) => request.op === "read").map((request) => request.bindingID)).toEqual(["a", "b", "a"])
    expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2", "golden:3", "golden:4", "golden:5"])
  })

  test("retains slot after abort and control ACK until original late terminal", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 500 })
    await bind(client, channel)
    const abort = new AbortController()
    const sent = failure(client.request(read(), abort.signal))
    expect(getEventListeners(abort.signal, "abort").length).toBe(1)
    const original = channel.last
    const queued = client.request(read())
    queued.catch(() => {})
    abort.abort()
    expect(await sent).toMatchObject({ code: "cancelled", outcome: "unknown" })
    expect(getEventListeners(abort.signal, "abort").length).toBe(0)
    await until(() => channel.last.op === "cancel")
    const cancel = channel.last
    expect(cancel.args.requestID).toBe(original.id)
    channel.ack(cancel)
    await Bun.sleep(0)
    expect(channel.writes.filter((request) => request.op === "read").length).toBe(1)
    channel.ack(original, "late result")
    await until(() => channel.last.op === "read" && channel.last.id !== original.id)
    channel.ack(channel.last, "next result")
    expect(await queued).toBe("next result")
    expect(channel.writes.map((request) => request.sequence)).toEqual([1, 2, 3, 4])
    expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2", "golden:3", "golden:4"])
  })

  test("retains slot after timeout; original terminal before cancel serialization removes cancel", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const gate = Promise.withResolvers<void>()
    channel.onWrite = () => gate.promise
    const sent = failure(client.request({ ...discover, timeoutMs: 10 }))
    const original = channel.last
    const queued = client.request(discover)
    expect(await sent).toMatchObject({ code: "timeout", outcome: "unknown" })
    expect(channel.writes.length).toBe(1)
    channel.ack(original, "late")
    gate.resolve()
    await until(() => channel.writes.length === 2)
    expect(channel.last.op).toBe("bind")
    expect(channel.last.sequence).toBe(2)
    channel.ack(channel.last, "new")
    expect(await queued).toBe("new")
    channel.onWrite = undefined
  })

  test("original terminal before sent control ACK cannot misroute ACK to new binding", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const abort = new AbortController()
    const sent = failure(client.request(discover, abort.signal))
    const original = channel.last
    abort.abort()
    await sent
    await until(() => channel.last.op === "cancel")
    const control = channel.last
    const confirm = client.request({ op: "bind", args: { phase: "confirm" } })
    channel.ack(original, "old result")
    await until(() => channel.last.op === "bind" && channel.last.id !== original.id)
    const binding = channel.last
    channel.ack(control, "control only")
    channel.ack(binding, { bindingID: "new", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    expect(await confirm).toMatchObject({ bindingID: "new", bindingEpoch: "e2" })
    const next = client.request(read("new", "e2"))
    await until(() => channel.last.op === "read")
    channel.ack(channel.last, "new result")
    expect(await next).toBe("new result")
  })

  test("late successful cancelled confirm retires orphan guest binding before any queued operation", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    const abort = new AbortController()
    const sent = failure(client.request({ op: "bind", args: { phase: "confirm" } }, abort.signal))
    const original = channel.last
    abort.abort()
    await sent
    await until(() => channel.last.op === "cancel")
    channel.ack(channel.last)
    const queued = failure(client.request(discover))
    channel.ack(original, { bindingID: "late", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    expect(await queued).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(await failure(client.request(read("late", "e2")))).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(channel.reaped).toBe(false)
    expect(channel.writes.length).toBe(2)
    reap.resolve()
    await client.close()
    expect(channel.reaped).toBe(true)
  })

  test("stuck cancellation retires; held reap never permits second provider operation", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 30 })
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    channel.onWrite = (request) => { if (request.op === "cancel") channel.ack(request) }
    const sent = failure(client.request({ ...discover, timeoutMs: 10 }))
    const queued = failure(client.request(discover))
    const original = channel.last
    expect(await sent).toMatchObject({ code: "timeout", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "helper-unresponsive", outcome: "not-dispatched" })
    expect(channel.reaped).toBe(false)
    const closed = client.close()
    channel.ack(original, "too late")
    expect(channel.writes.map((request) => request.op)).toEqual(["bind", "cancel"])
    reap.resolve()
    await closed
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("dispatch revalidates binding after unbind control overtakes FIFO", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    await bind(client, channel, "b")
    const first = client.request(read())
    const original = channel.last
    const stale = failure(client.request(read("b")))
    const unbind = client.request({ op: "unbind", args: {}, bindingID: "b", bindingEpoch: "e1" })
    await until(() => channel.last.op === "unbind")
    channel.ack(channel.last)
    await unbind
    channel.ack(original, "ok")
    await first
    await Bun.sleep(0)
    expect(channel.writes.filter((request) => request.op === "read").map((request) => request.bindingID)).toEqual(["a"])
    expect(await stale).toMatchObject({ code: "stale-binding", outcome: "not-dispatched" })
    await bind(client, channel, "b", "e2")
    expect(await failure(client.request(read("b", "e1")))).toMatchObject({ code: "stale-binding" })
    const current = client.request(read("b", "e2"))
    await until(() => channel.last.op === "read")
    channel.ack(channel.last, "new binding")
    expect(await current).toBe("new binding")
  })

  test("queued old epoch fails after earlier confirm replaces binding", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    const first = client.request(read())
    const original = channel.last
    const confirm = client.request({ op: "bind", args: { phase: "confirm" } })
    const stale = failure(client.request(read()))
    channel.ack(original)
    await first
    await until(() => channel.last.op === "bind")
    channel.ack(channel.last, { bindingID: "a", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    await confirm
    expect(await stale).toMatchObject({ code: "stale-binding", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(3)
  })

  test("replayed original cannot resolve next request or next binding", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    const first = client.request(read())
    const original = channel.last
    const next = failure(client.request({ op: "bind", args: { phase: "confirm" } }))
    channel.ack(original, "old")
    await first
    await until(() => channel.last.op === "bind")
    channel.ack(original, { bindingID: "a", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    expect(await next).toMatchObject({ code: "protocol-error", outcome: "unknown" })
    expect(await failure(client.request(read("a", "e2")))).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(3)
  })

  test("abort before admission and queued abort/deadline consume no IDs or controls", async () => {
    const { channel, client } = await memory()
    const before = new AbortController()
    before.abort()
    expect(await failure(client.request(discover, before.signal))).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(0)
    const sent = client.request(discover)
    const original = channel.last
    const abort = new AbortController()
    const cancelled = failure(client.request(discover, abort.signal))
    const expired = failure(client.request({ ...discover, timeoutMs: 10 }))
    const next = client.request(discover)
    abort.abort()
    expect(await cancelled).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(await expired).toMatchObject({ code: "timeout", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(1)
    channel.ack(original)
    await sent
    await until(() => channel.writes.length === 2)
    channel.ack(channel.last, "next")
    expect(await next).toBe("next")
    expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2"])
  })

  test("abort inside synchronous write reserves correlation before cancel", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const abort = new AbortController()
    channel.onWrite = (request) => {
      if (request.op === "bind") abort.abort()
      if (request.op === "cancel") channel.ack(request)
    }
    expect(await failure(client.request(discover, abort.signal))).toMatchObject({ code: "cancelled", outcome: "unknown" })
    await until(() => channel.writes.length === 2)
    expect(channel.last).toMatchObject({ op: "cancel", id: "golden:2", args: { requestID: "golden:1" } })
    channel.ack(channel.writes[0]!)
    channel.onWrite = undefined
  })

  test("abort after synchronous terminal removes listener and deadline", async () => {
    const { channel, client } = await memory({ timeoutMs: 10, cancelGraceMs: 20 })
    const abort = new AbortController()
    channel.onWrite = (request) => { if (request.op === "bind") channel.ack(request, "done") }
    expect(await client.request(discover, abort.signal)).toBe("done")
    expect(getEventListeners(abort.signal, "abort").length).toBe(0)
    abort.abort()
    await Bun.sleep(25)
    expect(channel.writes.length).toBe(1)
    expect(channel.terminations).toBe(0)
  })

  test("queued aborted unbind never invalidates binding or consumes sequence", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    const gate = Promise.withResolvers<void>()
    channel.onWrite = () => gate.promise
    const first = client.request(read())
    const original = channel.last
    const abort = new AbortController()
    const unbind = failure(client.request({ op: "unbind", args: {}, bindingID: "a", bindingEpoch: "e1" }, abort.signal))
    abort.abort()
    expect(await unbind).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(getEventListeners(abort.signal, "abort").length).toBe(0)
    const next = client.request(read())
    channel.ack(original)
    await first
    gate.resolve()
    await until(() => channel.writes.length === 3)
    expect(channel.last).toMatchObject({ op: "read", sequence: 3, bindingEpoch: "e1" })
    channel.ack(channel.last)
    await next
    channel.onWrite = undefined
  })

  test("pending limit bounds semantics; separate control lane stays usable", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 300 })
    const gate = Promise.withResolvers<void>()
    channel.onWrite = () => gate.promise
    const work = Array.from({ length: 32 }, () => failure(client.request(discover)))
    expect(await failure(client.request(discover))).toMatchObject({ code: "pending-limit", outcome: "not-dispatched" })
    const controls = Array.from({ length: 32 }, () => failure(client.request({ op: "cancel", args: { requestID: channel.writes[0]!.id } })))
    expect(await failure(client.request({ op: "cancel", args: { requestID: channel.writes[0]!.id } }))).toMatchObject({ code: "pending-limit", outcome: "not-dispatched" })
    channel.exit({ code: 1 })
    const errors = await Promise.all(work)
    expect(errors[0]!.outcome).toBe("unknown")
    expect(errors.slice(1).every((error) => error.outcome === "not-dispatched")).toBe(true)
    expect((await Promise.all(controls)).every((error) => error.outcome === "not-dispatched")).toBe(true)
    gate.resolve()
    expect(channel.writes.length).toBe(1)
  })

  test("queued arguments snapshot prevents caller scope mutation", async () => {
    const { channel, client } = await memory()
    const first = client.request(discover)
    const original = channel.last
    const call: NativeDockProtocol.Call = { op: "bind", args: { phase: "discover", marker: "original" } }
    const queued = client.request(call)
    call.args.marker = "changed"
    call.op = "shutdown"
    channel.ack(original)
    await first
    await until(() => channel.writes.length === 2)
    expect(channel.last).toMatchObject({ op: "bind", args: { marker: "original" } })
    channel.ack(channel.last)
    await queued
  })

  test("oversized admission, invalid scope and invalid deadlines never serialize", async () => {
    const { channel, client } = await memory()
    expect(await failure(client.request({ op: "bind", args: { phase: "discover", payload: "🧪".repeat(70000) } }))).toMatchObject({ code: "invalid-request", outcome: "not-dispatched" })
    expect(await failure(client.request(read()))).toMatchObject({ code: "stale-binding", outcome: "not-dispatched" })
    expect(await failure(client.request({ ...discover, bindingID: "foreign", bindingEpoch: "epoch" }))).toMatchObject({ code: "wrong-scope" })
    expect(await failure(client.request({ op: "cancel", args: { requestID: "foreign:1" } }))).toMatchObject({ code: "wrong-scope" })
    expect(await failure(client.request({ ...discover, timeoutMs: Number.NaN }))).toMatchObject({ code: "invalid-request" })
    expect(channel.writes.length).toBe(0)
    const bounded = client.request({ ...discover, timeoutMs: 10001 })
    expect(channel.last.timeoutMs).toBeLessThanOrEqual(10000)
    channel.ack(channel.last)
    await bounded
  })

  test("malformed confirm reply invalidates binding and queued semantics", async () => {
    const { channel, client } = await memory()
    const confirm = failure(client.request({ op: "bind", args: { phase: "confirm" } }))
    const queued = failure(client.request(discover))
    channel.ack(channel.last, { bindingID: "a", bindingEpoch: "e1" })
    expect(await confirm).toMatchObject({ code: "protocol-error", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(1)
  })

  test("remote protocol error preserves terminal evidence and retires queued work", async () => {
    const { channel, client } = await memory()
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    channel.emit({ v: 1, id: channel.last.id, ok: false, error: { code: "protocol-error", message: "Invalid request", outcome: "not-dispatched", result: { dispatch: "rejected" } } })
    expect(await sent).toMatchObject({ code: "protocol-error", outcome: "not-dispatched", result: { dispatch: "rejected" } })
    expect(await queued).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(1)
  })

  test("binding cache rejects helper overflow instead of growing without bound", async () => {
    const { channel, client } = await memory()
    for (const bindingID of Array.from({ length: 8 }, (_, index) => `b${index}`)) await bind(client, channel, bindingID)
    const overflow = failure(client.request({ op: "bind", args: { phase: "confirm" } }))
    await until(() => channel.writes.length === 9)
    channel.ack(channel.last, { bindingID: "b8", bindingEpoch: "e1", appID: "app", launchEpoch: "launch" })
    expect(await overflow).toMatchObject({ code: "protocol-error", outcome: "unknown" })
    expect(channel.terminations).toBe(1)
  })

  test("shutdown blocked by backpressure still has bounded deadline and reaps", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 15 })
    const gate = Promise.withResolvers<void>()
    channel.onWrite = () => gate.promise
    const sent = failure(client.request(discover))
    const closed = client.close()
    expect(await sent).toMatchObject({ code: "client-closed", outcome: "unknown" })
    await closed
    gate.resolve()
    expect(channel.writes.map((request) => request.op)).toEqual(["bind"])
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("close shutdown overtakes queued semantics and waits for reaping", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    const closed = client.close()
    expect(await sent).toMatchObject({ code: "client-closed", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "client-closed", outcome: "not-dispatched" })
    await until(() => channel.terminations === 1)
    expect(channel.reaped).toBe(false)
    expect(channel.writes.map((request) => request.op)).toEqual(["bind", "shutdown"])
    expect(client.close()).toBe(closed)
    reap.resolve()
    await closed
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("reentrant close from synchronous shutdown write shares teardown", async () => {
    const { channel, client } = await memory()
    channel.autoShutdown = false
    const nested: Promise<void>[] = []
    channel.onWrite = (request) => {
      if (request.op !== "shutdown") return
      nested.push(client.close())
      channel.ack(request)
    }
    const closed = client.close()
    expect(nested[0]).toBe(closed)
    await closed
    expect(channel.writes.map((request) => request.op)).toEqual(["shutdown"])
    expect(channel.terminations).toBe(1)
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
