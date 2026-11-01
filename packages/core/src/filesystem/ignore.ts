import { Glob } from "../util/glob"

const FOLDERS = new Set([
  "node_modules",
  "bower_components",
  ".pnpm-store",
  "vendor",
  ".npm",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  "bin",
  "obj",
  ".git",
  ".svn",
  ".hg",
  ".vscode",
  ".idea",
  ".turbo",
  ".output",
  "desktop",
  ".sst",
  ".cache",
  ".webkit-cache",
  "__pycache__",
  ".pytest_cache",
  "mypy_cache",
  ".history",
  ".gradle",
])

const FILES = [
  "**/*.swp",
  "**/*.swo",
  "**/*.pyc",
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/logs/**",
  "**/tmp/**",
  "**/temp/**",
  "**/*.log",
  "**/coverage/**",
  "**/.nyc_output/**",
]

// Folders that only ever hold dependencies, caches, VCS data or build output. The watcher takes a bare name as one path
// at the watched root, so these also go as globs to drop them at any depth: a nested package's `node_modules` or a
// nested checkout's `.git` would otherwise stream every write into the server. The other FOLDERS stay root-only there,
// since names like `desktop`, `bin` or `build` are source folders in nested packages.
const GENERATED = [
  "node_modules",
  "bower_components",
  ".pnpm-store",
  ".npm",
  "dist",
  ".next",
  "target",
  ".git",
  ".svn",
  ".hg",
  ".turbo",
  ".output",
  ".sst",
  ".cache",
  ".webkit-cache",
  "__pycache__",
  ".pytest_cache",
  "mypy_cache",
  ".gradle",
]

export const PATTERNS = [...FILES, ...FOLDERS, ...GENERATED.map((name) => `**/${name}/**`)]

export function match(filepath: string, opts?: { extra?: string[]; whitelist?: string[] }) {
  for (const pattern of opts?.whitelist || []) {
    if (Glob.match(pattern, filepath)) return false
  }

  const parts = filepath.split(/[/\\]/)
  for (const part of parts) {
    if (FOLDERS.has(part)) return true
  }

  for (const pattern of [...FILES, ...(opts?.extra || [])]) {
    if (Glob.match(pattern, filepath)) return true
  }

  return false
}

export * as Ignore from "./ignore"
