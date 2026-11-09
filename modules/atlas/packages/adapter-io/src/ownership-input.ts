import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { id } from "@atlas/kernel"
import type { OwnershipInputObservation as KnowledgeOwnershipInputObservation } from "@atlas/knowledge"
import { isContainedIn } from "./containment.js"
import { runGit } from "./run-git.js"
import { runGitStrict } from "./run-git.js"
import type { RunGitStrictResult } from "./run-git.js"

export type OwnershipInputObservation = KnowledgeOwnershipInputObservation

/** Narrow FS/Git injection seams for deterministic error tests (contract §3.2: transient FS/Git
 *  errors are injected here; content/membership/removal/recreation use real FS/Git). Defaults are
 *  the real filesystem and the strict git read; tests override only the seam under test. */
export interface OwnershipObserveSeams {
  readonly lstat?: (path: string) => { size: number; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }
  readonly readdir?: (path: string) => readonly string[]
  readonly readBytes?: (path: string) => Uint8Array
  readonly gitMembers?: (repo: string, dir: string) => RunGitStrictResult
}

/** Host-bound input oracle. Unknown keys/read failures are unavailable, never copied from a receipt. */
export function ownershipInput(repoPath: string, key: string): string | undefined {
  const prefix = key.startsWith("file:") ? "file:" : key.startsWith("members:") ? "members:" : undefined
  if (prefix === undefined) return undefined
  const path = key.slice(prefix.length)
  if (!path || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === ".." || part === ".git" || part === ".atlas")) return undefined
  try {
    if (prefix === "members:") {
      const paths = [...new Set(runGit(repoPath, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", `:(literal)${path}`]).split("\0").filter(Boolean))].sort()
      if (paths.length === 0) return undefined
      return String(id({ kind: "ownership-membership", version: 1, bytes: Array.from(new TextEncoder().encode(paths.join("\0"))) }))
    }
    const root = realpathSync(repoPath)
    const requested = resolve(root, path)
    if (!isContainedIn(root, requested) || realpathSync(requested) !== requested) return undefined
    const fd = openSync(requested, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    try {
      const file = fstatSync(fd)
      // The pilot inherits Genesis's per-source evidence ceiling; larger inputs require explicit re-packing.
      if (!file.isFile() || file.size > 256000) return undefined
      return String(id({ kind: "ownership-source", version: 1, bytes: Array.from(readFileSync(fd)) }))
    } finally {
      closeSync(fd)
    }
  } catch {
    return undefined
  }
}

/** Tri-state host observation for one `file:` / `members:` key. G2.2 contract §1: `present`
 *  carries the kernel `id` of the exact bytes read; `absent` is established only by a verified
 *  negative lookup under a valid root; everything else is `unavailable`. The legacy `ownershipInput`
 *  oracle above stays as the `string | undefined` adaptation (`present → version`,
 *  `absent/unavailable → undefined`); the inverse mapping is forbidden. */
export function observeOwnershipInput(repoPath: string, key: string, seams: OwnershipObserveSeams = {}): OwnershipInputObservation {
  const prefix = key.startsWith("file:") ? "file:" : key.startsWith("members:") ? "members:" : undefined
  if (prefix === undefined) return { kind: "unavailable" }
  const relPath = key.slice(prefix.length)
  if (!relPath || relPath.includes("\\") || relPath.startsWith("/") || /^[A-Za-z]:/.test(relPath) ||
    relPath.split("/").some((part) => !part || part === "." || part === ".." || part === ".git" || part === ".atlas"))
    return { kind: "unavailable" }
  let root: string
  try { root = realpathSync(repoPath) } catch { return { kind: "unavailable" } }
  const lstat = seams.lstat ?? ((path: string) => { const st = lstatSync(path); return { size: st.size, isFile: st.isFile(), isDirectory: st.isDirectory(), isSymbolicLink: st.isSymbolicLink() } })
  const realLstat = (path: string) => { const st = lstatSync(path); return { size: st.size, isFile: st.isFile(), isDirectory: st.isDirectory(), isSymbolicLink: st.isSymbolicLink() } }
  const codeOf = (err: unknown): string | undefined => (err !== null && typeof err === "object" ? String((err as { code?: unknown }).code ?? "") : undefined)
  const ancestorAbsent = (rel: string): boolean | undefined => {
    const parts = rel.split("/")
    for (let i = 0; i < parts.length - 1; i++) {
      const abs = resolve(root, parts.slice(0, i + 1).join("/"))
      try {
        const st = realLstat(abs)
        if (st.isSymbolicLink) return false
        if (!st.isDirectory) return false
      } catch (err) {
        return codeOf(err) === "ENOENT" ? true : false
      }
    }
    return undefined
  }
  if (prefix === "members:") {
    const dir = relPath
    const missingAncestor = ancestorAbsent(dir)
    if (missingAncestor === true) return { kind: "absent" }
    if (missingAncestor === false) return { kind: "unavailable" }
    const dirAbs = resolve(root, dir)
    if (!isContainedIn(root, dirAbs)) return { kind: "unavailable" }
    let dirStat: { size: number; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }
    try { dirStat = lstat(dirAbs) } catch (err) {
      return codeOf(err) === "ENOENT" ? { kind: "absent" } : { kind: "unavailable" }
    }
    if (dirStat.isSymbolicLink || !dirStat.isDirectory) return { kind: "unavailable" }
    let strict: RunGitStrictResult
    try { strict = seams.gitMembers?.(repoPath, dir) ?? runGitStrict(repoPath, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", `:(literal)${dir}`]) }
    catch { return { kind: "unavailable" } }
    if (strict.truncated) return { kind: "unavailable" }
    if (strict.stderr !== "") return { kind: "unavailable" }
    if (strict.stdout !== "" && (!strict.stdout.endsWith("\0") || strict.stdout.includes("\n") || strict.stdout.includes("\r"))) return { kind: "unavailable" }
    const rawParts = strict.stdout === "" ? [] : strict.stdout.split("\0").slice(0, -1)
    if (rawParts.some((part) => part === "")) return { kind: "unavailable" }
    const candidates = [...new Set(rawParts)].sort()
    const effective: string[] = []
    for (const raw of candidates) {
      const abs = resolve(root, raw)
      if (!isContainedIn(root, abs)) return { kind: "unavailable" }
      let st: { size: number; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }
      try { st = lstat(abs) } catch (err) {
        if (codeOf(err) === "ENOENT") continue
        return { kind: "unavailable" }
      }
      if (st.isSymbolicLink) return { kind: "unavailable" }
      if (!st.isFile) return { kind: "unavailable" }
      effective.push(raw)
    }
    effective.sort()
    return { kind: "present", version: String(id({ kind: "ownership-membership", version: 2, bytes: Array.from(new TextEncoder().encode(effective.join("\0"))) })) }
  }
  const missingAncestor = ancestorAbsent(relPath)
  if (missingAncestor === true) return { kind: "absent" }
  if (missingAncestor === false) return { kind: "unavailable" }
  const requested = resolve(root, relPath)
  if (!isContainedIn(root, requested)) return { kind: "unavailable" }
  let st: { size: number; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }
  try { st = lstat(requested) } catch (err) {
    return codeOf(err) === "ENOENT" ? { kind: "absent" } : { kind: "unavailable" }
  }
  if (st.isSymbolicLink) return { kind: "unavailable" }
  if (!st.isFile) return { kind: "unavailable" }
  let bytes: Uint8Array
  try {
    if (seams.readBytes !== undefined) bytes = seams.readBytes(requested)
    else {
      const fd = openSync(requested, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
      try {
        const file = fstatSync(fd)
        if (!file.isFile()) return { kind: "unavailable" }
        bytes = readFileSync(fd)
      } finally { closeSync(fd) }
    }
  } catch { return { kind: "unavailable" } }
  if (bytes.length > 256000) return { kind: "unavailable" }
  return { kind: "present", version: String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) })) }
}

/** Legacy projection of a tri-state observation: `present(v) → v`, `absent`/`unavailable → undefined`.
 *  Must never be used to derive `absent` from the legacy oracle's `undefined` (that also covers
 *  invalid keys, refused paths, oversize and read failures). */
export function ownershipInputFromObservation(observation: OwnershipInputObservation): string | undefined {
  return observation.kind === "present" ? observation.version : undefined
}
