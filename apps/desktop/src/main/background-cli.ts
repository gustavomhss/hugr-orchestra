import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const stateHome = process.env.XDG_STATE_HOME
const desktopStateNames = ["ai.hugr.orchestra.dev", "ai.hugr.orchestra.beta", "ai.hugr.orchestra"]

type Logger = {
  log(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export async function startBackgroundCli(logger: Logger, shellStateHome?: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const { app } = await import("electron")
  const binary = await resolveCliBinary(logger, shellStateHome, signal)
  signal?.throwIfAborted()
  const candidates = [
    ...new Set([stateHome, shellStateHome, ...desktopStateNames.map((name) => join(app.getPath("appData"), name))]),
  ]
  // Retain every discovery helper until it closes, including when a sibling fails.
  const discovered = await Promise.allSettled(
    candidates
      .filter((candidate) => candidate === undefined || existsSync(candidate))
      .map(async (candidate) => ({
        stateHome: candidate,
        url: serviceUrl(await run(binary, ["service", "status"], logger, { stateHome: candidate, signal })),
      })),
  )
  const failed =
    discovered.find(
      (candidate) => candidate.status === "rejected" && candidate.reason instanceof StartupProcessTerminationUnknownError,
    ) ?? discovered.find((candidate) => candidate.status === "rejected")
  if (failed?.status === "rejected") throw failed.reason
  signal?.throwIfAborted()
  const found = discovered
    .flatMap((candidate) => (candidate.status === "fulfilled" ? [candidate.value] : []))
    .find((candidate) => candidate.url !== undefined)
  logger.log("v2 CLI background instance checked", {
    detected: Boolean(found),
    ...endpoint(found?.url),
  })

  const daemonStateHome = found?.stateHome ?? stateHome
  const url = await run(binary, ["service", "start"], logger, { stateHome: daemonStateHome, signal })
  const password = await run(binary, ["service", "password"], logger, {
    redact: true,
    stateHome: daemonStateHome,
    signal,
  })
  logger.log("v2 CLI background service ready", {
    existing: Boolean(found),
    username: "orchestra",
    ...endpoint(url),
  })
  return {
    url,
    username: "orchestra",
    password,
  }
}

/** The bundled CLI, verified against its manifest (packaged builds run an installed, signature-checked copy). */
export async function resolveCliBinary(logger: Logger, shellStateHome?: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const { app } = await import("electron")
  const { nativeCliTarget, signatureCheck, verifyCliArtifact } = await import("./cli-artifacts")
  const { cliStateHomes, finishCliResolution } = await import("./cli-cache")
  signal?.throwIfAborted()
  const directory = app.isPackaged ? join(process.resourcesPath, "cli") : join(root, "../../resources/cli")
  const target = nativeCliTarget(process.platform, process.arch)
  const verification: { failure?: { reason: unknown } } = {}
  const artifact = await (async () => {
    if (!app.isPackaged) return verifyCliArtifact(directory, target)
    const { installCliArtifact } = await import("./cli-install")
    signal?.throwIfAborted()
    return installCliArtifact(directory, target, join(app.getPath("userData"), "cli"), {
      // The installed copy takes the bundle's rg along; signed, it must still carry a valid signature.
      signature: async (file) => {
        if (verification.failure) throw verification.failure.reason
        signal?.throwIfAborted()
        const check = signatureCheck(target, file)
        if (!check) return false
        return runStartupCommand(check.command, check.args, { signal }).then(
          (result) => check.valid(result.stdout),
          (error: unknown) => {
            if ((signal?.aborted && error === signal.reason) || error instanceof StartupProcessTerminationUnknownError) {
              // Installation may retry an invalid cached artifact. Cancellation is not a signature failure.
              verification.failure = { reason: error }
              throw error
            }
            return false
          },
        )
      },
    })
  })().catch((error: unknown) => {
    if (verification.failure) throw verification.failure.reason
    signal?.throwIfAborted()
    throw error
  })
  if (verification.failure) throw verification.failure.reason
  signal?.throwIfAborted()
  logger.log("v2 CLI executable resolved", {
    binary: artifact.path,
    version: artifact.version,
    packaged: app.isPackaged,
  })
  return finishCliResolution(
    artifact,
    () => run(artifact.path, ["--version"], logger, { signal }),
    app.isPackaged
      ? {
          directory: join(app.getPath("userData"), "cli"),
          stateHomes: cliStateHomes(join(homedir(), ".local", "state"), [
            stateHome,
            shellStateHome,
            ...desktopStateNames.map((name) => join(app.getPath("appData"), name)),
          ]),
        }
      : undefined,
  )
}

/** Own a short bootstrap command through close, including cancellation and deadline escalation. */
export async function runStartupCommand(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv
    signal?: AbortSignal
    timeoutMs?: number
    killGraceMs?: number
    killWaitMs?: number
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  options.signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const state: {
      child?: ReturnType<typeof execFile>
      output?: { error: Error | null; stdout: string; stderr: string }
      closed: boolean
      registered: boolean
      settled: boolean
      stopping?: { reason: unknown }
      killError?: unknown
      deadline?: ReturnType<typeof setTimeout>
      termination?: ReturnType<typeof setTimeout>
    } = { closed: false, registered: false, settled: false }

    function cleanup() {
      clearTimeout(state.deadline)
      clearTimeout(state.termination)
      options.signal?.removeEventListener("abort", abort)
      state.child?.removeListener("close", close)
    }

    function finish() {
      if (state.settled || !state.registered || !state.output || !state.child) return
      // A failed spawn has no process to reap. All other callbacks still have to join close.
      if (!state.closed && !(state.output.error && state.child.pid === undefined)) return
      state.settled = true
      cleanup()
      if (state.stopping) return reject(state.stopping.reason)
      if (state.output.error)
        return reject(Object.assign(state.output.error, { stdout: state.output.stdout, stderr: state.output.stderr }))
      resolve({ stdout: state.output.stdout, stderr: state.output.stderr })
    }

    function close() {
      state.closed = true
      finish()
    }

    function kill(signal: NodeJS.Signals) {
      if (state.closed) return
      try {
        state.child?.kill(signal)
      } catch (error) {
        // A failed signal is not proof of termination; continue escalation and the bounded join.
        state.killError = error
      }
    }

    function stop(reason: unknown) {
      if (state.settled || state.stopping) return
      state.stopping = { reason }
      clearTimeout(state.deadline)
      state.termination = setTimeout(() => {
        if (state.settled) return
        state.termination = setTimeout(() => {
          if (state.settled) return
          state.settled = true
          cleanup()
          reject(new StartupProcessTerminationUnknownError(state.killError ?? reason))
        }, options.killWaitMs ?? 5_000)
        // child.killed only records a successful signal send, not that the child exited.
        kill("SIGKILL")
      }, options.killGraceMs ?? 1_000)
      kill("SIGTERM")
      finish()
    }

    function abort() {
      stop(options.signal?.reason)
    }

    state.child = execFile(command, args, { env: options.env, windowsHide: true }, (error, stdout, stderr) => {
      if (state.settled) return
      state.output = { error, stdout, stderr }
      finish()
    })
    state.child.once("close", close)
    state.deadline = setTimeout(() => stop(new Error("startup-process-timeout")), options.timeoutMs ?? 120_000)
    options.signal?.addEventListener("abort", abort, { once: true })
    state.registered = true
    if (options.signal?.aborted) abort()
    finish()
  })
}

class StartupProcessTerminationUnknownError extends Error {
  constructor(cause: unknown) {
    super("startup-process-termination-unknown", { cause })
  }
}

async function run(
  binary: string,
  args: string[],
  logger: Logger,
  options: { redact?: boolean; stateHome?: string; signal?: AbortSignal } = {},
) {
  options.signal?.throwIfAborted()
  const { cliEnv } = await import("./cli-env")
  logger.log("v2 CLI command started", { binary, args })
  const env = cliEnv(process.env, options.stateHome)
  return runStartupCommand(binary, args, { env, signal: options.signal }).then(
    (result) => {
      const stdout = result.stdout.trim()
      const stderr = result.stderr.trim()
      logger.log("v2 CLI command completed", {
        args,
        stdout: options.redact ? "[redacted]" : stdout,
        stderr: options.redact ? "[redacted]" : stderr,
      })
      return stdout
    },
    (error: unknown) => {
      const output = error && typeof error === "object" ? (error as { stdout?: string; stderr?: string }) : {}
      logger.error("v2 CLI command failed", {
        args,
        error: options.redact ? "[redacted]" : error instanceof Error ? error.message : String(error),
        stdout: options.redact && output.stdout ? "[redacted]" : (output.stdout?.trim() ?? ""),
        stderr: options.redact ? "[redacted]" : (output.stderr?.trim() ?? ""),
      })
      if (
        (options.signal?.aborted && error === options.signal.reason) ||
        error instanceof StartupProcessTerminationUnknownError
      )
        throw error
      throw options.redact ? new Error("Owned CLI credential command failed") : error
    },
  )
}

function serviceUrl(status: string) {
  if (URL.canParse(status)) return status
  if (!status.startsWith("running ")) return
  const url = status.slice("running ".length).trim()
  return URL.canParse(url) ? url : undefined
}

function endpoint(url: string | undefined) {
  if (!url || !URL.canParse(url)) return {}
  const parsed = new URL(url)
  return { url, hostname: parsed.hostname, port: parsed.port }
}
