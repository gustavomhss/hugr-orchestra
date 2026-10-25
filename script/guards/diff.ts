// Reads the change under test from git: added lines per file, git status per path, and every removed line.
// Git is spawned with Bun.spawnSync like script/check-spawn-imports.ts; no spawning module is imported.

import { readFileSync, statSync } from "node:fs"
import path from "node:path"

export type Added = { line: number; text: string }

export type Change = {
  path: string
  // Git status letter: A, M, D, R, C or T.
  status: string
  from: string | undefined
  added: Added[]
  // New git mode (100644 file, 100755 executable, 120000 symlink, 160000 submodule). Absent means a plain file.
  mode?: string
  // Size in bytes of the new blob. Absent for deletions and submodules.
  size?: number
  // git treats the file as binary (numstat reports it without line counts).
  binary?: boolean
  // The file starts with a #! line. Only read for executable files.
  shebang?: boolean
  // Trimmed text of the lines the change removes from this file.
  removedLines?: string[]
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

// The change from `base` to the working tree, or, when `head` is given, from `base` to that commit (history scans).
export function readDiff(cwd: string, base: string, head?: string): Diff {
  const range = head ? [base, head] : [base]
  const entries = parseRaw(git(cwd, ["diff", "--raw", "-z", "-M", "-l0", "--no-abbrev", ...range]))
  const binary = parseBinary(git(cwd, ["diff", "--numstat", "-z", "-M", "-l0", ...range]))
  const patch = parsePatch(
    git(cwd, ["-c", "core.quotepath=off", "diff", "-U0", "-M", "-l0", "--no-color", "--no-ext-diff", "--no-prefix", ...range]),
  )
  const sizes = blobSizes(
    cwd,
    entries.filter((entry) => entry.status !== "D" && entry.mode !== "160000").map((entry) => entry.sha),
  )
  const tracked = entries.map((entry) => ({
    path: entry.path,
    status: entry.status,
    from: entry.from,
    added: patch.added.get(entry.path) ?? [],
    removedLines: patch.removedBy.get(entry.path) ?? [],
    mode: entry.mode,
    size: sizes.get(entry.sha),
    binary: binary.has(entry.path),
    // Only an executable can be missing its shebang, so only those blobs are read.
    shebang: entry.mode === "100755" ? (tryGit(cwd, ["cat-file", "blob", entry.sha]) ?? "").startsWith("#!") : undefined,
  }))
  return { changes: head ? tracked : [...tracked, ...untracked(cwd)], removed: patch.removed }
}

// `git diff --raw -z --no-abbrev`: `:<old mode> <new mode> <old sha> <new sha> <status>` then the path (two for R and C).
export function parseRaw(output: string) {
  const fields = output.split("\0")
  const entries: { path: string; status: string; from: string | undefined; mode: string; sha: string }[] = []
  for (let index = 0; index < fields.length && fields[index]?.startsWith(":"); ) {
    const meta = fields[index]!.slice(1).split(" ")
    const status = (meta[4] ?? "").charAt(0)
    const pair = status === "R" || status === "C"
    entries.push({
      status,
      from: pair ? fields[index + 1] : undefined,
      path: (pair ? fields[index + 2] : fields[index + 1]) ?? "",
      mode: meta[1] ?? "100644",
      sha: meta[3] ?? "",
    })
    index += pair ? 3 : 2
  }
  return entries.filter((entry) => entry.path.length > 0)
}

// `git diff --numstat -z`: `<added>\t<deleted>\t<path>`, or `<added>\t<deleted>\t` then two paths for a rename. A binary file has `-` counts.
export function parseBinary(output: string) {
  const fields = output.split("\0")
  const binary = new Set<string>()
  for (let index = 0; index < fields.length && fields[index]; ) {
    const columns = fields[index]!.split("\t")
    const renamed = columns[2] === ""
    const file = renamed ? fields[index + 2] : columns[2]
    if (columns[0] === "-" && file) binary.add(file)
    index += renamed ? 3 : 1
  }
  return binary
}

function blobSizes(cwd: string, shas: string[]) {
  const sizes = new Map<string, number>()
  const wanted = shas.filter((sha) => sha.length > 0 && !/^0+$/.test(sha))
  if (wanted.length === 0) return sizes
  const output = Bun.spawnSync(["git", "-C", cwd, "cat-file", "--batch-check"], {
    stdin: Buffer.from(wanted.join("\n") + "\n"),
  }).stdout.toString()
  for (const line of output.split("\n")) {
    const columns = line.split(" ")
    if (columns[1] === "blob") sizes.set(columns[0]!, Number(columns[2]))
  }
  return sizes
}

// Unified diff (-U0, --no-prefix) to added lines per new path plus the set of removed lines.
export function parsePatch(patch: string) {
  const added = new Map<string, Added[]>()
  const removed = new Set<string>()
  const removedBy = new Map<string, string[]>()
  let current: string | undefined
  let previous: string | undefined
  let line = 0
  let inHunk = false
  for (const text of patch.split("\n")) {
    if (text.startsWith("diff --git ")) {
      current = undefined
      previous = undefined
      inHunk = false
      continue
    }
    if (!inHunk && text.startsWith("--- ")) {
      previous = text === "--- /dev/null" ? undefined : text.slice(4)
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
    if (text.startsWith("-")) {
      removed.add(text.slice(1).trim())
      const owner = current ?? previous
      if (owner) removedBy.set(owner, [...(removedBy.get(owner) ?? []), text.slice(1).trim()])
    }
  }
  return { added, removed, removedBy }
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
          mode: (statSync(path.join(cwd, file)).mode & 0o111) === 0 ? "100644" : "100755",
          size: Buffer.byteLength(text),
          binary: false,
          shebang: text.startsWith("#!"),
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
