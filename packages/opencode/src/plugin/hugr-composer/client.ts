import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { which } from "@opencode-ai/core/util/which"
import { withTimeout } from "@/util/timeout"

const DEFAULT_TIMEOUT = 30_000
const MAX_CALL_TIMEOUT = 5 * 60_000

type ComposerCommand = {
  command?: string
  args?: string[]
  timeout?: number
  hardTimeout?: number
  forwardAuth?: boolean
}

export class HugrComposerClient {
  #client: Client | undefined
  #connecting: Promise<Client> | undefined
  #transport: StdioClientTransport | undefined
  #disposed = false
  readonly #directory: string
  readonly #worktree: string
  readonly #command: string | undefined
  readonly #args: string[]
  readonly #timeout: number
  readonly #hardTimeout: number
  readonly #forwardAuth: boolean

  constructor(directory: string, worktree?: string, command?: ComposerCommand) {
    this.#directory = directory
    this.#worktree = worktree ?? directory
    if (command?.command && !path.isAbsolute(command.command)) throw new Error("HuGR Composer command must be absolute")
    this.#command = command?.command
    this.#args = command?.args ?? []
    this.#timeout = command?.timeout ?? DEFAULT_TIMEOUT
    this.#hardTimeout = command?.hardTimeout ?? MAX_CALL_TIMEOUT
    this.#forwardAuth = command?.forwardAuth ?? false
  }

  async callTool(
    name: string,
    arguments_: Record<string, unknown>,
    signal: AbortSignal,
    options?: { retry?: boolean },
  ): Promise<CallToolResult> {
    if (this.#disposed) throw new Error("HuGR Composer client is disposed")
    return this.#callTool(name, arguments_, signal, options?.retry ?? true)
  }

  async #callTool(
    name: string,
    arguments_: Record<string, unknown>,
    signal: AbortSignal,
    retry: boolean,
  ): Promise<CallToolResult> {
    if (signal.aborted) throw signal.reason ?? new Error("HuGR Composer connection aborted")
    const client = await withAbort(this.#getClient(), signal, "HuGR Composer connection aborted", () => this.close())
    const result = await withTimeout(
      withAbort(
        client.callTool({ name, arguments: arguments_ }, CallToolResultSchema, {
          resetTimeoutOnProgress: true,
          signal,
          timeout: this.#timeout,
          onprogress: () => {},
        }),
        signal,
        "HuGR Composer call aborted",
        () => this.close(),
      ),
      this.#hardTimeout,
      "HuGR Composer call exceeded hard deadline",
    )
      .catch(async (error) => {
        if (!retry || !isConnectionClosed(error)) throw error
        if (this.#client === client) this.#client = undefined
        await client.close().catch(() => undefined)
        return this.#callTool(name, arguments_, signal, false)
      })
      .catch(async (error) => {
        await this.close()
        throw error
      })
    if (!result.isError) return result
    throw new Error("HuGR Composer backend operation failed")
  }

  async close() {
    const client = this.#client
    const transport = this.#transport
    this.#client = undefined
    this.#transport = undefined
    this.#connecting = undefined
    if (client) {
      await client.close().catch(() => undefined)
      return
    }
    if (transport) await transport.close().catch(() => undefined)
  }

  async dispose() {
    this.#disposed = true
    await this.close()
  }

  async #getClient() {
    if (this.#disposed) throw new Error("HuGR Composer client is disposed")
    if (this.#client) return this.#client
    if (this.#connecting) return this.#connecting

    const client = new Client({ name: "opencode-hugr-composer", version: InstallationVersion })
    const command = this.#command ?? which("hugr-composer")
    if (!command) throw new Error("hugr-composer is not installed; install the HuGR Composer package first")
    client.onclose = () => {
      if (this.#client === client) this.#client = undefined
    }
    const transport = new StdioClientTransport({
      command,
      args: this.#args,
      cwd: this.#directory,
      stderr: "pipe",
      env: composerEnvironment(command, this.#worktree, this.#forwardAuth),
    })
    transport.stderr?.on("data", () => {})
    transport.onclose = () => {
      if (this.#transport === transport) {
        this.#client = undefined
        this.#transport = undefined
      }
    }
    this.#transport = transport
    const connecting = client
      .connect(transport)
      .then(() => {
        if (this.#transport !== transport) throw new Error("HuGR Composer connection closed")
        this.#client = client
        return client
      })
      .then(() => client)
    const timed = withTimeout(connecting, DEFAULT_TIMEOUT, "HuGR Composer handshake timed out").catch(async (error) => {
      await client.close().catch(() => undefined)
      throw error
    })
    this.#connecting = timed
    return timed.finally(() => {
      if (this.#connecting === timed) this.#connecting = undefined
    })
  }
}

function composerEnvironment(command: string, worktree: string, forwardAuth: boolean) {
  const pathEntries = [
    path.dirname(command),
    ...(process.platform === "win32"
      ? []
      : ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]),
  ]
  const environment: Record<string, string> = {
    PATH: pathEntries.join(path.delimiter),
    PYTHONUNBUFFERED: "1",
    HUGR_WORKTREE_ROOT: worktree,
  }
  for (const key of ["HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "HUGR_GATE"]) {
    const value = process.env[key]
    if (value !== undefined) environment[key] = value
  }
  if (forwardAuth) {
    for (const key of ["HUGR_AUTH_URL", "HUGR_DEV_LICENSE_KEYS"]) {
      const value = process.env[key]
      if (value !== undefined) environment[key] = value
    }
  }
  if (process.platform === "win32") {
    for (const key of ["SYSTEMROOT", "PATHEXT"]) {
      const value = process.env[key]
      if (value !== undefined) environment[key] = value
    }
  }
  return environment
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal, message: string, onAbort?: () => void) {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error(message))
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort?.()
      reject(signal.reason ?? new Error(message))
    }
    signal.addEventListener("abort", abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      },
    )
  })
}

function isConnectionClosed(error: unknown) {
  return error instanceof Error && /connection closed|stdio transport/i.test(error.message)
}
