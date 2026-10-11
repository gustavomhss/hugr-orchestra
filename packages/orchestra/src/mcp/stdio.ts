export * as McpStdio from "./stdio"

// The stdio MCP transport on omni (WP3), used only when ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER is on; the legacy path
// keeps the MCP SDK's own stdio transport. The server's whole tree is omni's: close() ends it, and a crash of the host
// ends it too. stderr is always drained (to debug logs), so a chatty server never blocks before it connects.

import { hostname } from "node:os"
import path from "node:path"
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import { Effect } from "effect"
import { Flag } from "@orchestra/core/flag/flag"
import { Omni } from "@orchestra/core/omni"
import { Process } from "@/util/process"

const TAIL = 20
const CLOSE_WAIT = 2_000
const LONG_LINE = 64 * 1024
/** Docker label that ties a container started for an MCP server to the Orchestra process that started it. */
export const LABEL = "orchestra.session"

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
}

/** Whether MCP stdio servers start on omni. */
export function enabled() {
  return Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off"
}

/**
 * The omni transport for one configured server: docker gets `--rm` and the owner label (after one sweep per process),
 * and every stderr line becomes a debug log of the calling fiber's loggers.
 */
export const open = Effect.fnUntraced(function* (input: Omit<Params, "log"> & { server: string; args: string[] }) {
  const args = docker(input.command, input.args)
  if (args !== input.args) yield* Effect.promise(() => sweep())
  const log = Effect.runForkWith(yield* Effect.context<never>())
  return new OmniStdioTransport({
    ...input,
    args,
    log: (line) => void log(Effect.logDebug("MCP stderr", { server: input.server, line })),
  })
})

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
    Process.telemetry("spawn", { command: path.basename(this.params.command), mode: "mcp" })
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

/**
 * `docker run` arguments for an omni MCP server: `--rm`, and a label naming this process, so a container whose client
 * died with a kill -9 is removed by the next sweep(). Other commands pass unchanged.
 */
export function docker(command: string, args: string[]) {
  if (path.basename(command).replace(/\.exe$/i, "") !== "docker" || args[0] !== "run") return args
  const extra = [...(args.includes("--rm") ? [] : ["--rm"]), "--label", `${LABEL}=${owner()}`]
  return ["run", ...extra, ...args.slice(1)]
}

function owner() {
  return `${hostname()}/${process.pid}`
}

let swept: Promise<void> | undefined

/**
 * Once per process: removes MCP containers labelled by an Orchestra process of this host that is gone. A label whose
 * pid is alive (even a reused pid) is left alone, so a sweep can leak a container but never removes a live one.
 */
export function sweep() {
  swept ??= (async () => {
    const listed = await Process.lines(
      ["docker", "ps", "-a", "--filter", `label=${LABEL}`, "--format", `{{.ID}} {{.Label "${LABEL}"}}`],
      { nothrow: true, deadline: 15_000 },
    )
    const dead = listed
      .map((line) => line.trim().split(/\s+/))
      .filter(([id, label]) => id && label && stale(label))
      .map(([id]) => id)
    if (dead.length === 0) return
    await Process.run(["docker", "rm", "-f", ...dead], { nothrow: true, deadline: 30_000 })
  })().catch(() => undefined)
  return swept
}

function stale(label: string) {
  const [host, pid] = [label.slice(0, label.lastIndexOf("/")), Number(label.slice(label.lastIndexOf("/") + 1))]
  if (host !== hostname() || !Number.isSafeInteger(pid) || pid <= 0) return false
  if (pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as { code?: string }).code === "ESRCH"
  }
}
