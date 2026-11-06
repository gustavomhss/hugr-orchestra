import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { id } from "@atlas/kernel"
import { isContainedIn } from "./containment.js"
import { runGit } from "./run-git.js"

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
