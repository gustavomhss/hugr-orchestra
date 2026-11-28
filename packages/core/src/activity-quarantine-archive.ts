export * as ActivityQuarantineArchive from "./activity-quarantine-archive"

import { lstat, mkdtemp } from "fs/promises"
import path from "path"
import { Effect } from "effect"
import type { ActivityQuarantineCustody } from "./activity-quarantine-custody"
import { Omni } from "./omni"

const MAX_BYTES = 16 * 1024 * 1024
let custody: {
  authority: ActivityQuarantineCustody.Interface
  directories: Map<string, Promise<string>>
} | undefined

/** Bind the private producer to the locally owned server's custody authority. */
export function bind(authority: ActivityQuarantineCustody.Interface): () => void {
  if (custody) throw new Error("Archive quarantine is already bound")
  const binding = { authority, directories: new Map<string, Promise<string>>() }
  custody = binding
  return () => {
    if (custody === binding) custody = undefined
  }
}

export function eligible(bytes: number) {
  return process.platform === "win32" && custody !== undefined && bytes > 0 && bytes <= MAX_BYTES
}

/** Capture only the archive just created by the installer, before the extractor sees it. */
export async function capture(file: string) {
  const binding = custody
  if (!binding) return undefined
  const native = await Omni.quarantine().catch(() => undefined)
  if (!native?.quarantineRenameExclusive) return undefined
  const stat = await lstat(file).catch(() => undefined)
  if (!stat?.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) return undefined
  const identity = await native.quarantineInspect(file).catch(() => undefined)
  if (!identity) return undefined
  return { binding, native, file, identity }
}

/** The installer calls this after extraction and layout, before it removes its private unpack directory. */
export async function handoff(
  captured: NonNullable<Awaited<ReturnType<typeof capture>>>,
  staging: string,
  label: string,
) {
  if (custody !== captured.binding) return
  const stat = await lstat(captured.file).catch(() => undefined)
  if (!stat?.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES ||
    await captured.native.quarantineInspect(captured.file).catch(() => undefined) !== captured.identity) return
  const parent = path.dirname(staging)
  const directories = captured.binding.directories
  const pending = directories.get(parent) ?? mkdtemp(path.join(parent, ".quarantine-"))
  directories.set(parent, pending)
  const directory = await pending.catch(() => {
    if (directories.get(parent) === pending) directories.delete(parent)
    return undefined
  })
  if (!directory || custody !== captured.binding) return
  const id = crypto.randomUUID()
  const generation = "1"
  const destination = path.join(directory, id)
  return await Effect.runPromise(captured.binding.authority.move({
    id, generation, identity: captured.identity, label: label || "Installer archive", owner: "Pinned artifact installer",
  }, async (target, transition) => {
    if (custody !== captured.binding || transition !== "apply" || target.id !== id ||
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
}
