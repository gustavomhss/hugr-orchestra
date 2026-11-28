export * as ActivityQuarantineNative from "./activity-quarantine-native"

import type { ActivityQuarantine } from "./activity-quarantine"
import { ActivityQuarantineExecutor } from "./activity-quarantine-executor"
import { Omni } from "./omni"

/** Acquired only from the server's durable registration while new claims are excluded. */
export type Lease = Readonly<{
  originalPath: string
  quarantinePath: string
  state: "armed" | "verified"
  disposable?: "file" | "empty-directory"
  release: () => Promise<void>
}>

export type Acquire = (
  target: ActivityQuarantineExecutor.Target,
  transition: "apply" | "restore" | "empty",
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
    const rename = transition === "apply" && lease.disposable === "file" ? native.quarantineRenameExclusive : native.quarantineRename
    if (!rename) return "Refused"
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
          async mutation() {
            const outcome = await rename(source, destination, captured.identity)
            return outcome === null ? "refused" : outcome === captured.identity ? "accepted" : "unknown"
          },
        }
      },
      reread,
    }, captured, transition)
  } finally {
    await Promise.resolve().then(() => lease.release()).catch(() => undefined)
  }
}

/** The provider validates generation and identity while excluding new claimants until release. */
export async function executeEmpty(
  acquire: Acquire,
  targets: readonly ActivityQuarantineExecutor.Target[],
  currentRows: Parameters<typeof ActivityQuarantine.emptyTargets>[0],
) {
  const native = await Omni.quarantine().catch(() => undefined)
  if (!native?.quarantineDispose) return "Refused"
  const dispose = native.quarantineDispose
  const leases = new Map<string, Lease>()
  try {
    return await ActivityQuarantineExecutor.executeEmpty({
      async prepare(target) {
        const lease = await acquire(target, "empty").catch(() => undefined)
        if (!lease) return undefined
        leases.set(target.id, lease)
        if (!lease.originalPath?.trim() || !lease.quarantinePath?.trim() || lease.state !== "verified" ||
          (lease.disposable !== "file" && lease.disposable !== "empty-directory")) return undefined
        return {
          facts: { original: { state: "unavailable" }, quarantine: await inspect(native, lease.quarantinePath) },
          claimant: "absent",
          mutation: async () => {
            await dispose(lease.quarantinePath, target.identity)
            return "accepted"
          },
        }
      },
      async reread(target) {
        const lease = leases.get(target.id)
        return {
          original: { state: "unavailable" },
          quarantine: lease ? await inspect(native, lease.quarantinePath) : { state: "unavailable" },
        }
      },
    }, targets, currentRows)
  } finally {
    await Promise.all([...leases.values()].map((lease) => Promise.resolve().then(() => lease.release()).catch(() => undefined)))
  }
}

async function inspect(native: Omni.Quarantine, path: string): Promise<ActivityQuarantine.Reading> {
  const identity = await native.quarantineInspect(path).catch(() => undefined)
  if (identity === null) return { state: "absent" }
  return identity ? { state: "present", identity } : { state: "unavailable" }
}
