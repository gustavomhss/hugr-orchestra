export * as ActivityQuarantineNative from "./activity-quarantine-native"

import type { ActivityQuarantine } from "./activity-quarantine"
import { ActivityQuarantineExecutor } from "./activity-quarantine-executor"
import { Omni } from "./omni"

/** Acquired only from the server's durable registration while new claims are excluded. */
export type Lease = Readonly<{
  originalPath: string
  quarantinePath: string
  state: "armed" | "verified"
  release: () => Promise<void>
}>

export type Acquire = (
  target: ActivityQuarantineExecutor.Target,
  transition: "apply" | "restore",
) => Promise<Lease | undefined>

export async function execute(
  acquire: Acquire,
  target: ActivityQuarantineExecutor.Target,
  transition: ActivityQuarantine.Transition,
) {
  if (transition === "empty") return "Refused"
  const native = await Omni.quarantine().catch(() => undefined)
  if (!native) return "Refused"
  const captured = { ...target }
  const lease = await acquire(captured, transition).catch(() => undefined)
  if (!lease) return "Refused"

  try {
    if (!lease.originalPath || !lease.quarantinePath ||
      lease.state !== (transition === "apply" ? "armed" : "verified")) return "Refused"
    const original = lease.originalPath
    const quarantine = lease.quarantinePath
    const source = transition === "apply" ? original : quarantine
    const destination = transition === "apply" ? quarantine : original
    const reread = async () => ({
      original: await inspect(native, original),
      quarantine: await inspect(native, quarantine),
    })
    return await ActivityQuarantineExecutor.execute({
      async prepare() {
        return {
          facts: await reread(),
          claimant: "absent",
          mutation: async () =>
            await native.quarantineRename(source, destination, captured.identity) === captured.identity ? "accepted" : "unknown",
        }
      },
      reread,
    }, captured, transition)
  } finally {
    await Promise.resolve().then(() => lease.release()).catch(() => undefined)
  }
}

async function inspect(native: Omni.Quarantine, path: string): Promise<ActivityQuarantine.Reading> {
  const identity = await native.quarantineInspect(path).catch(() => undefined)
  if (identity === null) return { state: "absent" }
  return identity ? { state: "present", identity } : { state: "unavailable" }
}
