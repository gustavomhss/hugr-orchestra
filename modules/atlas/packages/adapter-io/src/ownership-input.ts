import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { id } from "@atlas/kernel"
import type { OwnershipInputObservation as KnowledgeOwnershipInputObservation } from "@atlas/knowledge"
import { isContainedIn } from "./containment.js"
import { runGit } from "./run-git.js"
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
export function observeOwnershipInput(repoPath: string, key: string, seams?: OwnershipObserveSeams): OwnershipInputObservation {
  void repoPath
  void key
  void seams
  throw new Error("observeOwnershipInput not implemented (G2.2 red baseline)")
}

/** Legacy projection of a tri-state observation: `present(v) → v`, `absent`/`unavailable → undefined`.
 *  Must never be used to derive `absent` from the legacy oracle's `undefined` (that also covers
 *  invalid keys, refused paths, oversize and read failures). */
export function ownershipInputFromObservation(observation: OwnershipInputObservation): string | undefined {
  void observation
  throw new Error("ownershipInputFromObservation not implemented (G2.2 red baseline)")
}
