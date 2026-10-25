import { randomUUID } from "node:crypto"
import { createServer } from "node:net"
import type { Readable } from "node:stream"
import { DesktopOmni } from "./omni-process"

// The desktop-owned V2 server: the bundled CLI as `orchestra serve`, a child of this app and its default server. It is
// not the shared background daemon.
// No electron import: index.ts resolves the CLI and the launch env, so this module runs under bun test.

type Logger = {
  log(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

const HOSTNAME = "127.0.0.1"
const READY_TIMEOUT = 20_000
const STOP_TIMEOUT = 6_000
// When the desktop dies, omni stops the server tree with this much grace: the server needs it to stop the shells and
// MCP servers it started, through its own supervisor, before the forced step ends that supervisor too.
const TREE_GRACE = 5_000
const BACKOFF = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
// A child that served this long resets the backoff; a crash loop gives up after BACKOFF runs out.
const STABLE_AFTER = 60_000

export async function startOwnedServe(options: {
  logger: Logger
  /** The CLI executable, then any arguments before `serve`. */
  command: [string, ...string[]]
  env: Record<string, string | undefined>
  write: (stream: "stdout" | "stderr", message: string) => void
  /** Lifecycle witnesses for the packaged omni smoke: the server child's pid, then its exit and how it stopped. */
  onSpawn?: (pid: number | undefined) => void
  onEvent?: (name: string, data: Record<string, unknown>) => void
}) {
  const port = await freePort()
  const password = randomUUID()
  const url = `http://${HOSTNAME}:${port}`
  const env = {
    ...options.env,
    ORCHESTRA_CLIENT: "desktop",
    ORCHESTRA_SERVER_USERNAME: "orchestra",
    ORCHESTRA_SERVER_PASSWORD: password,
  }
  const state = { child: undefined as DesktopOmni.Spawned | undefined, stopping: false, killed: false, failures: 0 }

  const launch = () => {
    const startedAt = Date.now()
    const args = [...options.command.slice(1), "serve", "--hostname", HOSTNAME, "--port", String(port)]
    const child = DesktopOmni.spawn(options.command[0], args, { env, stdin: "closed", graceMs: TREE_GRACE })
    state.child = child
    // An omni child learns its pid asynchronously, so the witness waits for the spawn event.
    child.once("spawn", () => options.onSpawn?.(child.pid))
    forward(child.stdout, (line) => options.write("stdout", line.replaceAll(password, "[redacted]")))
    forward(child.stderr, (line) => options.write("stderr", line.replaceAll(password, "[redacted]")))
    child.once("error", (error) => options.logger.error("owned serve error", { message: error.message }))
    const exited = new Promise<void>((resolve) =>
      child.once("exit", (code, signal) => {
        resolve()
        if (state.child === child) state.child = undefined
        // The server answers the SIGTERM it was asked to stop on with the signal's exit status (143); that is an orderly
        // stop. A server that had to be killed, or that failed on its own, keeps its real status.
        const requested = state.stopping && !state.killed && (code === 143 || signal === "SIGTERM" || process.platform === "win32")
        options.onEvent?.("utility-exit", { utilityPID: child.pid, code: requested ? 0 : code })
        options.logger.log("owned serve exited", { code, signal, stopping: state.stopping })
        if (state.stopping) return
        state.failures = Date.now() - startedAt > STABLE_AFTER ? 0 : state.failures + 1
        const wait = BACKOFF[state.failures - 1]
        if (wait === undefined) return options.logger.error("owned serve crash loop; not restarting", { url })
        options.logger.log("owned serve restarting", { attempt: state.failures, wait })
        setTimeout(() => {
          if (!state.stopping) launch()
        }, wait).unref()
      }),
    )
    return { child, exited }
  }

  options.logger.log("owned serve starting", { command: options.command, url })
  const first = launch()
  const health = Promise.race([
    poll(() => healthy(url, password)),
    first.exited.then(() => Promise.reject(new Error("Owned serve exited before its health check passed"))),
    delay(READY_TIMEOUT).then(() => Promise.reject(new Error(`Owned serve not healthy within ${READY_TIMEOUT}ms`))),
  ])

  const stop = async () => {
    state.stopping = true
    const child = state.child
    if (!child) return
    // Wait for "close", not "exit": the omni child still drains its output and reaps its tree after the exit, and the app
    // must not quit under that native work (on Windows it ends the process with a nonzero status).
    const exited = new Promise<"exited">((resolve) => child.once("close", () => resolve("exited")))
    // SIGTERM goes to the server alone. Stopping its whole omni tree would also end the supervisor the server relies on
    // to reap the shells and MCP servers its tools started, and they would outlive it. Windows has no SIGTERM, and its
    // job object ends the tree.
    if (child.pid === undefined || process.platform === "win32") child.kill("SIGTERM")
    else process.kill(child.pid, "SIGTERM")
    const outcome = await Promise.race([exited, delay(STOP_TIMEOUT).then(() => "timeout" as const)])
    if (outcome === "exited") return options.onEvent?.("utility-stopped", {})
    options.onEvent?.("utility-watchdog", {})
    state.killed = true
    child.kill("SIGKILL")
  }

  return { url, username: "orchestra", password, listener: { stop }, health: { wait: health } }
}

/** The server a launch uses, from `ORCHESTRA_SIDECAR_V2`: the owned V2 child unless "1" asks for the shared daemon. */
export function sidecarVersion(value: string | undefined) {
  if (value === "1") return "v2" as const
  return "v2-owned" as const
}

async function healthy(url: string, password: string) {
  return fetch(new URL("/api/health", url), {
    headers: { authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}` },
    signal: AbortSignal.timeout(3000),
  }).then(
    (response) => response.ok,
    () => false,
  )
}

async function poll(check: () => Promise<boolean>) {
  while (!(await check())) await delay(100)
}

function forward(stream: Readable, write: (line: string) => void) {
  const buffer = { text: "" }
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    const lines = (buffer.text + chunk).split(/\r?\n/)
    buffer.text = lines.pop() ?? ""
    lines.filter((line) => line.trim()).forEach(write)
  })
  stream.on("end", () => {
    if (buffer.text.trim()) write(buffer.text)
  })
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const socket = createServer()
    socket.on("error", reject)
    socket.listen(0, HOSTNAME, () => {
      const address = socket.address()
      socket.close(() =>
        typeof address === "object" && address ? resolve(address.port) : reject(new Error("Failed to get port")),
      )
    })
  })
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
