import { closeSync, constants, existsSync, fstatSync, openSync, readSync, realpathSync, statSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"

const MAX_SOURCE_BYTES = 120000

/** Preserve the fact/witness path contract: no absolute paths, empty/parent segments, backslashes or .git. */
export function safeRepoPath(path) {
  if (typeof path !== "string" || path.length === 0) return false
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false
  const segments = path.split("/")
  return segments.every((s) => s !== "" && s !== "..") && segments[0] !== ".git" && !segments.includes(".git")
}

/** Complete numbered source, or an explicit refusal. `name` is retained for caller compatibility only. */
export function excerpt(repo, file, name) {
  return readSource(repo, file, false)
}

/** Evidence construction must stop on unavailable source, rather than citing a refusal as source bytes. */
export function requireSourceExcerpt(repo, file, name) {
  return readSource(repo, file, true)
}

function readSource(repo, file, required) {
  const refuse = (reason) => {
    if (required) throw Object.assign(new Error(`judge source ${file}: ${reason}`), {
      name: "JudgeSourceReadError", code: "JUDGE_SOURCE_UNAVAILABLE",
    })
    return `(${file} ${reason})`
  }
  if (!safeRepoPath(file)) return refuse("refused: not a plain repo-relative path")
  const root = realpathSync(repo)
  const requested = resolve(root, file)
  if (!existsSync(requested)) return refuse("is not in the checkout")
  const source = realpathSync(requested)
  const path = relative(root, source)
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`))
    return refuse("refused: resolved source is outside the checkout")
  if (path.split(/[\\/]/).includes(".git")) return refuse("refused: resolved source is under .git")
  // A harmless-looking link must not expose credentials in a hidden file or directory.
  if (source !== requested && path.split(/[\\/]/).some((segment) => segment.startsWith(".")))
    return refuse("refused: symlink resolves to hidden source")
  if (!statSync(source).isFile()) return refuse("is not in the checkout")

  const fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) return refuse("is not in the checkout")
    if (stat.size > MAX_SOURCE_BYTES) throw tooLarge(file)
    // A bounded read also detects a file that grows after fstat, without allocating/reading its whole contents.
    const bytes = Buffer.alloc(MAX_SOURCE_BYTES + 1)
    let size = 0
    while (size < bytes.length) {
      const read = readSync(fd, bytes, size, bytes.length - size, size)
      if (read === 0) break
      size += read
    }
    if (size > MAX_SOURCE_BYTES) throw tooLarge(file)
    const lines = bytes.subarray(0, size).toString("utf8").split("\n")
    const body = lines.map((line, i) => `${i + 1}: ${line}`).join("\n")
    return `${file} (lines 1-${lines.length})\n\n\`\`\`\n${body}\n\`\`\``
  } finally {
    closeSync(fd)
  }
}

function tooLarge(file) {
  return Object.assign(new Error(`judge source ${file} exceeds ${MAX_SOURCE_BYTES} UTF-8 bytes; complete source required`), {
    name: "JudgeSourceTooLargeError",
    code: "JUDGE_SOURCE_TOO_LARGE",
  })
}
