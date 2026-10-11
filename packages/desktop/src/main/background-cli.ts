import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { app } from "electron"
import { nativeCliTarget, verifyCliArtifact } from "./cli-artifacts"
import { installCliArtifact } from "./cli-install"

const execFileAsync = promisify(execFile)
const root = dirname(fileURLToPath(import.meta.url))
const stateHome = process.env.XDG_STATE_HOME
const desktopStateNames = ["ai.hugr.orchestra.dev", "ai.hugr.orchestra.beta", "ai.hugr.orchestra"]

type Logger = {
  log(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export async function startBackgroundCli(logger: Logger, shellStateHome?: string) {
  const directory = app.isPackaged ? join(process.resourcesPath, "cli") : join(root, "../../resources/cli")
  const target = nativeCliTarget(process.platform, process.arch)
  const artifact = app.isPackaged
    ? await installCliArtifact(directory, target, join(app.getPath("userData"), "cli"))
    : await verifyCliArtifact(directory, target)
  const binary = artifact.path
  logger.log("v2 CLI executable resolved", { binary, version: artifact.version, packaged: app.isPackaged })
  if (![artifact.version, `orchestra v${artifact.version}`].includes(await run(binary, ["--version"], logger)))
    throw new Error("Owned CLI executable version differs from its manifest")

  const candidates = [
    ...new Set([stateHome, shellStateHome, ...desktopStateNames.map((name) => join(app.getPath("appData"), name))]),
  ].filter((candidate) => candidate === undefined || existsSync(candidate))
  const discovered = await Promise.all(
    candidates.map(async (candidate) => ({
      stateHome: candidate,
      url: serviceUrl(await run(binary, ["service", "status"], logger, { stateHome: candidate })),
    })),
  )
  const found = discovered.find((candidate) => candidate.url !== undefined)
  logger.log("v2 CLI background instance checked", {
    detected: Boolean(found),
    ...endpoint(found?.url),
  })

  const daemonStateHome = found?.stateHome ?? stateHome
  const url = await run(binary, ["service", "start"], logger, { stateHome: daemonStateHome })
  const password = await run(binary, ["service", "password"], logger, {
    redact: true,
    stateHome: daemonStateHome,
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

async function run(
  binary: string,
  args: string[],
  logger: Logger,
  options: { redact?: boolean; stateHome?: string } = {},
) {
  logger.log("v2 CLI command started", { binary, args })
  const env = { ...process.env }
  if (options.stateHome === undefined) delete env.XDG_STATE_HOME
  else env.XDG_STATE_HOME = options.stateHome
  return execFileAsync(binary, args, { env, windowsHide: true }).then(
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
      const output = error as { stdout?: string; stderr?: string }
      logger.error("v2 CLI command failed", {
        args,
        error: options.redact ? "[redacted]" : error instanceof Error ? error.message : String(error),
        stdout: options.redact && output.stdout ? "[redacted]" : (output.stdout?.trim() ?? ""),
        stderr: options.redact ? "[redacted]" : (output.stderr?.trim() ?? ""),
      })
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
