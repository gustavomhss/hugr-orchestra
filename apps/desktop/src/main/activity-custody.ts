import { closeSync, fstatSync, readSync } from "node:fs"
import { isAbsolute } from "node:path"
import { Omni } from "@orchestra/core/omni"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"

const SOCKET = "ORCHESTRA_ACTIVITY_CUSTODY_SOCKET"
const FD = "ORCHESTRA_ACTIVITY_CUSTODY_FD"

export type ActivityCustody = {
  socketPath: string
  signer: Awaited<ReturnType<typeof ActivityPrivateChannel.signer>>
}

export function activityCustodyConfigured() {
  return process.env[SOCKET] !== undefined || process.env[FD] !== undefined
}

export function clearActivityCustodyEnvironment(env: NodeJS.ProcessEnv) {
  delete env[SOCKET]
  delete env[FD]
}

export function activityCustodyWayland() {
  return process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland" &&
    Boolean(process.env.WAYLAND_DISPLAY) && !process.env.DISPLAY
}

/** Consume the inherited admin credential before starting the Desktop's renderer or sidecar. */
export async function loadActivityCustody(enabled = true): Promise<ActivityCustody | undefined> {
  const socketPath = process.env[SOCKET]
  const descriptor = process.env[FD]
  clearActivityCustodyEnvironment(process.env)
  if (!descriptor || !/^[0-9]+$/.test(descriptor)) return undefined
  const fd = Number(descriptor)
  if (!Number.isInteger(fd) || fd < 3 || fd > 0x7fffffff) return undefined

  const secret = await readCredential(fd, enabled && activityCustodyWayland() &&
    !!socketPath && isAbsolute(socketPath) && !socketPath.includes("\0"))
  if (!socketPath || !secret) return undefined
  return ActivityPrivateChannel.signer(secret)
    .then((signer) => ({ socketPath, signer }), () => undefined)
    .finally(() => secret.fill(0))
}

async function readCredential(fd: number, enabled: boolean) {
  const frame = new Uint8Array(ActivityPrivateChannel.frameBytes)
  try {
    try {
      if (!enabled || process.platform !== "linux" || !process.getuid?.() || !process.geteuid?.()) return undefined
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o400) === 0 || (stat.mode & 0o077) !== 0 ||
        stat.size !== frame.length || !await Omni.protectProcessMemory()) return undefined
      let offset = 0
      while (offset < frame.length) {
        const count = readSync(fd, frame, offset, frame.length - offset, offset)
        if (count === 0) return undefined
        offset += count
      }
    } finally {
      closeSync(fd)
    }
    return ActivityPrivateChannel.keyFromFrame(frame)
  } catch {
    return undefined
  } finally {
    frame.fill(0)
  }
}
