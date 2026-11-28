export * as McpStdio from "./stdio"

// The MCP stdio transport on omni. The server's whole tree is omni's: close() ends it, and a crash of the host ends it
// too. stderr is always drained, so a chatty server never blocks before it connects. This replaces the MCP SDK's own
// stdio transport, which spawns outside the repo's spawn rules.

import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import { Omni } from "../omni"

const TAIL = 20
const CLOSE_WAIT = 2_000
const LONG_LINE = 64 * 1024

// The slice of hugr-omni's PipeChild<Uint8Array> used here (only core/src/omni.ts imports hugr-omni).
type Pipe = {
  readonly pid: number
  readonly output: AsyncIterable<{ stream: "stdout" | "stderr" | "pty"; data: Uint8Array }>
  write(data: string | Uint8Array): Promise<void>
  closeStdin(): Promise<void>
  wait(): Promise<unknown>
  stop(options?: { graceMs?: number }): Promise<unknown>
}

export interface Params {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string | undefined>
  /** Receives every stderr line of the server (the caller logs it at debug level). */
  log?: (line: string) => void
  /** Called once the server process is spawned, for the caller's spawn telemetry. */
  spawned?: () => void
}

export class OmniStdioTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void
  private child?: Pipe
  private readonly buffer = new ReadBuffer()
  private readonly decoder = new TextDecoder()
  private readonly lines: string[] = []
  private partial = ""
  private done = false
  private closing?: Promise<void>

  constructor(private readonly params: Params) {}

  get pid() {
    return this.child?.pid ?? null
  }

  /** The last 20 lines the server wrote to stderr, for a connect failure. */
  stderrTail() {
    return [...this.lines, ...(this.partial ? [this.partial] : [])].slice(-TAIL).join("\n")
  }

  async start() {
    if (this.child || this.done) throw new Error("OmniStdioTransport already started")
    const binding = await Omni.load()
    // close() may have run while omni loaded; spawning now would leave a child nobody stops.
    if (this.closing || this.done) throw new Error("OmniStdioTransport closed before start")
    // A missing command or a bad cwd throws here, so connect() rejects with omni's message.
    const child = binding.spawn(this.params.command, this.params.args ?? [], {
      cwd: this.params.cwd,
      inheritEnv: false,
      env: Omni.childEnv(this.params.env),
      stdin: "pipe",
      text: false,
      backpressure: true,
    })
    this.child = child
    Omni.count("spawns")
    this.params.spawned?.()
    void this.pump(child)
  }

  async send(message: JSONRPCMessage) {
    if (!this.child || this.done) throw new Error("Not connected")
    await this.child.write(serializeMessage(message))
  }

  /** Ends stdin, gives the server up to 2 s to exit on its own, then always stops the whole tree. */
  close() {
    this.closing ??= this.shutdown()
    return this.closing
  }

  private async shutdown() {
    const child = this.child
    if (child) {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        child
          .closeStdin()
          .catch(() => undefined)
          .then(() => child.wait()),
        new Promise((resolve) => (timer = setTimeout(resolve, CLOSE_WAIT))),
      ]).catch(() => undefined)
      clearTimeout(timer)
      await child.stop({ graceMs: CLOSE_WAIT }).catch(() => undefined)
    }
    this.buffer.clear()
    this.finish()
  }

  private async pump(child: Pipe) {
    try {
      for await (const chunk of child.output) {
        if (chunk.stream === "stderr") this.stderr(this.decoder.decode(chunk.data, { stream: true }))
        else this.read(chunk.data)
      }
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)))
    }
    this.stderr(this.decoder.decode(), true)
    await child.wait().catch(() => undefined)
    this.finish()
  }

  private read(data: Uint8Array) {
    this.buffer.append(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    for (;;) {
      try {
        const message = this.buffer.readMessage()
        if (message === null) return
        this.onmessage?.(message)
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }

  private stderr(text: string, end = false) {
    const parts = (this.partial + text).split("\n")
    this.partial = parts.pop() ?? ""
    if (end || this.partial.length > LONG_LINE) {
      if (this.partial) parts.push(this.partial)
      this.partial = ""
    }
    for (const part of parts) {
      const line = part.endsWith("\r") ? part.slice(0, -1) : part
      this.lines.push(line)
      if (this.lines.length > TAIL) this.lines.shift()
      this.params.log?.(line)
    }
  }

  private finish() {
    if (this.done) return
    this.done = true
    this.onclose?.()
  }
}

/** A connect failure's message, with the server's last stderr lines when the transport kept them. */
export function failure(transport: unknown, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const tail = transport instanceof OmniStdioTransport ? transport.stderrTail() : ""
  return tail ? `${message}\nLast stderr lines:\n${tail}` : message
}
