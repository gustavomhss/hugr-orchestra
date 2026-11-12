import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { id } from "@atlas/kernel"
import type { OwnershipInputObservation as KnowledgeOwnershipInputObservation } from "@atlas/knowledge"
import { isContainedIn } from "./containment.js"
import { runGitStrict } from "./run-git.js"
import type { RunGitStrictResult } from "./run-git.js"

// File bytes expand into a number array and canonical JSON before hashing; keep this below the transport body cap.
export const ownershipInputMaxBytes = 2 * 1024 * 1024

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

/** Host-bound input oracle: the §1.1 adaptation of the tri-state observer
 *  (`present → version`, `absent`/`unavailable → undefined`). Never the inverse. */
export function ownershipInput(repoPath: string, key: string): string | undefined {
  try {
    return ownershipInputFromObservation(observeOwnershipInput(repoPath, key))
  } catch {
    return undefined
  }
}

const isAllowedRel = (relPath: string): boolean =>
  !(relPath.includes("\\") || relPath.startsWith("/") || /^[A-Za-z]:/.test(relPath) ||
    relPath.split("/").some((part) => !part || part === "." || part === ".." || part === ".git" || part === ".atlas"))

/** Tri-state host observation for one `file:` / `members:` key. G2.2 contract §1: `present`
 *  carries the kernel `id` of the exact bytes read; `absent` is established only by a verified
 *  negative lookup under a valid root (corroborated by a successful enumeration of the existing
 *  ancestor with identity checks); everything else is `unavailable`. */
export function observeOwnershipInput(repoPath: string, key: string, seams: OwnershipObserveSeams = {}): OwnershipInputObservation {
  const prefix = key.startsWith("file:") ? "file:" : key.startsWith("members:") ? "members:" : undefined
  if (prefix === undefined) return { kind: "unavailable" }
  const relPath = key.slice(prefix.length)
  if (!relPath || !isAllowedRel(relPath)) return { kind: "unavailable" }
  let root: string
  try { root = realpathSync(repoPath) } catch { return { kind: "unavailable" } }
  const lstat = seams.lstat ?? ((path: string) => { const st = lstatSync(path); return { size: st.size, isFile: st.isFile(), isDirectory: st.isDirectory(), isSymbolicLink: st.isSymbolicLink() } })
  const realLstat = (path: string) => { const st = lstatSync(path); return { size: st.size, isFile: st.isFile(), isDirectory: st.isDirectory(), isSymbolicLink: st.isSymbolicLink() } }
  const readdir = seams.readdir ?? ((path: string) => readdirSync(path))
  const codeOf = (err: unknown): string | undefined => (err !== null && typeof err === "object" ? String((err as { code?: unknown }).code ?? "") : undefined)
  const corroborateAbsent = (rel: string): OwnershipInputObservation => {
    const parts = rel.split("/")
    for (let i = parts.length - 1; i >= 0; i--) {
      const ancestor = i === 0 ? root : resolve(root, parts.slice(0, i).join("/"))
      try {
        const before = lstatSync(ancestor)
        if (!before.isDirectory() || before.isSymbolicLink()) break
        const listing = readdir(ancestor)
        const after = lstatSync(ancestor)
        if (after.ino !== before.ino) return { kind: "unavailable" }
        if (i < parts.length && listing.includes(parts[i] as string)) return { kind: "unavailable" }
        return { kind: "absent" }
      } catch (err) {
        if (codeOf(err) === "ENOENT") continue
        return { kind: "unavailable" }
      }
    }
    return { kind: "unavailable" }
  }
  const corroborateCandidateAbsent = (rel: string): boolean => corroborateAbsent(rel).kind === "absent"
  type AncestorVerdict = "absent" | "unavailable" | undefined
  const ancestorAbsent = (rel: string): AncestorVerdict => {
    const parts = rel.split("/")
    for (let i = 0; i < parts.length - 1; i++) {
      const abs = resolve(root, parts.slice(0, i + 1).join("/"))
      try {
        const st = realLstat(abs)
        if (st.isSymbolicLink) return "unavailable"
        if (!st.isDirectory) return "unavailable"
      } catch (err) {
        if (codeOf(err) === "ENOENT") return "absent"
        return "unavailable"
      }
    }
    return undefined
  }
  const symlinkInPath = (rel: string): boolean => {
    const parts = rel.split("/")
    for (let i = 0; i < parts.length; i++) {
      const abs = resolve(root, parts.slice(0, i + 1).join("/"))
      try {
        const st = realLstat(abs)
        if (st.isSymbolicLink) return true
      } catch {
        return false
      }
    }
    return false
  }
  if (prefix === "members:") {
    const dir = relPath
    const ancestor = ancestorAbsent(dir)
    if (ancestor === "unavailable") return { kind: "unavailable" }
    if (ancestor === "absent") return corroborateAbsent(dir)
    const dirAbs = resolve(root, dir)
    if (!isContainedIn(root, dirAbs)) return { kind: "unavailable" }
    let dirStat: { size: number; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }
    try { dirStat = realLstat(dirAbs) } catch (err) {
      return codeOf(err) === "ENOENT" ? corroborateAbsent(dir) : { kind: "unavailable" }
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
      if (!isAllowedRel(raw)) return { kind: "unavailable" }
      const abs = resolve(root, raw)
      if (!isContainedIn(root, abs)) return { kind: "unavailable" }
      if (symlinkInPath(raw)) return { kind: "unavailable" }
      let st: { size: number; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }
      try { st = lstat(abs) } catch (err) {
        if (codeOf(err) !== "ENOENT") return { kind: "unavailable" }
        if (!corroborateCandidateAbsent(raw)) return { kind: "unavailable" }
        continue
      }
      if (st.isSymbolicLink) return { kind: "unavailable" }
      if (!st.isFile) return { kind: "unavailable" }
      effective.push(raw)
    }
    try {
      const stillThere = realLstat(dirAbs)
      if (stillThere.isSymbolicLink || !stillThere.isDirectory) return { kind: "unavailable" }
    } catch { return { kind: "unavailable" } }
    effective.sort()
    return { kind: "present", version: String(id({ kind: "ownership-membership", version: 2, bytes: Array.from(new TextEncoder().encode(effective.join("\0"))) })) }
  }
  const missingAncestor = ancestorAbsent(relPath)
  if (missingAncestor === "unavailable") return { kind: "unavailable" }
  if (missingAncestor === "absent") return corroborateAbsent(relPath)
  const requested = resolve(root, relPath)
  if (!isContainedIn(root, requested)) return { kind: "unavailable" }
  let st: { size: number; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }
  try { st = lstat(requested) } catch (err) {
    return codeOf(err) === "ENOENT" ? corroborateAbsent(relPath) : { kind: "unavailable" }
  }
  if (st.isSymbolicLink) return { kind: "unavailable" }
  if (!st.isFile) return { kind: "unavailable" }
  let before: ReturnType<typeof lstatSync>
  try { before = lstatSync(requested) } catch { return { kind: "unavailable" } }
  let bytes: Uint8Array
  try {
    if (seams.readBytes !== undefined) bytes = seams.readBytes(requested)
    else {
      const fd = openSync(requested, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
      try {
        const file = fstatSync(fd)
        if (!file.isFile()) return { kind: "unavailable" }
        const chunks: Buffer[] = []
        let total = 0
        const probe = Buffer.alloc(8192)
        for (;;) {
          const n = readSync(fd, probe, 0, probe.length, null)
          if (n === 0) break
          total += n
          if (total > ownershipInputMaxBytes) return { kind: "unavailable" }
          chunks.push(Buffer.from(probe.subarray(0, n)))
        }
        bytes = Buffer.concat(chunks, total)
      } finally { closeSync(fd) }
    }
  } catch { return { kind: "unavailable" } }
  let after: ReturnType<typeof lstatSync>
  try { after = lstatSync(requested) } catch { return { kind: "unavailable" } }
  if (after.ino !== before.ino || after.size !== before.size) return { kind: "unavailable" }
  if (bytes.length > ownershipInputMaxBytes) return { kind: "unavailable" }
  return { kind: "present", version: String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) })) }
}

/** Legacy projection of a tri-state observation: `present(v) → v`, `absent`/`unavailable → undefined`.
 *  Must never be used to derive `absent` from the legacy oracle's `undefined` (that also covers
 *  invalid keys, refused paths, oversize and read failures). */
export function ownershipInputFromObservation(observation: OwnershipInputObservation): string | undefined {
  return observation.kind === "present" ? observation.version : undefined
}
