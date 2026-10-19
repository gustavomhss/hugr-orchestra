export * as CodeIndexFilter from "./filter"

// Transplanted from the HuGR techlead onboard/filter.ts (a68e7af, MIT): the generated, vendored, lockfile and
// binary skips and shouldRead. Changes: the language filter runs before every skip and every cap, so a file the index
// cannot parse never takes a slot (P0-3); a skipped source file keeps its reason; there is no file cap.

/** The tree-sitter grammar a path parses with. `.js` and `.jsx` use the TSX grammar, which accepts plain JS and JSX. */
export type Grammar = "typescript" | "tsx" | "python" | "go" | "rust"

const GRAMMARS: Record<string, Grammar> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "tsx",
  ".jsx": "tsx",
  ".mjs": "tsx",
  ".cjs": "tsx",
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
  ".rs": "rust",
}

export const SKIP_SEGMENTS = new Set([
  "node_modules", ".git", "vendor", "third_party", "third-party", "legacy", ".venv", "venv", ".tox", "build",
  "coverage", ".next", "out", ".cache", "__pycache__", ".pytest_cache", ".mypy_cache", ".gradle", "captured",
  "snapshots", "__snapshots__", "testdata", "test-data", "golden",
])
export const LOCKFILE_BASENAMES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock", "Gemfile.lock", "composer.lock", "bun.lock", "bun.lockb"])
export const GENERATED_SUFFIXES = [".min.js", ".min.css", ".map", ".d.ts", ".d.mts", ".d.cts", ".generated.ts", ".generated.js", "_pb2.py", ".pb.go"] as const
export const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".pdf", ".zip", ".tar", ".gz", ".tgz", ".bz2", ".woff",
  ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".mov", ".avi", ".mp3", ".wav", ".wasm", ".so", ".dylib", ".dll", ".exe",
  ".bin", ".parquet", ".sqlite", ".db", ".csv", ".tsv", ".lock",
])

export function grammar(path: string): Grammar | undefined {
  const base = path.slice(path.lastIndexOf("/") + 1)
  const dot = base.lastIndexOf(".")
  return dot > 0 ? GRAMMARS[base.slice(dot).toLowerCase()] : undefined
}

export function isGeneratedSegment(segment: string) {
  return /^_gen(?:v?\d|[-_])/.test(segment) || ["_gen", "generated", "__generated__", "_generated", "generated-effect"].includes(segment)
}

/**
 * Splits repository-relative POSIX paths into the files the index parses and the supported-language files it skips,
 * each with a reason. Paths in no supported language are left out entirely: they are not index coverage.
 */
export function select(paths: Iterable<string>, grammars: ReadonlySet<Grammar> = new Set(Object.values(GRAMMARS))) {
  const files: Array<{ path: string; grammar: Grammar }> = []
  const skipped: Array<{ path: string; reason: string }> = []
  for (const path of paths) {
    const kind = grammar(path)
    if (!kind || !grammars.has(kind)) continue
    const reason = skip(path)
    if (reason) skipped.push({ path, reason })
    if (!reason) files.push({ path, grammar: kind })
  }
  return { files, skipped }
}

/** True when `path` (POSIX, repository-relative) is worth reading: not generated, vendored, a lockfile or binary. */
export function shouldRead(path: string) {
  return skip(path) === undefined
}

function skip(path: string) {
  const segments = path.split("/")
  const base = segments.at(-1) ?? ""
  if (segments.some((segment) => SKIP_SEGMENTS.has(segment))) return "vendored-or-build"
  if (segments.some(isGeneratedSegment) || GENERATED_SUFFIXES.some((suffix) => base.endsWith(suffix))) return "generated"
  if (LOCKFILE_BASENAMES.has(base)) return "lockfile"
  const dot = base.lastIndexOf(".")
  if (dot !== -1 && BINARY_EXTENSIONS.has(base.slice(dot).toLowerCase())) return "binary"
  return undefined
}
