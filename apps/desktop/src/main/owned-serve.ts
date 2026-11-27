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
// A server that exits fails the wait at once; this cap only ends a child that stays alive without ever answering. It is
// long because macOS scans a new unsigned executable on its first run, and that scan alone has taken about 30s.
const READY_TIMEOUT = 120_000
const STOP_TIMEOUT = 6_000
// When the desktop dies, omni stops the server tree with this much grace: the server needs it to stop the shells and
// MCP servers it started, through its own supervisor, before the forced step ends that supervisor too.
const TREE_GRACE = 5_000
const BACKOFF = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
// A child that served this long resets the backoff; a crash loop gives up after BACKOFF runs out.
const STABLE_AFTER = 60_000
// How many of the server's last output lines a startup failure quotes.
const FAILURE_TAIL = 15
// UTF-16 units: even four-byte code points fit within a 16 KiB emitted segment.
const OUTPUT_SEGMENT = 4096

export async function startOwnedServe(options: {
  logger: Logger
  /** The CLI executable, then any arguments before `serve`. */
  command: [string, ...string[]]
  env: Record<string, string | undefined>
  /** The server's working directory, which is the Location of every request that names no directory. */
  cwd: string
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
  const state = {
    child: undefined as DesktopOmni.Spawned | undefined,
    stopping: false,
    killed: false,
    failures: 0,
    closed: undefined as Promise<void> | undefined,
    restart: undefined as ReturnType<typeof setTimeout> | undefined,
  }
  const recent: string[] = []
  const write = (stream: "stdout" | "stderr", line: string) => {
    recent.push(line)
    if (recent.length > FAILURE_TAIL) recent.shift()
    options.write(stream, line)
  }

  const launch = () => {
    const startedAt = Date.now()
    const args = [...options.command.slice(1), "serve", "--hostname", HOSTNAME, "--port", String(port)]
    const child = DesktopOmni.spawn(options.command[0], args, { env, cwd: options.cwd, stdin: "closed", graceMs: TREE_GRACE })
    state.child = child
    // Created at launch so a stop that lands between "exit" and "close" still waits for the drain.
    state.closed = new Promise<void>((resolve) => child.once("close", () => resolve()))
    // An omni child learns its pid asynchronously, so the witness waits for the spawn event.
    child.once("spawn", () => options.onSpawn?.(child.pid))
    // Keep a bounded witness, independent of the diagnostic tail, even across output segments.
    const refusal = { seen: false, stdout: "", stderr: "" }
    const phrase = "newer Orchestra version"
    const record = (stream: "stdout" | "stderr", line: string) => {
      const text = line.replaceAll(password, "[redacted]")
      const witness = refusal[stream] + line
      refusal.seen ||= witness.includes(phrase)
      refusal[stream] = witness.slice(-(phrase.length - 1))
      write(stream, text)
    }
    forward(child.stdout, (line) => record("stdout", line), password)
    forward(child.stderr, (line) => record("stderr", line), password)
    // A failed spawn emits error and never exit. Without this, health waits out the two-minute timeout
    // and the renderer never sees why the process did not start.
    const failed = new Promise<never>((_, reject) => {
      child.once("error", (error) => {
        options.logger.error("owned serve error", { message: error.message })
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
    void failed.catch(() => undefined)
    const exited = new Promise<void>((resolve) =>
      child.once("exit", (code, signal) => {
        resolve()
        if (state.child === child) state.child = undefined
        // The server answers the SIGTERM it was asked to stop on with the signal's exit status (143); that is an orderly
        // stop. A server that had to be killed, or that failed on its own, keeps its real status.
        const requested = state.stopping && !state.killed && (code === 143 || signal === "SIGTERM" || process.platform === "win32")
        options.onEvent?.("utility-exit", { utilityPID: child.pid, code: requested ? 0 : code })
        options.logger.log("owned serve exited", { code, signal, stopping: state.stopping })
      }),
    )
    // `close` is emitted before stdout/stderr emit "end", and forward flushes a partial line only on end.
    // Decide once both have ended, against this child's bounded refusal witness.
    const drained = { stdout: false, stderr: false, closed: false, decided: false }
    const decide = () => {
      if (drained.decided || !drained.closed || !drained.stdout || !drained.stderr) return
      drained.decided = true
      if (state.stopping) return
      // A database this build does not know will fail the same way on every start. Restarting only
      // hides that behind a health timeout.
      if (refusal.seen) {
        options.logger.error("owned serve will not restart: the database is newer than this build", { url })
        return
      }
      state.failures = Date.now() - startedAt > STABLE_AFTER ? 1 : state.failures + 1
      const wait = BACKOFF[state.failures - 1]
      if (wait === undefined) return options.logger.error("owned serve crash loop; not restarting", { url })
      options.logger.log("owned serve restarting", { attempt: state.failures, wait })
      state.restart = setTimeout(() => {
        if (!state.stopping) launch()
      }, wait).unref()
    }
    child.stdout.once("end", () => {
      drained.stdout = true
      decide()
    })
    child.stderr.once("end", () => {
      drained.stderr = true
      decide()
    })
    child.once("close", () => {
      drained.closed = true
      decide()
    })
    return { child, exited, failed }
  }

  options.logger.log("owned serve starting", { command: options.command, url })
  const first = launch()
  const startup = new AbortController()
  const deadline = setTimeout(() => startup.abort(new Error(`Owned serve not healthy within ${READY_TIMEOUT}ms`)), READY_TIMEOUT)
  const health = Promise.race([
    poll(() => healthy(url, password, startup.signal), startup.signal),
    first.exited.then(() => Promise.reject(new Error("Owned serve exited before its health check passed"))),
    first.failed,
  ]).finally(() => {
    clearTimeout(deadline)
    startup.abort()
  }).catch((error: unknown) => {
    // The renderer shows this message, so it carries what the server last said about why it did not come up.
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(recent.length ? `${reason}\n\nLast server output:\n${recent.join("\n")}` : reason)
  })

  const stop = async () => {
    state.stopping = true
    startup.abort()
    clearTimeout(state.restart)
    const child = state.child
    // Wait for "close", not "exit": the omni child still drains its output and reaps its tree after the exit, and the app
    // must not quit under that native work (on Windows it ends the process with a nonzero status). `state.child` is
    // cleared on "exit", so the close promise is kept apart from it.
    const closed = state.closed
    if (!closed) return
    if (!child) return void (await Promise.race([closed, delay(STOP_TIMEOUT)]))
    const exited = closed.then(() => "exited" as const)
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

/** The server a launch uses, from `ORCHESTRA_SIDECAR`: the desktop-owned child unless "shared" asks for the shared daemon. */
export function sidecarMode(value: string | undefined) {
  if (value === "shared") return "shared" as const
  return "owned" as const
}

async function healthy(url: string, password: string, signal: AbortSignal) {
  return fetch(new URL("/api/health", url), {
    headers: { authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}` },
    signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
  }).then(
    (response) => response.ok,
    () => false,
  )
}

async function poll(check: () => Promise<boolean>, signal: AbortSignal) {
  while (!signal.aborted) {
    if (await check()) return
    await delay(100, signal)
  }
  signal.throwIfAborted()
}

function forward(stream: Readable, write: (line: string) => void, password: string) {
  const buffer = { text: "" }
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    buffer.text += chunk
    for (;;) {
      const newline = buffer.text.indexOf("\n")
      // Hold a secret-length suffix until the next chunk, so redaction cannot straddle an emitted segment.
      if (newline < 0 && buffer.text.length < OUTPUT_SEGMENT + password.length) return
      let end = newline >= 0 && newline <= OUTPUT_SEGMENT ? newline : OUTPUT_SEGMENT
      const secret = buffer.text.lastIndexOf(password, end)
      if (secret >= 0 && secret < end && secret + password.length > end) end = secret
      const line = buffer.text.slice(0, end).replace(/\r$/, "")
      buffer.text = buffer.text.slice(end + (end === newline ? 1 : 0))
      if (line.trim()) write(line)
    }
  })
  stream.on("end", () => {
    while (buffer.text.length) {
      let end = Math.min(OUTPUT_SEGMENT, buffer.text.length)
      const secret = buffer.text.lastIndexOf(password, end)
      if (secret >= 0 && secret < end && secret + password.length > end) end = secret
      const line = buffer.text.slice(0, end)
      buffer.text = buffer.text.slice(end)
      if (line.trim()) write(line)
    }
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

function delay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", abort, { once: true })
  })
}
