export * as ActivityQuarantineArchive from "./activity-quarantine-archive"

import { lstat, mkdtemp, rmdir } from "fs/promises"
import path from "path"
import { Effect } from "effect"
import type { ActivityQuarantineCustody } from "./activity-quarantine-custody"
import { Omni } from "./omni"

const MAX_BYTES = 16 * 1024 * 1024
let custody: ActivityQuarantineCustody.Interface | undefined

/** Bind the private producer to the locally owned server's custody authority. */
export function bind(authority: ActivityQuarantineCustody.Interface): () => void {
  if (custody) throw new Error("Archive quarantine is already bound")
  custody = authority
  return () => {
    if (custody === authority) custody = undefined
  }
}

/** Capture only the archive just created by the installer, before the extractor sees it. */
export async function capture(file: string) {
  const authority = custody
  if (!authority) return undefined
  const native = await Omni.quarantine().catch(() => undefined)
  if (!native) return undefined
  const stat = await lstat(file).catch(() => undefined)
  if (!stat?.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) return undefined
  const identity = await native.quarantineInspect(file).catch(() => undefined)
  if (!identity) return undefined
  return { authority, native, file, identity }
}

/** The installer calls this after extraction and layout, before it removes its private unpack directory. */
export async function handoff(captured: NonNullable<Awaited<ReturnType<typeof capture>>>, staging: string) {
  if (custody !== captured.authority) return
  const stat = await lstat(captured.file).catch(() => undefined)
  if (!stat?.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES ||
    await captured.native.quarantineInspect(captured.file).catch(() => undefined) !== captured.identity) return
  const directory = await mkdtemp(path.join(path.dirname(staging), ".quarantine-")).catch(() => undefined)
  if (!directory) return
  const id = crypto.randomUUID()
  const generation = crypto.randomUUID()
  const destination = path.join(directory, "archive")
  const outcome = await Effect.runPromise(captured.authority.move({
    id, generation, identity: captured.identity, label: "Installer archive", owner: "Pinned artifact installer",
  }, async (target, transition) => {
    if (custody !== captured.authority || transition !== "apply" || target.id !== id ||
      target.generation !== generation || target.identity !== captured.identity) return undefined
    const current = await lstat(captured.file).catch(() => undefined)
    if (!current?.isFile() || current.nlink !== 1 || current.size > MAX_BYTES ||
      await captured.native.quarantineInspect(captured.file).catch(() => undefined) !== captured.identity) return undefined
    return {
      originalPath: captured.file,
      quarantinePath: destination,
      state: "armed" as const,
      disposable: "file" as const,
      release: async () => {},
    }
  })).catch(() => "Unknown" as const)
  if (outcome === "Refused") await rmdir(directory).catch(() => undefined)
  return outcome
}
