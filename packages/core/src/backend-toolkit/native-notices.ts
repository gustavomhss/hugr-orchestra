export * as BackendToolkitNativeNotices from "./native-notices"

import { createHash } from "crypto"
import path from "path"
import { constants } from "fs"
import { lstat, open, type FileHandle } from "fs/promises"
import { Effect } from "effect"
import type { PinnedArtifact } from "../pinned-artifact"
import type { NativeEngine } from "./manifest"

type Notice = NonNullable<NativeEngine["notices"]>[number]

export type NoticeLayout = {
  readonly executable: string
  readonly entries: ReadonlyArray<string>
  readonly caseFold: boolean
}

const FILENAME = /^[a-z0-9][a-z0-9.-]{0,127}\.txt$/
const NOFOLLOW = "O_NOFOLLOW" in constants && typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0

/** Map declared notices to raw artifacts, or `notice-invalid`. Never drops a bad list and installs without it. */
export function noticeArtifacts(
  notices: ReadonlyArray<Notice> | undefined,
  layout: NoticeLayout,
): ReadonlyArray<PinnedArtifact.Artifact> | "notice-invalid" {
  if (notices === undefined) return []
  if (!Array.isArray(notices)) return "notice-invalid"
  const names = new Set<string>()
  const artifacts: PinnedArtifact.Artifact[] = []
  for (const notice of notices) {
    const source = noticeSource(notice)
    if (!source || names.has(source.filename) || collides(layout, source.filename)) return "notice-invalid"
    names.add(source.filename)
    artifacts.push({
      url: source.url,
      integrity: source.integrity,
      format: "raw",
      entries: [{ from: source.from, to: `notices/${source.filename}` }],
    })
  }
  return artifacts
}

/**
 * Observe installed notices. A completed cache is not repaired here.
 * The `notices` directory is lstat'd and must be a real directory. The file is opened with
 * `O_NOFOLLOW` where that flag exists; Windows has no such flag, so identity is the pre/post
 * lstat plus the descriptor fstat. That is not an openat race proof.
 */
export function noticeReadiness(
  directory: string,
  notices: ReadonlyArray<Notice> | undefined,
  layout: NoticeLayout,
): Effect.Effect<string | undefined> {
  const checked = noticeArtifacts(notices, layout)
  if (typeof checked === "string") return Effect.succeed(checked)
  if (checked.length === 0) return Effect.succeed(undefined)
  return Effect.gen(function* () {
    const parent = yield* Effect.promise(() => lstat(path.join(directory, "notices")).catch(() => undefined))
    if (!parent) return "notice-missing"
    if (parent.isSymbolicLink()) return "notice-symlink"
    if (!parent.isDirectory()) return "notice-missing"
    for (const artifact of checked) {
      const filename = artifact.entries[0]?.to.slice("notices/".length) ?? ""
      const read = yield* Effect.promise(() => readNotice(directory, filename, parent))
      if (typeof read === "string") return read
      if (`sha256-${createHash("sha256").update(read).digest("base64")}` !== artifact.integrity) return "notice-modified"
    }
    return undefined
  })
}

function noticeSource(notice: unknown) {
  if (notice === null || typeof notice !== "object") return
  if (!("filename" in notice) || typeof notice.filename !== "string" || !FILENAME.test(notice.filename)) return
  if (!("integrity" in notice) || !sha256(notice.integrity)) return
  if (!("url" in notice) || typeof notice.url !== "string" || notice.url.length === 0) return
  try {
    const from = path.posix.basename(new URL(notice.url).pathname)
    if (from.length === 0 || from === "." || from === "..") return
    return { filename: notice.filename, integrity: notice.integrity, url: notice.url, from }
  } catch {
    return
  }
}

function sha256(integrity: unknown): integrity is `sha256-${string}` {
  if (typeof integrity !== "string" || !integrity.startsWith("sha256-")) return false
  const body = integrity.slice("sha256-".length)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return false
  const decoded = Buffer.from(body, "base64")
  return decoded.length === 32 && decoded.toString("base64") === body
}

function collides(layout: NoticeLayout, filename: string) {
  const destination = `notices/${filename}`
  return [layout.executable, ...layout.entries].some((occupied) => intersects(occupied, destination, layout.caseFold))
}

function intersects(occupied: string, noticePath: string, caseFold: boolean) {
  const left = normalize(occupied, caseFold)
  const right = normalize(noticePath, caseFold)
  if (left.length === 0) return false
  if (left === right || left === "notices" || left.startsWith("notices/")) return true
  return right.startsWith(`${left}/`) || left.startsWith(`${right}/`)
}

function normalize(relative: string, caseFold: boolean) {
  const normal = path.posix.normalize(relative.replaceAll("\\", "/")).replace(/^\.\//, "").replace(/\/$/, "")
  return caseFold ? normal.toLowerCase() : normal
}

async function readNotice(directory: string, filename: string, parent: { dev: number; ino: number }): Promise<Uint8Array | string> {
  const noticesDir = path.join(directory, "notices")
  const file = path.join(noticesDir, filename)
  let handle: FileHandle | undefined
  try {
    const before = await lstat(file)
    if (before.isSymbolicLink()) return "notice-symlink"
    if (!before.isFile()) return "notice-missing"
    handle = await open(file, constants.O_RDONLY | NOFOLLOW)
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) return "notice-symlink"
    const bytes = new Uint8Array(await handle.readFile())
    const parentAfter = await lstat(noticesDir)
    if (parentAfter.isSymbolicLink() || !parentAfter.isDirectory() || parentAfter.dev !== parent.dev || parentAfter.ino !== parent.ino)
      return "notice-symlink"
    const after = await lstat(file)
    if (after.isSymbolicLink() || !after.isFile() || after.dev !== before.dev || after.ino !== before.ino) return "notice-symlink"
    return bytes
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined
    if (code === "ENOENT") return "notice-missing"
    if (code === "ELOOP") return "notice-symlink"
    return "notice-unreadable"
  } finally {
    await handle?.close().catch(() => undefined)
  }
}
