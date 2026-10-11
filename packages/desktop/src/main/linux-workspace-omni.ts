export * as LinuxWorkspaceOmni from "./linux-workspace-omni"

// Behind ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER every host process of linux-workspace-access runs through omni; legacy
// stays the default. Its shell() keeps child_process: it needs the real terminal (stdio inherit, plan section 3).

import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import type { Command } from "./app-dock-runtime-backend"
import { DesktopOmni } from "./omni-process"

export type Terminal = DesktopOmni.Terminal

const legacyExec = promisify(execFile)

export const exec = (
  file: string,
  args: string[],
  options: { env: Record<string, string | undefined>; timeout: number; maxBuffer: number },
) => (DesktopOmni.enabled() ? DesktopOmni.execFile(file, args, options) : legacyExec(file, args, options))

/** The prepare helper: stdin only, output ignored. */
export function spawnPrepare(host: Command): Pick<DesktopOmni.Spawned, "stdin" | "kill" | "once"> {
  return DesktopOmni.enabled()
    ? DesktopOmni.spawn(host.file, host.args, { env: host.env, output: "ignore" })
    : spawn(host.file, host.args, { env: host.env, stdio: ["pipe", "ignore", "ignore"] })
}

/** The run helper: every stdio stream piped. */
export function spawnRun(host: Command): DesktopOmni.Spawned {
  return DesktopOmni.enabled()
    ? DesktopOmni.spawn(host.file, host.args, { env: host.env })
    : spawn(host.file, host.args, { env: host.env, stdio: ["pipe", "pipe", "pipe"] })
}

/** The terminal helper: omni's terminal, or node-pty (loaded only then) with the flag off. */
export async function terminal(host: Command, size: { cols: number; rows: number }): Promise<Terminal> {
  const pty = { name: "xterm-256color", cols: size.cols, rows: size.rows, cwd: "/", env: host.env }
  const legacy = DesktopOmni.enabled() ? undefined : await import("@lydell/node-pty")
  return legacy ? legacy.spawn(host.file, host.args, pty) : await DesktopOmni.terminal(host.file, host.args, pty)
}
