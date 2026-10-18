export * as CodeIndexFilter from "./filter"

// Transplanted from Arsenal onboard/filter.ts (TechLead a68e7af, HuGR Labs, Apache-2.0). The language filter runs
// before every skip and every cap, so a file the index cannot parse never takes a slot (P0-3); there is no file cap.

/** The tree-sitter grammar a path parses with. `.js` and `.jsx` use the TSX grammar, which accepts plain JS and JSX. */
export type Grammar = "typescript" | "tsx" | "python"

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
}

export const SKIP_SEGMENTS = new Set([
  "node_modules", ".git", "vendor", "third_party", "third-party", "legacy", ".venv", "venv", ".tox", "build",
  "coverage", ".next", "out", ".cache", "__pycache__", ".pytest_cache", ".mypy_cache", ".gradle", "captured",
  "snapshots", "__snapshots__", "testdata", "test-data", "golden",
])
export const GENERATED_SUFFIXES = [".min.js", ".map", ".d.ts", ".d.mts", ".d.cts", ".generated.ts", ".generated.js", "_pb2.py"]

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

function skip(path: string) {
  const segments = path.split("/")
  const base = segments.at(-1) ?? ""
  if (segments.some((segment) => SKIP_SEGMENTS.has(segment))) return "vendored-or-build"
  if (segments.some(isGeneratedSegment) || GENERATED_SUFFIXES.some((suffix) => base.endsWith(suffix))) return "generated"
  return undefined
}
