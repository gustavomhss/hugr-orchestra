import { spawn } from "node:child_process"
import { Writable } from "node:stream"
import { NativeDockClient } from "./app-dock-native-client"
import { NativeDockProtocol } from "./app-dock-native-protocol"

export const goldens: NativeDockProtocol.Reply[] = await Bun.file(new URL("../../test/native/contract/replies.json", import.meta.url)).json()
export const invalid: unknown[] = await Bun.file(new URL("../../test/native/contract/invalid-replies.json", import.meta.url)).json()
export const clients: NativeDockClient[] = []
export const children: StdioChannel[] = []
export const encoder = new TextEncoder()
export const discover: NativeDockProtocol.Call = { op: "bind", args: { phase: "discover" } }
export const read = (bindingID = "a", bindingEpoch = "e1"): NativeDockProtocol.Call => ({ op: "read", args: {}, bindingID, bindingEpoch })

export async function closeClients() {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})))
  await Promise.all(children.splice(0).map((channel) => channel.terminate()))
}

// This channel injects exact reentrancy/ordering faults, not native application behavior.
export class MemoryChannel implements NativeDockProtocol.Channel {
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

export async function memory(config: NativeDockProtocol.ClientConfig = {}) {
  const channel = new MemoryChannel()
  const client = await NativeDockClient.create(channel, { sessionID: "session", ...config })
  clients.push(client)
  return { channel, client }
}

export async function bind(client: NativeDockClient, channel: MemoryChannel, bindingID = "a", bindingEpoch = "e1") {
  const result = client.request({ op: "bind", args: { phase: "confirm", proposalID: "p", roots: [], ownershipRevision: 1 } })
  await until(() => channel.last?.op === "bind")
  channel.ack(channel.last, { bindingID, bindingEpoch, appID: "app", launchEpoch: "launch" })
  await result
  await Bun.sleep(0)
}

export async function until(predicate: () => boolean) {
  const deadline = performance.now() + 1500
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("Harness condition not reached")
    await Bun.sleep(1)
  }
}

export function failure(promise: Promise<unknown>) {
  return promise.then(() => { throw new Error("Expected request rejection") }, (error: unknown) => {
    expect(error).toBeInstanceOf(NativeDockProtocol.NativeError)
    return error as NativeDockProtocol.NativeError
  })
}

export function block(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Real process pipes exercise framing, UTF-8, stream backpressure, EOF and reaping.
// The child speaks the contract fixtures; it is not an AT-SPI provider.
export class StdioChannel implements NativeDockProtocol.Channel {
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

