import { randomUUID } from "node:crypto"
import { createServer } from "node:net"
import type { Readable } from "node:stream"
import { resolveCliBinary } from "./background-cli"
import type { CandidateProfile } from "./candidate-profile"
import { DesktopOmni } from "./omni-process"
import { checkHealth, sidecarLaunchEnv } from "./server"

// The desktop-owned V2 server: the bundled CLI as `orchestra serve`, a child of this app (B6 precondition 2). It
// replaces the V1 sidecar for the launch, never runs beside it, and is not the shared background daemon.

type Logger = {
  log(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

const HOSTNAME = "127.0.0.1"
const READY_TIMEOUT = 20_000
const STOP_TIMEOUT = 6_000
const BACKOFF = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
// A child that served this long resets the backoff; a crash loop gives up after BACKOFF runs out.
const STABLE_AFTER = 60_000

export async function startOwnedServe(options: {
  logger: Logger
  userDataPath: string
  candidateProfile?: CandidateProfile
  write: (stream: "stdout" | "stderr", message: string) => void
}) {
  const binary = await resolveCliBinary(options.logger)
  const port = await freePort()
  const password = randomUUID()
  const url = `http://${HOSTNAME}:${port}`
  const env = {
    ...(await sidecarLaunchEnv(options.userDataPath, options.candidateProfile)),
    ORCHESTRA_CLIENT: "desktop",
    ORCHESTRA_SERVER_USERNAME: "orchestra",
    ORCHESTRA_SERVER_PASSWORD: password,
  }
  const state = { child: undefined as DesktopOmni.Spawned | undefined, stopping: false, failures: 0 }

  const launch = () => {
    const startedAt = Date.now()
    const child = DesktopOmni.spawn(binary, ["serve", "--hostname", HOSTNAME, "--port", String(port)], {
      env,
      stdin: "closed",
    })
    state.child = child
    forward(child.stdout, (line) => options.write("stdout", line.replaceAll(password, "[redacted]")))
    forward(child.stderr, (line) => options.write("stderr", line.replaceAll(password, "[redacted]")))
    child.once("error", (error) => options.logger.error("owned serve error", { message: error.message }))
    const exited = new Promise<void>((resolve) =>
      child.once("exit", (code, signal) => {
        resolve()
        if (state.child === child) state.child = undefined
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

  options.logger.log("owned serve starting", { binary, url })
  const first = launch()
  const health = Promise.race([
    poll(() => checkHealth(url, password)),
    first.exited.then(() => Promise.reject(new Error("Owned serve exited before its health check passed"))),
    delay(READY_TIMEOUT).then(() => Promise.reject(new Error(`Owned serve not healthy within ${READY_TIMEOUT}ms`))),
  ])

  const stop = async () => {
    state.stopping = true
    const child = state.child
    if (!child) return
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
    child.kill("SIGTERM")
    await Promise.race([exited, delay(STOP_TIMEOUT).then(() => void child.kill("SIGKILL"))])
  }

  return { url, username: "orchestra", password, listener: { stop }, health: { wait: health } }
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
