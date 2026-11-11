import { createHash } from "node:crypto"
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { id } from "@atlas/kernel"
import type { StoreApi } from "@atlas/kernel"
import { nativePath } from "./genesis-native-format.js"

export const nativeIoUrl = import.meta.url

export const nativeMaxBytes = 8 * 1024 * 1024
export const nativeSha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export const nativeBlobSha = (bytes: Uint8Array) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")

export function nativeRoot(path: string): string {
  const root = resolve(path)
  const stat = lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root) throw new Error(`native-root-path: ${path}`)
  return root
}

/** Descriptor-bound, bounded reads; reject symlinks in every path component before and after reading. */
export function readNativeFile(root: string, relative: string, maximum = nativeMaxBytes): Uint8Array {
  nativePath(relative)
  const parts = relative.split("/")
  const observed = parts.map((_, index) => {
    const path = resolve(root, ...parts.slice(0, index + 1))
    const stat = lstatSync(path)
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error(`native-file-kind: ${relative}`)
    return { path, stat }
  })
  const last = observed.at(-1)!
  if (last.stat.size > maximum) throw new Error(`native-file-limit: ${relative}`)
  const fd = openSync(last.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const before = fstatSync(fd)
    if (!before.isFile() || before.ino !== last.stat.ino || before.dev !== last.stat.dev || before.size > maximum) throw new Error(`native-file-changed: ${relative}`)
    const chunks: Buffer[] = []
    const buffer = Buffer.alloc(8192)
    let length = 0
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null)
      if (!count) break
      length += count
      if (length > maximum) throw new Error(`native-file-limit: ${relative}`)
      chunks.push(Buffer.from(buffer.subarray(0, count)))
    }
    const after = fstatSync(fd)
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || length !== after.size)
      throw new Error(`native-file-changed: ${relative}`)
    for (const entry of observed) {
      const stat = lstatSync(entry.path)
      if (stat.isSymbolicLink() || stat.ino !== entry.stat.ino || stat.dev !== entry.stat.dev || stat.isDirectory() !== entry.stat.isDirectory())
        throw new Error(`native-file-changed: ${relative}`)
    }
    return Buffer.concat(chunks, length)
  } finally { closeSync(fd) }
}

export function decodeNativeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
}

export function nativeBody(store: StoreApi, bytes: Uint8Array) {
  return nativePut(store, { kind: "ownership-body", version: 1, bytes: Array.from(bytes) })
}

/** Keep the existing CAS refusal and read-back integrity checks visible to the adapter. */
export function nativePut(store: StoreApi, value: Parameters<StoreApi["put"]>[0]) {
  const hash = store.put(value)
  const persisted = hash ? store.get(hash) : undefined
  if (!hash || persisted === undefined || id(persisted) !== hash || hash !== id(value)) throw new Error("native-cas-write-failed")
  return hash
}

export function nativeCasDirectory(root: string): string {
  for (const relative of [".atlas", ".atlas/cas"]) {
    const path = resolve(root, relative)
    mkdirSync(path, { recursive: true })
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`native-state-path: ${relative}`)
  }
  return resolve(root, ".atlas/cas")
}

export function nativeImplementation(url: string) {
  return nativeSha256(readFileSync(fileURLToPath(url)))
}
