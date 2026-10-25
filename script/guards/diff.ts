// Reads the change under test from git: added lines per file, git status per path, and every removed line.
// Git is spawned with Bun.spawnSync like script/check-spawn-imports.ts; no spawning module is imported.

import { readFileSync } from "node:fs"
import path from "node:path"

export type Added = { line: number; text: string }

export type Change = {
  path: string
  // Git status letter: A, M, D, R, C or T.
  status: string
  from: string | undefined
  added: Added[]
}

export type Diff = {
  changes: Change[]
  // Trimmed text of every removed line. An added line identical to one of these is moved code, not new code.
  removed: Set<string>
}

const MAX_UNTRACKED_BYTES = 1_000_000

export function git(cwd: string, args: string[]) {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args])
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`)
  return result.stdout.toString()
}

export function tryGit(cwd: string, args: string[]) {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args])
  return result.exitCode === 0 ? result.stdout.toString() : undefined
}

// Same resolution as script/godfile.ts: the merge-base with the target branch, else the ref itself.
export function resolveBase(cwd: string, baseRef: string) {
  const base = tryGit(cwd, ["merge-base", baseRef, "HEAD"])?.trim()
  if (base) return base
  return tryGit(cwd, ["rev-parse", "--verify", `${baseRef}^{commit}`])?.trim()
}

export function readDiff(cwd: string, base: string): Diff {
  const statuses = parseStatuses(git(cwd, ["diff", "--name-status", "-z", "-M", "-l0", base]))
  const patch = parsePatch(
    git(cwd, ["-c", "core.quotepath=off", "diff", "-U0", "-M", "-l0", "--no-color", "--no-ext-diff", "--no-prefix", base]),
  )
  const tracked = statuses.map((entry) => ({ ...entry, added: patch.added.get(entry.path) ?? [] }))
  return { changes: [...tracked, ...untracked(cwd)], removed: patch.removed }
}

export function parseStatuses(output: string) {
  const fields = output.split("\0")
  const entries: { path: string; status: string; from: string | undefined }[] = []
  for (let index = 0; index < fields.length && fields[index]; ) {
    const status = fields[index]!.charAt(0)
    const pair = status === "R" || status === "C"
    entries.push({ status, from: pair ? fields[index + 1] : undefined, path: (pair ? fields[index + 2] : fields[index + 1]) ?? "" })
    index += pair ? 3 : 2
  }
  return entries.filter((entry) => entry.path.length > 0)
}

// Unified diff (-U0, --no-prefix) to added lines per new path plus the set of removed lines.
export function parsePatch(patch: string) {
  const added = new Map<string, Added[]>()
  const removed = new Set<string>()
  let current: string | undefined
  let line = 0
  let inHunk = false
  for (const text of patch.split("\n")) {
    if (text.startsWith("diff --git ")) {
      current = undefined
      inHunk = false
      continue
    }
    if (!inHunk && text.startsWith("+++ ")) {
      current = text === "+++ /dev/null" ? undefined : text.slice(4)
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
    if (hunk) {
      inHunk = true
      line = Number(hunk[1])
      continue
    }
    if (!inHunk) continue
    if (text.startsWith("+")) {
      if (current) added.set(current, [...(added.get(current) ?? []), { line, text: text.slice(1) }])
      line += 1
      continue
    }
    if (text.startsWith("-")) removed.add(text.slice(1).trim())
  }
  return { added, removed }
}

// A new file that git does not track yet has no diff. Read it whole so a local run sees it.
function untracked(cwd: string): Change[] {
  return git(cwd, ["ls-files", "-o", "--exclude-standard", "-z"])
    .split("\0")
    .filter((file) => file.length > 0)
    .flatMap((file) => {
      const text = readText(path.join(cwd, file))
      if (text === undefined) return []
      return [
        {
          path: file,
          status: "A",
          from: undefined,
          added: text.split("\n").map((content, index) => ({ line: index + 1, text: content })),
        },
      ]
    })
}

function readText(file: string) {
  try {
    const buffer = readFileSync(file)
    if (buffer.length > MAX_UNTRACKED_BYTES || buffer.includes(0)) return undefined
    return buffer.toString("utf8")
  } catch {
    return undefined
  }
}
