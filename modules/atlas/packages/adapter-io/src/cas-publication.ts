import { randomUUID } from "node:crypto"
import {
  closeSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join } from "node:path"
import { isContainedIn } from "./containment.js"

/** Publish complete bytes without opening the addressed object for writing. The caller validates readback. */
export function publishCas(casPath: string, destination: string, bytes: string): boolean {
  try {
    const shard = dirname(destination)
    mkdirSync(casPath, { recursive: true })
    mkdirSync(shard, { recursive: true })
    // Use the reader's physical-root semantics before even allocating a temporary file in this shard.
    if (!statSync(shard).isDirectory() || !isContainedIn(casPath, shard)) return false
    const temporary = join(shard, `.${basename(destination)}.${randomUUID()}.tmp`)
    // Failure to acquire the exclusive name owns nothing: never clean up somebody else's file.
    const descriptor = openSync(temporary, "wx", 0o600)
    let published = false
    try {
      try {
        if (!fstatSync(descriptor).isFile()) return false
        writeFileSync(descriptor, bytes, "utf8")
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      renameSync(temporary, destination)
      published = true
      return true
    } finally {
      // Rename consumes our temporary name; only a failed publication still owns a name to clean up.
      if (!published) rmSync(temporary, { force: true })
    }
  } catch {
    return false
  }
}
