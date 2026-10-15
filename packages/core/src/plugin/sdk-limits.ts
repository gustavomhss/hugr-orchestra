export * as PluginSdkLimits from "./sdk-limits"

import { open, opendir } from "node:fs/promises"
import { Schema } from "effect"

export class SetupError extends Schema.TaggedErrorClass<SetupError>()("PluginSdkSetupError", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message() { return `${this._tag}: ${this.reason} (${this.path})` }
}

export const limits = { directories: 4096, entries: 32768, directoryEntries: 4096, bytes: 8 * 1024 * 1024, packageBytes: 256 * 1024 }

export function budget(maximum = limits) {
  const used = { directories: 0, entries: 0, bytes: 0 }
  return {
    directoryEntries: maximum.directoryEntries,
    spend(kind: keyof typeof used, amount: number, file: string) {
      used[kind] += amount
      if (used[kind] > maximum[kind]) throw new SetupError({ path: file, reason: `Admission ${kind} bound exceeded` })
    },
  }
}

// Consume directory entries one at a time, including the quota check before the
// caller can append to a queue. Dir's async iterator closes on break/error.
export async function* entries(directory: string, quota: ReturnType<typeof budget>) {
  quota.spend("directories", 1, directory)
  const count = { value: 0 }
  for await (const entry of await opendir(directory, { bufferSize: 1 })) {
    if (++count.value > quota.directoryEntries) throw new SetupError({ path: directory, reason: "Admission directory-entry bound exceeded" })
    quota.spend("entries", 1, directory)
    yield entry
  }
}

// fstat before allocating, then a fixed-cap read also detects growth after fstat.
export async function read(file: string, quota: ReturnType<typeof budget>, maximum = limits.packageBytes) {
  const handle = await open(file, "r")
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > maximum) throw new SetupError({ path: file, reason: "Admission file-byte bound exceeded or non-regular file" })
    quota.spend("bytes", info.size + 1, file)
    const bytes = Buffer.alloc(info.size + 1)
    const offset = { value: 0 }
    while (offset.value < bytes.length) {
      const result = await handle.read(bytes, offset.value, bytes.length - offset.value, null)
      if (!result.bytesRead) break
      offset.value += result.bytesRead
    }
    if (offset.value !== info.size) throw new SetupError({ path: file, reason: "File changed during bounded admission read" })
    return bytes.subarray(0, offset.value)
  } finally {
    await handle.close()
  }
}
