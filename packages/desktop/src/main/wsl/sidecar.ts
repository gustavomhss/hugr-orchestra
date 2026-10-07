import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { type WslCommandLine, resolveWslOrchestra, runWslInDistro, shellEscape, wslArgs } from "./runtime"
import { checkWslAuthentication, pollWslHealth } from "./startup"
import { guestEnvironment } from "./artifact"
import { nativeT } from "../native-translations"

export type WslSidecar = {
  listener: { stop: () => void; onExit: (cb: (code: number | null, signal: NodeJS.Signals | null) => void) => void }
  url: string
  username: string | null
  password: string
}

export async function spawnWslSidecar(
  distro: string,
  opts: { onLine?: (line: WslCommandLine) => void; healthTimeoutMs?: number; signal?: AbortSignal } = {},
): Promise<WslSidecar> {
  opts.signal?.throwIfAborted()
  const orchestra = await resolveWslOrchestra(distro, { signal: opts.signal })
  if (!orchestra) throw new Error(nativeT("desktop.wsl.error.serverNotInstalled", { distro }))

  const port = await allocatePort()
  const credential = await runWslInDistro(
    ["bash", "-c", `${guestEnvironment}\nexec ${shellEscape(orchestra)} service password`], distro, { signal: opts.signal },
  )
  const password = credential.stdout.trim()
  if (credential.code !== 0 || !password || /[\r\n]/.test(password)) {
    throw new Error(nativeT("desktop.wsl.error.serverCannotRun"))
  }
  const username = "orchestra"
  const script = [
    guestEnvironment,
    'cd "$HOME" || cd /',
    "export ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER=true",
    "export ORCHESTRA_CLIENT=desktop",
    `exec ${shellEscape(orchestra)} serve --hostname ${shellEscape("0.0.0.0")} --port ${shellEscape(String(port))}`,
  ].join("\n")
  const child = spawn("wsl", wslArgs(["bash", "-se"], distro), {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    signal: opts.signal,
  })
  child.stdin.end(script)

  const recentOutput: string[] = []
  const emit = (line: WslCommandLine) => {
    line = { ...line, text: line.text.replaceAll(password, "[redacted]") }
    if (!line.text.trim()) return
    recentOutput.push(`[${line.stream}] ${line.text}`)
    if (recentOutput.length > 12) recentOutput.shift()
    opts.onLine?.(line)
  }
  forwardLines(child.stdout, "stdout", emit)
  forwardLines(child.stderr, "stderr", emit)

  const exit = new Promise<never>((_, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => reject(new Error(startupFailure(code, signal, recentOutput))))
  })
  const url = `http://127.0.0.1:${port}`
  const startup = new AbortController()
  const healthSignal = opts.signal ? AbortSignal.any([opts.signal, startup.signal]) : startup.signal
  const health = pollWslHealth(() => checkWslAuthentication(url, password, healthSignal).catch(() => false), healthSignal)
    .then(() => healthSignal.throwIfAborted())
  const timeoutMs = opts.healthTimeoutMs ?? 20_000
  let timeout: ReturnType<typeof setTimeout>
  const timedOut = new Promise<never>(
    (_, reject) =>
      (timeout = setTimeout(
        () => reject(new Error(nativeT("desktop.wsl.error.healthTimeout", { distro, timeout: timeoutMs }))),
        timeoutMs,
      )),
  )

  await Promise.race([health, exit, timedOut])
    .catch((error) => {
      child.kill()
      throw error
    })
    .finally(() => {
      clearTimeout(timeout)
      startup.abort()
    })
  return {
    listener: {
      stop: () => child.kill(),
      onExit: (cb) => child.once("exit", cb),
    },
    url,
    username,
    password,
  }
}

function allocatePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address !== "object" || !address) {
        server.close()
        reject(new Error(nativeT("desktop.wsl.error.failedPort")))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

function forwardLines(
  stream: NodeJS.ReadableStream,
  source: WslCommandLine["stream"],
  onLine: (line: WslCommandLine) => void,
) {
  let pending = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    pending += chunk
    const lines = pending.split(/\r?\n/g)
    pending = lines.pop() ?? ""
    lines.forEach((text) => onLine({ stream: source, text }))
  })
  stream.on("end", () => {
    if (pending) onLine({ stream: source, text: pending })
  })
}

function startupFailure(code: number | null, signal: NodeJS.Signals | null, recentOutput: string[]) {
  const suffix = recentOutput.length ? `\n${recentOutput.join("\n")}` : ""
  return nativeT("desktop.wsl.error.serverExitedBeforeHealthy", {
    code: code ?? "null",
    signal: signal ?? "null",
    output: suffix,
  })
}
